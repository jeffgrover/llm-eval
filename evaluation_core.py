"""Shared evaluator lifecycle, metadata, and local-server support."""

import os
import signal
import subprocess
import threading
import time
import shutil
import sys
import json
import re
import platform
import urllib.request
import urllib.error
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, List, Optional, TextIO

from evaluation_metrics import TokenUsage, TokenUsageCollector
from evaluation_report import generate_html_report
from run_safety import (
    DEFAULT_MAX_IDLE_SECONDS,
    DEFAULT_MAX_SECONDS,
    RunSafetyLimits,
    RunSafetyMonitor,
    RunSafetyTermination,
    RunTermination,
)

# --- Configuration & Constants ---
LM_STUDIO_API_URL = "http://localhost:1234/v1"
LM_STUDIO_REST_BASE = "http://localhost:1234"
LLAMA_SERVER_API_URL = "http://localhost:8080/v1"
OMLX_API_URL = os.environ.get("OMLX_BASE_URL", "http://localhost:8000/v1")
EVALS_DIR = Path("evals")
PROJECT_ROOT = Path(__file__).resolve().parent
SERVER_LOG_FILENAME = "SERVER.LOG"
CHAT_SESSION_FILENAME = "CHAT_SESSION.TXT"
CODEX_EVENTS_FILENAME = "CODEX_EVENTS.JSONL"
CODEX_LAST_MESSAGE_FILENAME = "CODEX_LAST_MESSAGE.TXT"
DEFAULT_LOCAL_CONTEXT_LIMIT = 32768
# Reasoning models (e.g. Qwen 3.8) spend internal thinking tokens out of the
# response budget, so 16K can be consumed entirely by reasoning before any
# visible output or tool call is produced.
DEFAULT_LOCAL_OUTPUT_LIMIT = 32768


def get_omlx_api_key() -> str:
    """Use an explicit override, then the key from oMLX's local settings."""
    configured_key = os.environ.get("OMLX_API_KEY")
    if configured_key:
        return configured_key
    try:
        settings_path = Path.home() / ".omlx" / "settings.json"
        settings = json.loads(settings_path.read_text(encoding="utf-8"))
        api_key = settings.get("auth", {}).get("api_key")
        if isinstance(api_key, str) and api_key:
            return api_key
    except (OSError, json.JSONDecodeError, AttributeError):
        pass
    # oMLX accepts any placeholder when API-key verification is disabled.
    return "omlx"


OMLX_API_KEY = get_omlx_api_key()


@dataclass(frozen=True)
class LocalProviderConfig:
    """Connection details for one local OpenAI-compatible provider."""

    provider_id: str
    display_name: str
    api_url: str
    api_key: str
    supports_lms_cli: bool = False


LM_STUDIO_PROVIDER = LocalProviderConfig(
    provider_id="lmstudio",
    display_name="LM Studio (local)",
    api_url=LM_STUDIO_API_URL,
    api_key="lm-studio",
    supports_lms_cli=True,
)
LLAMA_SERVER_PROVIDER = LocalProviderConfig(
    provider_id="llama-server",
    display_name="llama-server (local)",
    api_url=LLAMA_SERVER_API_URL,
    api_key="llama-server",
)
OMLX_PROVIDER = LocalProviderConfig(
    provider_id="omlx",
    display_name="oMLX (local)",
    api_url=OMLX_API_URL,
    api_key=OMLX_API_KEY,
)


def is_llama_server_provider(provider: Optional[str]) -> bool:
    return (provider or "").lower().strip() == "llama-server"


def is_omlx_provider(provider: Optional[str]) -> bool:
    return (provider or "").lower().strip() == "omlx"


def use_llama_server_provider() -> LocalProviderConfig:
    """Return the llama-server configuration."""
    return LLAMA_SERVER_PROVIDER


def use_omlx_provider() -> LocalProviderConfig:
    """Return the oMLX configuration."""
    return OMLX_PROVIDER


def get_local_provider(provider: Optional[str]) -> LocalProviderConfig:
    """Resolve a local-provider flag without mutating process-wide state."""
    if is_llama_server_provider(provider):
        return LLAMA_SERVER_PROVIDER
    if is_omlx_provider(provider):
        return OMLX_PROVIDER
    return LM_STUDIO_PROVIDER


def get_env_int(name: str, default: int, minimum: int = 1) -> int:
    """Read a positive integer environment override with a safe fallback."""
    value = os.environ.get(name)
    if not value:
        return default
    try:
        parsed = int(value)
        if parsed >= minimum:
            return parsed
    except ValueError:
        pass
    print(f"[-] Ignoring invalid {name}={value!r}; using {default}.")
    return default


def read_prompt_file(prompt_file: Path) -> str:
    """Read the evaluation prompt exactly as written on disk."""
    with open(prompt_file, "r", encoding="utf-8") as f:
        return f.read()


def send_stdin(process: subprocess.Popen, input_text: Optional[str]) -> None:
    """Send prompt text to a child process without putting it on the command line.

    The write happens on a background thread so the caller can start draining
    stdout immediately. Writing inline would deadlock on large prompts: once the
    prompt exceeds the OS pipe buffer (~16 KB on macOS) and the child's stdout
    pipe also fills during startup, both processes block waiting on each other.
    """
    if input_text is None or process.stdin is None:
        return

    def _write():
        try:
            process.stdin.write(input_text)
            process.stdin.close()
        except (BrokenPipeError, ValueError):
            pass

    threading.Thread(target=_write, daemon=True).start()


def _linux_descendant_pids(root_pid: int) -> List[int]:
    """Snapshot descendants, including children in their own process groups."""
    if not sys.platform.startswith("linux"):
        return []
    descendants = []
    pending = [root_pid]
    seen = {root_pid}
    while pending:
        parent_pid = pending.pop()
        children_path = Path(
            f"/proc/{parent_pid}/task/{parent_pid}/children"
        )
        try:
            child_pids = [
                int(value)
                for value in children_path.read_text(encoding="ascii").split()
            ]
        except (OSError, ValueError):
            continue
        for child_pid in child_pids:
            if child_pid in seen:
                continue
            seen.add(child_pid)
            descendants.append(child_pid)
            pending.append(child_pid)
    return descendants


def stop_process_tree(process: subprocess.Popen) -> None:
    """Force-stop a subprocess and descendants that created new process groups."""
    if process.poll() is not None:
        return

    descendants = _linux_descendant_pids(process.pid)
    if os.name == "nt":
        try:
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(process.pid)],
                check=False,
                capture_output=True,
                timeout=10,
            )
            return
        except (OSError, subprocess.TimeoutExpired):
            process.kill()
            return

    try:
        os.killpg(process.pid, signal.SIGKILL)
    except (OSError, ProcessLookupError):
        try:
            process.kill()
        except (OSError, ProcessLookupError):
            pass

    # Some agent tool runners call setsid(), escaping the agent's group. Kill
    # the descendant snapshot explicitly after the root can no longer spawn.
    for child_pid in reversed(descendants):
        try:
            os.kill(child_pid, signal.SIGKILL)
        except (OSError, ProcessLookupError):
            pass


def safe_stdout_write(text: str) -> None:
    """Write text to the console even when Windows uses a legacy code page."""
    try:
        sys.stdout.write(text)
    except UnicodeEncodeError:
        encoding = sys.stdout.encoding or "utf-8"
        sys.stdout.write(text.encode(encoding, errors="backslashreplace").decode(encoding))
    sys.stdout.flush()


def format_display_cmd(cmd: List[str], prompt_placeholder: Optional[str] = None) -> str:
    """Format a command for logs without dumping the full prompt."""
    if prompt_placeholder is None:
        return " ".join(cmd)
    return f"{' '.join(cmd)} {prompt_placeholder}".strip()

# Claude model friendly name -> API model ID mapping
CLAUDE_MODEL_IDS = {
    "opus 4.6": "claude-opus-4-6",
    "sonnet 4.6": "claude-sonnet-4-6",
    "haiku 4.5": "claude-haiku-4-5-20251001",
    "opus 4": "claude-opus-4-20250514",
    "sonnet 4": "claude-sonnet-4-20250514",
    "sonnet 3.5": "claude-3-5-sonnet-20241022",
    "haiku 3.5": "claude-3-5-haiku-20241022",
}

# --- LM Studio Client ---


def lms_api_request(
    path: str, method: str = "GET", data: dict = None, timeout: int = 15
) -> Optional[dict]:
    """Makes an HTTP request to the LM Studio REST API. Returns parsed JSON or None on failure."""
    url = f"{LM_STUDIO_REST_BASE}{path}"
    try:
        body = json.dumps(data).encode("utf-8") if data else None
        req = urllib.request.Request(url, data=body, method=method)
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (
        urllib.error.URLError,
        urllib.error.HTTPError,
        OSError,
        json.JSONDecodeError,
    ) as e:
        print(f"[-] LM Studio API request failed ({method} {path}): {e}")
        return None


def get_lms_loaded_context_length(model_key: str) -> Optional[int]:
    """Return the context length of a loaded LM Studio instance for a model, if known."""
    models = lms_api_request("/api/v0/models")
    if models is None:
        return None
    model_list = (
        models
        if isinstance(models, list)
        else models.get("data", models.get("models", []))
    )
    for entry in model_list:
        model_id = entry.get("id", entry.get("path", ""))
        if model_key not in model_id or entry.get("state", "") != "loaded":
            continue
        candidates = [entry, *(entry.get("loaded_instances") or [])]
        for candidate in candidates:
            context = candidate.get("loaded_context_length") or candidate.get(
                "context_length"
            )
            if isinstance(context, int) and context > 0:
                return context
            config = candidate.get("config") or candidate.get("load_config") or {}
            context = config.get("context_length")
            if isinstance(context, int) and context > 0:
                return context
    return None


def load_lms_model(
    model_key: str,
    *,
    context_length: Optional[int] = None,
    eval_batch_size: Optional[int] = None,
    flash_attention: bool = False,
    cpu_kv_cache: bool = False,
) -> bool:
    """Loads a model into LM Studio, preferring the REST API over the CLI."""
    load_config = {}
    if context_length is not None:
        load_config["context_length"] = context_length
    if eval_batch_size is not None:
        load_config["eval_batch_size"] = eval_batch_size
    if flash_attention:
        load_config["flash_attention"] = True
    if cpu_kv_cache:
        load_config["offload_kv_cache_to_gpu"] = False

    # Try REST API first
    models = lms_api_request("/api/v0/models")
    if models is not None:
        # REST API is reachable — use it exclusively
        model_list = (
            models
            if isinstance(models, list)
            else models.get("data", models.get("models", []))
        )

        target_loaded = False
        others_loaded = []

        for m in model_list:
            model_id = m.get("id", m.get("path", ""))
            state = m.get("state", "")
            if model_key in model_id:
                if state == "loaded":
                    if load_config:
                        others_loaded.append(m)
                        print(
                            f"[*] Reloading model '{model_key}' to apply explicit "
                            "LM Studio load settings."
                        )
                    else:
                        target_loaded = True
                        print(
                            f"[+] Model '{model_key}' is already loaded — skipping reload."
                        )
            elif state == "loaded":
                others_loaded.append(m)

        # Unload other models first
        for other in others_loaded:
            other_id = other.get("id", other.get("path", ""))
            instance_id = other.get("instance_id", other_id)
            print(f"[*] Unloading other model: {other_id}")
            lms_api_request(
                "/api/v1/models/unload",
                method="POST",
                data={"instance_id": instance_id},
            )

        if target_loaded:
            return True  # Already loaded, nothing to do

        print(f"[*] Loading model '{model_key}' via REST API...")
        load_request = {"model": model_key, **load_config}
        if load_config:
            load_request["echo_load_config"] = True
        result = lms_api_request(
            "/api/v1/models/load", method="POST", data=load_request, timeout=120
        )
        if result is not None:
            print(f"[+] Model '{model_key}' loaded successfully via REST API.")
            if result.get("load_config"):
                print(f"[+] Applied LM Studio load config: {result['load_config']}")
            return True
        print("[-] REST API load failed. Falling back to CLI...")

    # Fallback: try the lms CLI (may hang on Windows)
    print("[*] REST API not available, falling back to lms CLI...")
    print("[*] Unloading any existing models...")
    lms_cli_available = True
    try:
        subprocess.run(["lms", "unload", "--all"], check=True, text=True, timeout=30)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        print("[-] Warning: Failed to unload models via CLI, attempting to proceed...")
        lms_cli_available = False
    except FileNotFoundError:
        print(
            "[-] 'lms' command not found. Please ensure LM Studio CLI is installed and bootstrapped."
        )
        sys.exit(1)

    print(f"[*] Loading model '{model_key}' into LM Studio...")
    cmd = ["lms", "load", model_key, "-y"]

    try:
        subprocess.run(cmd, check=True, text=True, timeout=120)
        print(f"[+] Model '{model_key}' loaded successfully.")
        return lms_cli_available
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        print(f"[-] Failed to load model via CLI: {e}")
        sys.exit(1)
    except FileNotFoundError:
        print(
            "[-] 'lms' command not found. Please ensure LM Studio CLI is installed and bootstrapped."
        )
        sys.exit(1)


# --- Metadata & Reporting ---


class MetadataCollector:
    @staticmethod
    def get_hardware_info() -> Dict[str, str]:
        info = {
            "Machine": platform.machine(),
            "Processor": platform.processor(),
            "System": platform.system(),
            "Release": platform.release(),
        }
        if sys.platform == "darwin":
            try:
                # Try to get detailed Mac info
                cmd = ["system_profiler", "SPHardwareDataType"]
                result = subprocess.run(cmd, capture_output=True, text=True)
                output = result.stdout

                chip_match = re.search(r"Chip:\s+(.+)", output)
                mem_match = re.search(r"Memory:\s+(.+)", output)

                if chip_match:
                    info["Chip"] = chip_match.group(1)
                if mem_match:
                    info["Memory"] = mem_match.group(1)
            except Exception:
                pass
        elif sys.platform == "linux":
            try:
                # Try to get machine manufacturer from DMI
                vendor_path = "/sys/devices/virtual/dmi/id/sys_vendor"
                if os.path.exists(vendor_path):
                    with open(vendor_path, "r", encoding="utf-8") as f:
                        vendor = f.read().strip()
                        info["Machine"] = vendor  # Override generic "x86_64"

            except Exception:
                pass

            try:
                # Try to get CPU model from lscpu
                cmd = ["lscpu"]
                result = subprocess.run(cmd, capture_output=True, text=True)
                output = result.stdout

                # Parse for Model Name line
                # Example output: "Model name:	Intel(R) Core(TM) i7-9700K CPU @ 3.60GHz"
                model_match = re.search(r"Model name:\s*(.+)", output, re.MULTILINE)
                if model_match:
                    info["Processor"] = model_match.group(1).strip()

            except Exception:
                pass

            try:
                # Try to get detailed Linux distribution info using lsb_release
                cmd = ["lsb_release", "-a"]
                result = subprocess.run(cmd, capture_output=True, text=True)
                output = result.stdout

                # Parse for Description field
                # Example output:
                #   Distributor ID: Ubuntu
                #   Description:    Ubuntu 22.04.3 LTS
                #   Release:        22.04
                #   Codename:       jammy
                for line in output.splitlines():
                    if line.strip().startswith("Description:"):
                        description = line.split(":", 1)[1].strip()
                        info["System"] = description  # Override the generic "Linux"
                        break  # Use first description found

            except Exception:
                pass

            try:
                # Try to get GPU info on Linux using lspci (more detailed, no sudo needed)
                # First, find all GPU device addresses
                gpu_devices_cmd = ["lspci"]
                gpu_result = subprocess.run(
                    gpu_devices_cmd, capture_output=True, text=True
                )

                gpu_addresses = []
                for line in gpu_result.stdout.splitlines():
                    if "VGA compatible controller" in line or "3D controller" in line:
                        # Extract device address (first field)
                        parts = line.strip().split()
                        if parts:
                            gpu_addresses.append(parts[0])

                # Query detailed info for each GPU
                gpu_count = 0
                for addr in gpu_addresses:
                    try:
                        detail_cmd = ["lspci", "-v", "-s", addr]
                        detail_result = subprocess.run(
                            detail_cmd, capture_output=True, text=True
                        )

                        # Parse the output for VGA or 3D controller lines
                        for line in detail_result.stdout.splitlines():
                            if (
                                "VGA compatible controller" in line
                                or "3D controller" in line
                            ):
                                # Extract the full GPU description
                                parts = line.split(":", 2)
                                if len(parts) >= 3:
                                    gpu_info = parts[2].strip()
                                    gpu_count += 1

                                    # Store in info dict with numbered keys
                                    if gpu_count == 1:
                                        info["GPU Model"] = gpu_info
                                    else:
                                        info[f"GPU {gpu_count}"] = gpu_info
                                    break  # Only need first match per device
                    except Exception:
                        continue

                # If no GPUs found via lspci, try the old lshw method as fallback
                if gpu_count == 0:
                    cmd = ["lshw", "-C", "display"]
                    result = subprocess.run(cmd, capture_output=True, text=True)
                    output = result.stdout

                    for line in output.splitlines():
                        if line.strip().startswith("vendor:"):
                            vendor = line.split(":", 1)[1].strip()
                            info["GPU Vendor"] = vendor
                        elif line.strip().startswith("product:"):
                            product = line.split(":", 1)[1].strip()
                            info["GPU Model"] = product
            except Exception:
                pass
        elif sys.platform == "win32":
            try:
                # CPU info via PowerShell
                cpu_out = subprocess.check_output(
                    [
                        "powershell",
                        "-NoProfile",
                        "-Command",
                        "(Get-CimInstance Win32_Processor).Name",
                    ],
                    text=True,
                    timeout=10,
                ).strip()
                if cpu_out:
                    info["Processor"] = cpu_out
            except Exception:
                pass

            try:
                # GPU info via PowerShell
                gpu_out = subprocess.check_output(
                    [
                        "powershell",
                        "-NoProfile",
                        "-Command",
                        "(Get-CimInstance Win32_VideoController).Name",
                    ],
                    text=True,
                    timeout=10,
                ).strip()
                if gpu_out:
                    # May return multiple lines if multiple GPUs
                    gpu_lines = [g.strip() for g in gpu_out.splitlines() if g.strip()]
                    for i, gpu in enumerate(gpu_lines):
                        if i == 0:
                            info["GPU Model"] = gpu
                        else:
                            info[f"GPU {i + 1}"] = gpu
            except Exception:
                pass

            try:
                # RAM via PowerShell
                ram_out = subprocess.check_output(
                    [
                        "powershell",
                        "-NoProfile",
                        "-Command",
                        "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory",
                    ],
                    text=True,
                    timeout=10,
                ).strip()
                if ram_out:
                    ram_bytes = int(ram_out)
                    ram_gb = round(ram_bytes / (1024**3))
                    info["Memory"] = f"{ram_gb} GB"
            except Exception:
                pass

            try:
                # Windows version detail
                ver_out = subprocess.check_output(
                    [
                        "powershell",
                        "-NoProfile",
                        "-Command",
                        "(Get-CimInstance Win32_OperatingSystem).Caption",
                    ],
                    text=True,
                    timeout=10,
                ).strip()
                if ver_out:
                    info["System"] = ver_out
            except Exception:
                pass
        return info

    @staticmethod
    def get_software_versions(
        agent_binary: str, non_local: bool = False
    ) -> Dict[str, str]:
        def strip_ansi(text: str) -> str:
            ansi_escape = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")
            return ansi_escape.sub("", text)

        versions = {}

        if not non_local:
            # LM Studio CLI Version (with timeout to avoid hangs on Windows)
            try:
                lms_out = subprocess.check_output(
                    ["lms", "version"], text=True, timeout=10
                ).strip()
                # New format: "CLI commit: <hash>"
                m = re.search(r"CLI commit:\s*([a-f0-9]+)", lms_out)
                if m:
                    versions["LM Studio CLI Version"] = m.group(1)
                else:
                    # Fallback for older versions: "lms - LM Studio CLI - v0.0.47"
                    m_old = re.search(r"lms - LM Studio CLI - (v[\d.]+)", lms_out)
                    if m_old:
                        versions["LM Studio CLI Version"] = m_old.group(1)
                    else:
                        versions["LM Studio CLI Version"] = (
                            lms_out.splitlines()[-1] if lms_out else "Unknown"
                        )
            except subprocess.TimeoutExpired:
                versions["LM Studio CLI Version"] = "CLI timed out"
            except Exception:
                versions["LM Studio CLI Version"] = "Unknown"

            # LM Studio App Version (Mac or Linux via file detection)
            if platform.system() == "Darwin":
                try:
                    # mdls -name kMDItemVersion '/Applications/LM Studio.app'
                    # Output: kMDItemVersion = "0.3.39"
                    mdls_out = subprocess.check_output(
                        [
                            "mdls",
                            "-name",
                            "kMDItemVersion",
                            "/Applications/LM Studio.app",
                        ],
                        text=True,
                    ).strip()
                    m_app = re.search(r'kMDItemVersion\s*=\s*"(.*?)"', mdls_out)
                    if m_app:
                        versions["LM Studio App Version"] = m_app.group(1)
                    else:
                        versions["LM Studio App Version"] = "Unknown"
                except Exception:
                    versions["LM Studio App Version"] = "Not Found / Error"
            elif platform.system() == "Linux":
                try:
                    # Look for LM Studio AppImages in /opt
                    # Pattern: /opt/LM-Studio-0.3.39-2-x64.AppImage
                    # Extract version from filename (everything between "LM-Studio-" and ".AppImage")
                    import glob

                    app_images = glob.glob("/opt/LM-Studio-*.AppImage")

                    if app_images:
                        # Sort by version to get the highest version
                        # Version pattern: 0.3.39-2-x64 (we want to sort numerically)
                        def extract_version(app_image_path):
                            # Extract everything between "LM-Studio-" and the first "-" after it
                            match = re.search(r"LM-Studio-([^-]+)", app_image_path)
                            if match:
                                return match.group(1)
                            return ""

                        # Sort by version (using natural sorting for numbers)
                        app_images.sort(
                            key=lambda x: [
                                int(part) if part.isdigit() else part
                                for part in extract_version(x).split(".")
                            ]
                        )

                        latest_app = app_images[-1]  # Last one after sort
                        version = extract_version(latest_app)
                        versions["LM Studio App Version"] = (
                            version if version else "Unknown"
                        )
                    else:
                        versions["LM Studio App Version"] = "Not Found"
                except Exception as e:
                    print(f"[-] Error detecting LM Studio version on Linux: {e}")
                    versions["LM Studio App Version"] = "Error"
            elif platform.system() == "Windows":
                try:
                    ps_cmd = (
                        'Get-ItemProperty "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*" '
                        '| Where-Object { $_.DisplayName -like "*LM Studio*" } '
                        "| Select-Object -ExpandProperty DisplayVersion"
                    )
                    ps_out = subprocess.check_output(
                        ["powershell", "-NoProfile", "-Command", ps_cmd],
                        text=True,
                        timeout=10,
                    ).strip()
                    versions["LM Studio App Version"] = (
                        ps_out if ps_out else "Not Found"
                    )
                except Exception:
                    versions["LM Studio App Version"] = "Unknown"

        # Agent Version
        try:
            # Most agents support --version
            agent_ver = subprocess.check_output(
                [agent_binary, "--version"], text=True
            ).strip()
            versions[agent_binary] = strip_ansi(agent_ver)
        except Exception:
            versions[agent_binary] = "Unknown"

        return versions

    @staticmethod
    def get_token_usage(
        log_path: Path, chat_log_path: Optional[Path] = None
    ) -> TokenUsage:
        """Return token usage from the most authoritative available source."""
        return TokenUsageCollector.collect(log_path, chat_log_path)

    @staticmethod
    def get_prompt_processing_time(log_path: Path) -> float:
        """Calculates total time spent on prompt processing from logs."""
        if not log_path.exists():
            return 0.0

        total_duration = 0.0

        try:
            with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()

            # Regex for timestamp: [YYYY-MM-DD HH:MM:SS]
            ts_pattern = re.compile(r"^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]")

            in_block = False
            block_start_time = None
            last_timestamp = None

            for line in lines:
                match = ts_pattern.match(line)
                if not match:
                    continue

                current_ts_str = match.group(1)
                try:
                    current_ts = datetime.strptime(current_ts_str, "%Y-%m-%d %H:%M:%S")
                except ValueError:
                    continue

                last_timestamp = current_ts

                if "Prompt processing progress" in line:
                    if not in_block:
                        in_block = True
                        block_start_time = current_ts
                else:
                    if in_block:
                        if block_start_time:
                            total_duration += (
                                current_ts - block_start_time
                            ).total_seconds()
                        in_block = False
                        block_start_time = None

            if in_block and block_start_time and last_timestamp:
                total_duration += (last_timestamp - block_start_time).total_seconds()
        except Exception as e:
            print(f"[-] Error calculating prompt processing time: {e}")

        return total_duration

    @staticmethod
    def parse_model_info(
        model_key: str, non_local: bool = False, agent_name: str = None
    ) -> Dict[str, str]:
        # Basic Info
        info = {"Full Name": model_key}

        # Cloud provider model info for non-local agents
        if non_local and agent_name:
            if agent_name == "claude":
                info["Provider"] = "Anthropic"
                info["Type"] = "Cloud API"
                model_id = CLAUDE_MODEL_IDS.get(model_key.lower().strip())
                if model_id:
                    info["Model ID"] = model_id
                elif model_key.startswith("claude-"):
                    info["Model ID"] = model_key
                return info
            elif agent_name in ("gemini", "agy", "antigravity"):
                info["Provider"] = "Google"
                info["Type"] = "Cloud API"
                info["Model ID"] = model_key
                return info
            elif agent_name == "pi":
                if "/" in model_key:
                    provider, model_id = model_key.split("/", 1)
                    # Normalize provider display names (e.g. "google-gemini-cli" -> "Google")
                    provider_display = (
                        provider.split("-")[0].title()
                        if "-" in provider
                        else provider.title()
                    )
                    info["Provider"] = provider_display
                    info["Model ID"] = model_id
                else:
                    info["Provider"] = "Google"  # pi defaults to google provider
                    info["Model ID"] = model_key
                info["Type"] = "Cloud API"
                return info
            elif agent_name == "codex":
                info["Provider"] = "OpenAI"
                info["Type"] = "Cloud API"
                info["Model ID"] = model_key
                return info
            elif agent_name in ("vibe", "mistral"):
                info["Provider"] = "Mistral AI"
                info["Type"] = "Cloud API"
                info["Model ID"] = model_key
                return info
            elif agent_name == "qoder":
                info["Provider"] = "Qoder"
                info["Type"] = "Cloud API"
                info["Model ID"] = model_key
                return info

        # Heuristic Defaults
        if "24b" in model_key.lower():
            info["Parameters"] = "24B"
        elif "8b" in model_key.lower():
            info["Parameters"] = "8B"
        elif "7b" in model_key.lower():
            info["Parameters"] = "7B"

        if not non_local:
            # Query LM Studio REST API for detailed model info
            try:
                models = lms_api_request("/api/v0/models", timeout=5)
                if models is not None:
                    model_list = (
                        models
                        if isinstance(models, list)
                        else models.get("data", models.get("models", []))
                    )
                    for m in model_list:
                        mid = m.get("id", m.get("path", ""))
                        if model_key in mid:
                            if m.get("arch"):
                                info["Architecture"] = m["arch"]
                            if m.get("quantization"):
                                info["Quantization"] = m["quantization"]
                            if m.get("max_context_length"):
                                info["Max Context"] = str(m["max_context_length"])
                            if m.get("compatibility_type"):
                                info["Compatibility"] = m["compatibility_type"]
                            if m.get("publisher"):
                                info["Publisher"] = m["publisher"]
                            if m.get("state"):
                                info["State"] = m["state"]
                            if mid:
                                info["Full Name"] = mid
                            break
                else:
                    # Fallback to lms ls CLI
                    ls_output = subprocess.check_output(
                        ["lms", "ls"], text=True, timeout=10
                    )
                    for line in ls_output.splitlines():
                        if "LOADED" in line:
                            parts = re.split(r"\s{2,}", line.strip())
                            if len(parts) >= 4:
                                info["Size"] = parts[-2]
                                info["Architecture"] = parts[-3]
                                info["Parameters"] = parts[-4]
                                if len(parts) >= 5:
                                    info["Full Name"] = parts[0]
                            break
            except Exception:
                pass

        # Try to extract quantization (e.g., Q4, Q8)
        quant = re.search(r"(Q\d+[a-zA-Z0-9_]*)", model_key, re.IGNORECASE)
        if quant:
            info["Quantization"] = quant.group(1)

        return info


# --- Process Streaming ---

DEFAULT_PROCESS_TIMEOUT = DEFAULT_MAX_SECONDS


@dataclass
class ProcessResult:
    """Outcome of a streamed agent subprocess."""

    returncode: int
    timed_out: bool = False
    termination: Optional[RunTermination] = None


def run_streaming_process(
    cmd: List[str],
    work_dir: Path,
    chat_log_path: Path,
    env: Optional[Dict[str, str]] = None,
    input_text: Optional[str] = None,
    display_cmd: Optional[str] = None,
    timeout: Optional[float] = DEFAULT_PROCESS_TIMEOUT,
    idle_timeout: Optional[float] = DEFAULT_MAX_IDLE_SECONDS,
    on_line: Optional[Callable[[str, TextIO], None]] = None,
    on_stderr_line: Optional[Callable[[str, TextIO], None]] = None,
    merge_stderr: bool = True,
    cwd: Optional[Path] = None,
    shell: bool = False,
    report_completion: bool = True,
) -> ProcessResult:
    """Run a subprocess, stream stdout to both console and a log file.

    Encapsulates the common Popen → stdin → line iteration → timeout → exit
    lifecycle shared by every runner adapter.  Each adapter supplies an
    ``on_line(line, log_file)`` callback for per-line event parsing.

    Args:
        cmd: Command and arguments.
        work_dir: Working directory for the child process.
        chat_log_path: Path to write the human-readable chat transcript.
        env: Environment variables (defaults to ``os.environ``).
        input_text: Text piped to stdin on a background thread.
        display_cmd: Log-friendly command summary.
        timeout: Total seconds before the process is killed, or ``None`` to disable.
        idle_timeout: Seconds without stdout/stderr before the process is killed,
            or ``None`` to disable. Any output resets this timer.
        on_line: Called for every stdout line with ``(line, log_file)``.
        on_stderr_line: Optional callback for stderr when it is not merged.
        merge_stderr: Merge stderr into stdout (default) or keep separate.
        cwd: Override working directory (defaults to ``work_dir``).
        shell: Use shell execution (needed for .cmd wrappers on Windows).
        report_completion: Print and log the exit status in this helper. Callers
            with additional success criteria can disable this and report their
            final status after validating those criteria.
    """
    if env is None:
        env = os.environ.copy()

    print(f"[*] Executing: {display_cmd or format_display_cmd(cmd)}")
    print(f"[*] Output logging to: {chat_log_path}")

    timed_out = False
    timeout_termination = None

    with open(chat_log_path, "w", encoding="utf-8") as log_file:
        process = subprocess.Popen(
            cmd,
            cwd=cwd or work_dir,
            env=env,
            stdin=subprocess.PIPE if input_text is not None else None,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT if merge_stderr else subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            shell=shell,
            start_new_session=os.name != "nt",
        )
        send_stdin(process, input_text)

        callback_errors = []
        safety_terminations: List[RunTermination] = []
        output_lock = threading.Lock()
        activity_lock = threading.Lock()
        started_at = time.monotonic()
        last_activity_at = started_at
        force_closing_output = False

        def record_activity() -> None:
            nonlocal last_activity_at
            with activity_lock:
                last_activity_at = time.monotonic()

        def record_callback_error(exc: BaseException) -> None:
            if isinstance(exc, RunSafetyTermination):
                safety_terminations.append(exc.termination)
            else:
                callback_errors.append(exc)
            stop_process_tree(process)

        def drain_stdout() -> None:
            try:
                for line in process.stdout:
                    record_activity()
                    with output_lock:
                        if on_line:
                            on_line(line, log_file)
                        else:
                            safe_stdout_write(line)
                            log_file.write(line)
                            log_file.flush()
            except BaseException as exc:
                if not force_closing_output:
                    record_callback_error(exc)

        def drain_stderr() -> None:
            try:
                for line in process.stderr:
                    record_activity()
                    with output_lock:
                        if on_stderr_line:
                            on_stderr_line(line, log_file)
                        else:
                            safe_stdout_write(line)
                            log_file.write(line)
                            log_file.flush()
            except BaseException as exc:
                if not force_closing_output:
                    record_callback_error(exc)

        stdout_thread = threading.Thread(target=drain_stdout, daemon=True)
        stdout_thread.start()
        stderr_thread = None
        if not merge_stderr:
            stderr_thread = threading.Thread(target=drain_stderr, daemon=True)
            stderr_thread.start()

        while process.poll() is None:
            now = time.monotonic()
            if timeout and timeout > 0 and now - started_at >= timeout:
                timed_out = True
                timeout_termination = RunTermination(
                    reason="time_limit",
                    message=(
                        f"Run stopped after reaching the {timeout:g}-second "
                        "time limit."
                    ),
                    evidence={
                        "observed_seconds": now - started_at,
                        "limit_seconds": timeout,
                    },
                )
                stop_process_tree(process)
                break

            with activity_lock:
                idle_seconds = now - last_activity_at
            if idle_timeout and idle_timeout > 0 and idle_seconds >= idle_timeout:
                timed_out = True
                timeout_termination = RunTermination(
                    reason="inactivity_limit",
                    message=(
                        f"Run stopped after {idle_timeout:g} seconds without "
                        "agent process output."
                    ),
                    evidence={
                        "detector": "output_inactivity",
                        "observed_idle_seconds": idle_seconds,
                        "limit_seconds": idle_timeout,
                        "elapsed_seconds": now - started_at,
                    },
                )
                stop_process_tree(process)
                break

            wait_seconds = 0.2
            if timeout and timeout > 0:
                wait_seconds = min(
                    wait_seconds,
                    max(timeout - (now - started_at), 0.001),
                )
            if idle_timeout and idle_timeout > 0:
                wait_seconds = min(
                    wait_seconds,
                    max(idle_timeout - idle_seconds, 0.001),
                )
            try:
                process.wait(timeout=wait_seconds)
            except subprocess.TimeoutExpired:
                pass

        if process.poll() is None:
            process.wait()

        stdout_thread.join(timeout=5)
        if stderr_thread:
            stderr_thread.join(timeout=5)
        live_threads = [
            thread
            for thread in (stdout_thread, stderr_thread)
            if thread is not None and thread.is_alive()
        ]
        if live_threads:
            force_closing_output = True
            if process.stdout:
                process.stdout.close()
            if process.stderr and process.stderr is not process.stdout:
                process.stderr.close()
            for thread in live_threads:
                thread.join(timeout=1)

        for stream in (process.stdout, getattr(process, "stderr", None)):
            close = getattr(stream, "close", None)
            if close:
                close()

        if callback_errors:
            raise callback_errors[0]

        termination = (
            safety_terminations[0]
            if safety_terminations
            else timeout_termination
        )

        if termination:
            print(f"[-] Agent run terminated: {termination.message}")
            log_file.write(f"\n[TERMINATED] {termination.message}\n")

        if report_completion and not termination:
            if process.returncode == 0:
                print("[+] Agent finished successfully.")
                log_file.write("\n[SUCCESS] Process exited cleanly.\n")
            else:
                print(f"[-] Agent finished with error code {process.returncode}")
                log_file.write(
                    f"\n[ERROR] Process exited with code {process.returncode}\n"
                )

    return ProcessResult(
        returncode=process.returncode,
        timed_out=timed_out,
        termination=termination,
    )


# --- Agent Runners ---


class AgentRunner:
    supports_custom_provider = False
    executable_name: Optional[str] = None

    def __init__(
        self,
        agent_name: str,
        model_name: str,
        prompt_file: Path,
        headless: bool,
        non_local: bool = False,
        restore_agent_config: bool = False,
        custom_provider: Optional[str] = None,
        local_provider: Optional[LocalProviderConfig] = None,
        execute_generated_python: bool = False,
        safety_limits: Optional[RunSafetyLimits] = None,
    ):
        self.agent_name = agent_name
        self.model_name = model_name
        self.prompt_file = prompt_file
        self.headless = headless
        self.non_local = non_local
        self.restore_agent_config = restore_agent_config
        self.custom_provider = custom_provider
        self.local_provider = local_provider or LM_STUDIO_PROVIDER
        self.lms_cli_available = self.local_provider.supports_lms_cli
        self.execute_generated_python = execute_generated_python
        self.safety_limits = safety_limits or RunSafetyLimits()

        # Binary to name mapping
        self.binary_map = {
            "mistral": "vibe",
            "gemini": "agy",
            "antigravity": "agy",
            "agy": "agy",
        }
        workspace_prefix = self.binary_map.get(agent_name, agent_name)
        self.agent_binary = self.executable_name or workspace_prefix

        # Prepare workspace
        self.safe_model_name = "".join(
            c if c.isalnum() or c in ("-", "_") else "_" for c in model_name
        ).strip()
        # Requested naming convention: {binary_name}_{safe_model_name}_{prompt_stem}
        self.work_dir = (
            EVALS_DIR / f"{workspace_prefix}_{self.safe_model_name}_{prompt_file.stem}"
        )
        self.workspace_overwrite_confirmed = False

        self.log_process: Optional[subprocess.Popen] = None
        self.last_process_result: Optional[ProcessResult] = None

    def confirm_workspace_overwrite(self):
        """Prompts before replacing an existing evaluation directory."""
        if not self.work_dir.exists() or self.workspace_overwrite_confirmed:
            return
        try:
            response = input(
                f"[!] Evaluation directory already exists: {self.work_dir}\n"
                "Overwrite it and delete the existing contents? [y/N]: "
            ).strip().lower()
        except EOFError:
            response = ""
        if response not in ("y", "yes"):
            print("[*] Evaluation aborted; existing results were left unchanged.")
            sys.exit(1)
        self.workspace_overwrite_confirmed = True

    def setup_workspace(self):
        """Creates the evaluation directory."""
        if self.work_dir.exists():
            self.confirm_workspace_overwrite()
            print(f"[*] Deleting existing directory contents: {self.work_dir}")
            shutil.rmtree(self.work_dir)
        self.work_dir.mkdir(parents=True, exist_ok=True)
        print(f"[+] Created workspace: {self.work_dir}")

    def get_model_extra_info(self) -> Dict[str, str]:
        """Returns additional model metadata to merge into the Model Details box. Override per agent."""
        return {}

    def get_env_vars(self) -> Dict[str, str]:
        """Returns the environment variables needed for the agent to talk to localhost."""
        env = os.environ.copy()
        # Several CLIs are Python entrypoints on Windows. If they inherit a
        # legacy console code page, their own JSON/status output can crash
        # before this evaluator has a chance to decode it.
        env["PYTHONUTF8"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"
        if not self.non_local:
            # Standard OpenAI-compatible env vars
            env["OPENAI_API_BASE"] = self.local_provider.api_url
            env["OPENAI_BASE_URL"] = self.local_provider.api_url
            env["OPENAI_API_KEY"] = self.local_provider.api_key
        return env

    def start_server_logger(self):
        """Starts streaming server logs to file."""
        self._run_start_time = datetime.now()

        if self.non_local:
            return

        # Skip if lms CLI is known to be unresponsive (e.g. hangs on Windows)
        if not self.lms_cli_available:
            print(
                "[*] Skipping lms log stream (CLI unavailable). Will read on-disk server logs instead."
            )
            return

        log_path = self.work_dir / SERVER_LOG_FILENAME
        print(f"[*] Starting server log stream to: {log_path}")

        try:
            self.server_log_file = open(log_path, "w", encoding="utf-8")
            self.log_process = subprocess.Popen(
                ["lms", "log", "stream", "--source", "server"],
                stdout=self.server_log_file,
                stderr=subprocess.STDOUT,
            )
            # Quick check: if process exits immediately it likely can't connect
            time.sleep(0.5)
            if self.log_process.poll() is not None:
                print(
                    "[-] lms log stream exited immediately — will read on-disk server logs instead."
                )
                self.server_log_file.close()
                self.log_process = None
        except Exception as e:
            print(f"[-] Failed to start server logger: {e}")

    def _collect_server_log_from_disk(self):
        """Reads LM Studio's on-disk server logs as a fallback when lms log stream fails.

        Copies log entries from the run start time onward into SERVER.LOG so that
        token parsing and prompt processing time work normally.
        """
        if self.non_local:
            return
        if self.local_provider.provider_id != "lmstudio":
            return

        log_path = self.work_dir / SERVER_LOG_FILENAME

        # If SERVER.LOG already has useful content (from lms log stream), skip
        if log_path.exists() and log_path.stat().st_size > 0:
            try:
                content = log_path.read_text(encoding="utf-8", errors="ignore")
                if '"usage"' in content or "Prompt processing progress" in content:
                    return  # lms log stream worked fine
            except Exception:
                pass

        # Find LM Studio's on-disk log directory
        lms_log_dir = Path.home() / ".lmstudio" / "server-logs"
        if not lms_log_dir.exists():
            print(
                "[-] LM Studio server-logs directory not found, cannot recover token metrics."
            )
            return

        start_time = getattr(self, "_run_start_time", None)
        if not start_time:
            return

        # Collect log files that could contain entries from our run
        # Format: ~/.lmstudio/server-logs/YYYY-MM/YYYY-MM-DD.N.log
        year_month = start_time.strftime("%Y-%m")
        month_dir = lms_log_dir / year_month
        if not month_dir.exists():
            return

        # Find today's log file(s)
        today_str = start_time.strftime("%Y-%m-%d")
        log_files = sorted(month_dir.glob(f"{today_str}.*.log"))
        if not log_files:
            return

        # Timestamp format in LM Studio logs: [YYYY-MM-DD HH:MM:SS]
        start_ts_str = start_time.strftime("%Y-%m-%d %H:%M:%S")
        ts_pattern = re.compile(r"^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]")

        collected_lines = []
        capturing = False

        for log_file in log_files:
            try:
                with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        if not capturing:
                            m = ts_pattern.match(line)
                            if m and m.group(1) >= start_ts_str:
                                capturing = True
                        if capturing:
                            collected_lines.append(line)
            except Exception as e:
                print(f"[-] Error reading LM Studio log {log_file}: {e}")

        if collected_lines:
            with open(log_path, "w", encoding="utf-8") as f:
                f.writelines(collected_lines)
            print(
                f"[+] Recovered {len(collected_lines)} lines from LM Studio on-disk logs into SERVER.LOG"
            )
        else:
            print("[-] No matching log entries found in LM Studio on-disk logs.")

    def stop_server_logger(self):
        """Stops the server log stream."""
        if self.log_process:
            print("[*] Stopping server logger...")
            self.log_process.terminate()
            try:
                self.log_process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.log_process.kill()
            self.log_process = None

        if hasattr(self, "server_log_file") and self.server_log_file:
            self.server_log_file.close()

        # Fallback: read from LM Studio's on-disk logs if streaming didn't work
        self._collect_server_log_from_disk()

    def run(self):
        """Orchestrates the run."""
        start_time = datetime.now()

        self.setup_workspace()
        with self.agent_configuration():
            self.start_server_logger()
            try:
                print(f"[*] Running {self.agent_name}...")
                self.execute_agent()
            finally:
                self.stop_server_logger()

        duration_seconds = (datetime.now() - start_time).total_seconds()
        if self.execute_generated_python:
            self._execute_generated_python_artifacts()
        report_path = self._generate_report(duration_seconds)
        if not self.headless:
            self._open_report(report_path)

    def _execute_generated_python_artifacts(self) -> None:
        """Execute root-level Python artifacts and capture their output."""
        for py_file in self.work_dir.glob("*.py"):
            if py_file.name == "evaluate_agent.py":
                continue

            print(f"[*] Automatically executing generated script: {py_file.name}")
            output_log_path = self.work_dir / "OUTPUT.TXT"

            try:
                result = subprocess.run(
                    [sys.executable, py_file.name],
                    cwd=self.work_dir,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=300,
                )

                with open(output_log_path, "a", encoding="utf-8") as f:
                    f.write(f"--- Execution of {py_file.name} ---\n")
                    f.write("STDOUT:\n")
                    f.write(result.stdout)
                    if result.stderr:
                        f.write("\nSTDERR:\n")
                        f.write(result.stderr)
                    f.write("\n---------------------------\n\n")

                print(
                    f"[+] Execution of {py_file.name} finished. Results appended to OUTPUT.TXT"
                )
            except Exception as e:
                print(f"[-] Execution of {py_file.name} failed: {e}")

    def _collect_metadata(self) -> Dict:
        """Collect the report metadata for a completed evaluation."""
        model_info = MetadataCollector.parse_model_info(
            self.model_name, self.non_local, self.agent_name
        )
        model_info.update(self.get_model_extra_info())
        return {
            "Hardware": MetadataCollector.get_hardware_info(),
            "Software": MetadataCollector.get_software_versions(
                self.agent_binary, self.non_local
            ),
            "Model": model_info,
            "Tokens": MetadataCollector.get_token_usage(
                self.work_dir / SERVER_LOG_FILENAME,
                self.work_dir / CHAT_SESSION_FILENAME,
            ),
            "PromptTime": MetadataCollector.get_prompt_processing_time(
                self.work_dir / SERVER_LOG_FILENAME
            ),
        }

    def _generate_report(self, duration_seconds: float) -> Path:
        """Build the self-contained report for a completed evaluation."""
        print("[*] Generating run report...")
        try:
            prompt_text = read_prompt_file(self.prompt_file)
        except OSError:
            prompt_text = "Error reading prompt file."

        report_path = generate_html_report(
            self.work_dir,
            self._collect_metadata(),
            prompt_text,
            duration_seconds,
            self.agent_name,
        )
        print(f"[+] Report generated: {report_path}")
        return report_path

    @staticmethod
    def _open_report(report_path: Path) -> None:
        """Open a generated report in the platform's default browser."""
        try:
            if sys.platform == "darwin":  # macOS
                subprocess.run(["open", str(report_path)])
            elif sys.platform == "win32":  # Windows
                os.startfile(str(report_path))
            else:  # Linux
                subprocess.run(["xdg-open", str(report_path)])
        except Exception as e:
            print(f"[-] Failed to open report: {e}")

    def configure_agent(self):
        """Hook for agent-specific configuration file generation."""
        pass

    @contextmanager
    def agent_configuration(self):
        """Apply runner configuration for the duration of agent execution."""
        self.configure_agent()
        yield

    def execute_agent(self):
        """Runs the actual agent command."""
        raise NotImplementedError

    def create_safety_monitor(self) -> RunSafetyMonitor:
        """Return a fresh monitor scoped to this evaluation workspace."""
        return RunSafetyMonitor(self.safety_limits, self.work_dir)

    def _run_process(
        self,
        cmd: List[str],
        env: Optional[Dict[str, str]] = None,
        input_text: Optional[str] = None,
        display_cmd: Optional[str] = None,
    ) -> int:
        """Run the process and stream output to file and stdout.

        Delegates to :func:`run_streaming_process` for the common lifecycle.
        Returns the process exit code for backward compatibility.
        """
        result = run_streaming_process(
            cmd=cmd,
            work_dir=self.work_dir,
            chat_log_path=self.work_dir / CHAT_SESSION_FILENAME,
            env=env or self.get_env_vars(),
            input_text=input_text,
            display_cmd=display_cmd,
            timeout=self.safety_limits.process_timeout,
            idle_timeout=self.safety_limits.process_idle_timeout,
            on_line=lambda line, log_file: (
                safe_stdout_write(line),
                log_file.write(line),
                log_file.flush(),
            ),
        )
        self.last_process_result = result
        return result.returncode

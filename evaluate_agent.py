#!/usr/bin/env python3
import argparse
import os
import subprocess
import threading
import queue
import time
import shutil
import sys
import json
import re
import platform
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from evaluation_metrics import (
    CLAUDE_RESULT_FILENAME,
    CODEX_RESULT_FILENAME,
    GEMINI_RESULT_FILENAME,
    OPENCODE_RESULT_FILENAME,
    PI_RESULT_FILENAME,
    PI_WIGGUM_RESULT_FILENAME,
    VIBE_RESULT_FILENAME,
    TokenUsage,
    TokenUsageCollector,
)
from evaluation_report import generate_html_report

# --- Configuration & Constants ---
LM_STUDIO_API_URL = "http://localhost:1234/v1"
LM_STUDIO_REST_BASE = "http://localhost:1234"
LLAMA_SERVER_API_URL = "http://localhost:8080/v1"
OMLX_API_URL = os.environ.get("OMLX_BASE_URL", "http://localhost:8000/v1")
LOCAL_API_URL = LM_STUDIO_API_URL
LOCAL_PROVIDER_ID = "lmstudio"
LOCAL_PROVIDER_NAME = "LM Studio (local)"
LOCAL_API_KEY = "lm-studio"
EVALS_DIR = Path("evals")
PROJECT_ROOT = Path(__file__).resolve().parent
SERVER_LOG_FILENAME = "SERVER.LOG"
CHAT_SESSION_FILENAME = "CHAT_SESSION.TXT"
CODEX_EVENTS_FILENAME = "CODEX_EVENTS.JSONL"
CODEX_LAST_MESSAGE_FILENAME = "CODEX_LAST_MESSAGE.TXT"
PI_WIGGUM_MAX_SECONDS = 4 * 60 * 60
DEFAULT_LOCAL_CONTEXT_LIMIT = 32768
DEFAULT_LOCAL_OUTPUT_LIMIT = 4096


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

# Tracks whether the lms CLI is responsive (set during model loading)
_lms_cli_available = True


def is_llama_server_provider(provider: Optional[str]) -> bool:
    return (provider or "").lower().strip() == "llama-server"


def is_omlx_provider(provider: Optional[str]) -> bool:
    return (provider or "").lower().strip() == "omlx"


def use_llama_server_provider() -> None:
    global LOCAL_API_URL, LOCAL_PROVIDER_ID, LOCAL_PROVIDER_NAME, LOCAL_API_KEY
    global _lms_cli_available

    LOCAL_API_URL = LLAMA_SERVER_API_URL
    LOCAL_PROVIDER_ID = "llama-server"
    LOCAL_PROVIDER_NAME = "llama-server (local)"
    LOCAL_API_KEY = "llama-server"
    _lms_cli_available = False


def use_omlx_provider() -> None:
    """Configure the local-provider globals for an oMLX OpenAI API server."""
    global LOCAL_API_URL, LOCAL_PROVIDER_ID, LOCAL_PROVIDER_NAME, LOCAL_API_KEY
    global _lms_cli_available

    LOCAL_API_URL = OMLX_API_URL
    LOCAL_PROVIDER_ID = "omlx"
    LOCAL_PROVIDER_NAME = "oMLX (local)"
    LOCAL_API_KEY = OMLX_API_KEY
    _lms_cli_available = False


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


def load_lms_model(model_key: str):
    """Loads a model into LM Studio, preferring the REST API over the CLI."""
    global _lms_cli_available

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
                "/api/v1/models/unload", method="POST", data={"model": instance_id}
            )

        if target_loaded:
            return  # Already loaded, nothing to do

        print(f"[*] Loading model '{model_key}' via REST API...")
        result = lms_api_request(
            "/api/v1/models/load", method="POST", data={"model": model_key}, timeout=120
        )
        if result is not None:
            print(f"[+] Model '{model_key}' loaded successfully via REST API.")
            return
        print("[-] REST API load failed. Falling back to CLI...")

    # Fallback: try the lms CLI (may hang on Windows)
    print("[*] REST API not available, falling back to lms CLI...")
    print("[*] Unloading any existing models...")
    try:
        subprocess.run(["lms", "unload", "--all"], check=True, text=True, timeout=30)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        print("[-] Warning: Failed to unload models via CLI, attempting to proceed...")
        _lms_cli_available = False
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
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        print(f"[-] Failed to load model via CLI: {e}")
        _lms_cli_available = False
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


# --- Agent Runners ---


class AgentRunner:
    supports_custom_provider = False

    def __init__(
        self,
        agent_name: str,
        model_name: str,
        prompt_file: Path,
        headless: bool,
        non_local: bool = False,
        restore_agent_config: bool = False,
        custom_provider: Optional[str] = None,
    ):
        self.agent_name = agent_name
        self.model_name = model_name
        self.prompt_file = prompt_file
        self.headless = headless
        self.non_local = non_local
        self.restore_agent_config = restore_agent_config
        self.custom_provider = custom_provider

        # Binary to name mapping
        self.binary_map = {
            "mistral": "vibe",
            "gemini": "agy",
            "antigravity": "agy",
            "agy": "agy",
        }
        self.agent_binary = self.binary_map.get(agent_name, agent_name)

        # Prepare workspace
        self.safe_model_name = "".join(
            c if c.isalnum() or c in ("-", "_") else "_" for c in model_name
        ).strip()
        # Requested naming convention: {binary_name}_{safe_model_name}_{prompt_stem}
        self.work_dir = (
            EVALS_DIR / f"{self.agent_binary}_{self.safe_model_name}_{prompt_file.stem}"
        )
        self.workspace_overwrite_confirmed = False

        self.log_process: Optional[subprocess.Popen] = None

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
            env["OPENAI_API_BASE"] = LOCAL_API_URL
            env["OPENAI_BASE_URL"] = LOCAL_API_URL
            env["OPENAI_API_KEY"] = LOCAL_API_KEY  # Usually ignored but required
        return env

    def start_server_logger(self):
        """Starts streaming server logs to file."""
        self._run_start_time = datetime.now()

        if self.non_local:
            return

        # Skip if lms CLI is known to be unresponsive (e.g. hangs on Windows)
        if not _lms_cli_available:
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
        if LOCAL_PROVIDER_ID != "lmstudio":
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
        self.configure_agent()
        self.start_server_logger()

        try:
            print(f"[*] Running {self.agent_name}...")
            self.execute_agent()
        finally:
            self.stop_server_logger()

        duration_seconds = (datetime.now() - start_time).total_seconds()
        self._execute_generated_python_artifacts()
        report_path = self._generate_report(duration_seconds)
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

    def execute_agent(self):
        """Runs the actual agent command."""
        raise NotImplementedError

    def _run_process(
        self,
        cmd: List[str],
        env: Optional[Dict[str, str]] = None,
        input_text: Optional[str] = None,
        display_cmd: Optional[str] = None,
    ):
        """Runs the process and streams output to file and stdout."""
        if env is None:
            env = self.get_env_vars()

        chat_log_path = self.work_dir / CHAT_SESSION_FILENAME

        print(f"[*] Executing: {display_cmd or format_display_cmd(cmd)}")
        print(f"[*] Output logging to: {chat_log_path}")

        with open(chat_log_path, "w", encoding="utf-8") as log_file:
            # We want to capture both stdout and stderr
            # And also print to the console?
            # Subprocess.PIPE might buffer, but let's try.

            # Start process in the work dir
            process = subprocess.Popen(
                cmd,
                cwd=self.work_dir,
                env=env,
                stdin=subprocess.PIPE if input_text is not None else None,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,  # Merge stderr into stdout
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,  # Line buffered
            )
            send_stdin(process, input_text)

            # Stream output
            for line in process.stdout:
                safe_stdout_write(line)
                log_file.write(line)
                log_file.flush()

            try:
                process.wait(timeout=900)  # Wait with a timeout
            except subprocess.TimeoutExpired:
                print(f"[-] Agent process timed out after 900 seconds.")
                log_file.write(f"\n[ERROR] Process timed out after 900 seconds.\n")
                process.kill()  # Terminate the process
                process.wait()  # Wait for it to actually terminate

            if process.returncode != 0:
                print(f"[-] Agent finished with error code {process.returncode}")
                log_file.write(
                    f"\n[ERROR] Process exited with code {process.returncode}\n"
                )
            else:
                print(f"[+] Agent finished successfully.")
                log_file.write(f"\n[SUCCESS] Process exited cleanly.\n")


# --- Specific Agent Implementations ---


class GeminiRunner(AgentRunner):
    supports_custom_provider = True

    _RUNNER_OUTPUT_FILES = {
        CHAT_SESSION_FILENAME,
        GEMINI_RESULT_FILENAME,
        SERVER_LOG_FILENAME,
        "summary.html",
    }

    def get_model_extra_info(self) -> Dict[str, str]:
        """Read provider/model info from Gemini result JSON."""
        result_path = self.work_dir / GEMINI_RESULT_FILENAME
        if not result_path.exists():
            return {}
        try:
            with open(result_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            extra = {}
            if data.get("agy_version"):
                extra["Antigravity Version"] = data["agy_version"]
            if data.get("provider"):
                extra["Provider"] = data["provider"]
            if data.get("model_id"):
                extra["Model ID"] = data["model_id"]
            return extra
        except Exception:
            return {}

    def _get_agy_transcript_stats(self, work_dir: Path, start_time: datetime) -> Dict[str, int]:
        import math
        stats = {
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
            "cached": 0,
            "tool_calls": 0,
            "num_turns": 0,
        }

        conv_id = None
        last_conv_file = Path.home() / ".gemini" / "antigravity-cli" / "cache" / "last_conversations.json"
        if last_conv_file.exists():
            try:
                mapping = json.loads(last_conv_file.read_text(encoding="utf-8"))
                conv_id = mapping.get(str(work_dir.resolve())) or mapping.get(str(work_dir))
            except Exception:
                pass

        transcript_path = None
        if conv_id:
            candidate = Path.home() / ".gemini" / "antigravity-cli" / "brain" / conv_id / ".system_generated" / "logs" / "transcript_full.jsonl"
            if candidate.exists():
                transcript_path = candidate
            else:
                candidate_short = Path.home() / ".gemini" / "antigravity-cli" / "brain" / conv_id / ".system_generated" / "logs" / "transcript.jsonl"
                if candidate_short.exists():
                    transcript_path = candidate_short

        if not transcript_path:
            brain_dir = Path.home() / ".gemini" / "antigravity-cli" / "brain"
            if brain_dir.exists():
                best_time = 0
                for path in brain_dir.glob("*/.system_generated/logs/transcript_full.jsonl"):
                    mtime = path.stat().st_mtime
                    if mtime > best_time:
                        best_time = mtime
                        transcript_path = path

        if not transcript_path or not transcript_path.exists():
            return stats

        turns = 0
        tool_calls = 0
        input_chars = 0
        output_chars = 0

        try:
            with open(transcript_path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    data = json.loads(line)
                    stype = data.get("type", "")
                    if stype == "USER_INPUT":
                        input_chars += len(data.get("content", ""))
                    elif stype == "PLANNER_RESPONSE":
                        turns += 1
                        content = data.get("content", "")
                        thinking = data.get("thinking", "")
                        output_chars += len(content) + len(thinking)
                        tc = data.get("tool_calls", [])
                        if isinstance(tc, list):
                            tool_calls += len(tc)
                            for t in tc:
                                if isinstance(t, dict):
                                    output_chars += len(json.dumps(t.get("args", {})))
        except Exception as e:
            print(f"[-] Error parsing transcript file {transcript_path}: {e}")

        input_tokens = math.ceil(input_chars / 4.0) if input_chars else 0
        output_tokens = math.ceil(output_chars / 4.0) if output_chars else 0

        stats["input_tokens"] = input_tokens
        stats["output_tokens"] = output_tokens
        stats["total_tokens"] = input_tokens + output_tokens
        stats["tool_calls"] = tool_calls
        stats["num_turns"] = max(turns, 1)

        return stats

    def _build_agy_command(self, agy_bin: str, prompt_content: str) -> List[str]:
        """Build an isolated AGY command whose project is the evaluation workspace."""
        cmd = [
            agy_bin,
            "--new-project",
            "--add-dir",
            str(self.work_dir.resolve()),
            "--dangerously-skip-permissions",
            "--print",
            prompt_content,
        ]
        if self.model_name:
            cmd.extend(["--model", self.model_name])
        return cmd

    def _generated_artifacts(self) -> List[str]:
        """Return root-level files produced by the evaluated agent."""
        return sorted(
            path.name
            for path in self.work_dir.iterdir()
            if path.is_file() and path.name not in self._RUNNER_OUTPUT_FILES
        )

    def execute_agent(self):
        prompt_content = read_prompt_file(self.prompt_file)

        agy_bin = shutil.which("agy") or shutil.which("gemini") or "agy"
        cmd = self._build_agy_command(agy_bin, prompt_content)

        env = self.get_env_vars()
        env.pop("GEMINI_CLI", None)
        env.pop("GEMINI_CLI_NO_RELAUNCH", None)
        env.pop("ANTIGRAVITY_CLI", None)

        chat_log_path = self.work_dir / CHAT_SESSION_FILENAME
        result_json_path = self.work_dir / GEMINI_RESULT_FILENAME

        display_cmd = (
            f"agy --new-project --add-dir {self.work_dir.resolve()} "
            "--dangerously-skip-permissions --print <prompt>"
        )
        if self.model_name:
            display_cmd += f" --model {self.model_name}"
        print(f"[*] Executing: {display_cmd}")
        print(f"[*] Output logging to: {chat_log_path}")

        start_time = datetime.now()
        tool_call_count = 0

        with open(chat_log_path, "w", encoding="utf-8") as log_file:
            process = subprocess.Popen(
                cmd,
                cwd=self.work_dir,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            )

            for line in process.stdout:
                safe_stdout_write(line)
                log_file.write(line)
                log_file.flush()
                if "[Tool:" in line or "tool_call" in line:
                    tool_call_count += 1

            try:
                process.wait(timeout=900)
            except subprocess.TimeoutExpired:
                print(f"[-] Agent process timed out after 900 seconds.")
                log_file.write(f"\n[ERROR] Process timed out after 900 seconds.\n")
                process.kill()
                process.wait()

            generated_artifacts = self._generated_artifacts()
            if process.returncode == 0 and generated_artifacts:
                print(f"[+] Agent finished successfully.")
                log_file.write(f"\n[SUCCESS] Process exited cleanly.\n")
            elif process.returncode == 0:
                artifact_error = (
                    "AGY exited cleanly but produced no root-level artifacts in "
                    f"{self.work_dir.resolve()}."
                )
                print(f"[-] {artifact_error}")
                log_file.write(f"\n[ERROR] {artifact_error}\n")
            else:
                print(f"[-] Agent finished with error code {process.returncode}")
                log_file.write(
                    f"\n[ERROR] Process exited with code {process.returncode}\n"
                )

        end_time = datetime.now()
        duration_ms = int((end_time - start_time).total_seconds() * 1000)

        # Get agy version
        try:
            agy_version = subprocess.check_output(
                [agy_bin, "--version"], text=True, timeout=10
            ).strip()
        except Exception:
            agy_version = None

        transcript_stats = self._get_agy_transcript_stats(self.work_dir, start_time)

        provider_name = self.custom_provider.title() if self.custom_provider else "Google"
        run_succeeded = process.returncode == 0 and bool(generated_artifacts)

        result_data = {
            "type": "result",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": "success" if run_succeeded else "error",
            "stats": {
                "input_tokens": transcript_stats["input_tokens"],
                "output_tokens": transcript_stats["output_tokens"],
                "total_tokens": transcript_stats["total_tokens"],
                "cached": transcript_stats.get("cached", 0),
                "duration_ms": duration_ms,
                "tool_calls": max(transcript_stats.get("tool_calls", 0), tool_call_count),
            },
            "num_turns": max(transcript_stats.get("num_turns", 1), 1),
            "agy_version": agy_version,
            "provider": provider_name,
            "model_id": self.model_name,
            "artifacts": generated_artifacts,
        }
        if process.returncode == 0 and not generated_artifacts:
            result_data["error"] = (
                "AGY exited successfully but did not create any root-level "
                f"artifacts in {self.work_dir.resolve()}."
            )

        with open(result_json_path, "w", encoding="utf-8") as f:
            json.dump(result_data, f, indent=2)
        print(f"[+] Antigravity/Gemini usage data saved to: {result_json_path}")


class ClaudeRunner(AgentRunner):
    def execute_agent(self):
        # Claude Code: `claude -p` reads the prompt from stdin in headless mode.
        # Using --output-format stream-json to capture token usage and cost metrics
        prompt_content = read_prompt_file(self.prompt_file)

        cmd = [
            "claude",
            "-p",
            # bypassPermissions auto-approves every action without prompting.
            # NOTE: --dangerously-skip-permissions alone hangs headless `-p` runs
            # on claude >= 2.1.x (it now waits on an interactive confirmation that
            # stdin never provides), so use the explicit permission mode instead.
            "--permission-mode",
            "bypassPermissions",
            "--output-format",
            "stream-json",
            "--verbose",
            "--effort=max",
        ]

        # Add --model flag if we can resolve the friendly name to a Claude model ID
        if self.non_local:
            model_id = CLAUDE_MODEL_IDS.get(self.model_name.lower().strip())
            if model_id:
                cmd.extend(["--model", model_id])
            elif self.model_name.startswith("claude-"):
                cmd.extend(["--model", self.model_name])

        env = self.get_env_vars()
        # Remove CLAUDECODE env var to avoid "nested session" error when
        # this script is itself run from within a Claude Code session
        env.pop("CLAUDECODE", None)
        chat_log_path = self.work_dir / CHAT_SESSION_FILENAME
        result_json_path = self.work_dir / CLAUDE_RESULT_FILENAME

        print(
            f"[*] Executing: claude -p <prompt> --permission-mode bypassPermissions --output-format stream-json"
        )
        print(f"[*] Output logging to: {chat_log_path}")

        result_data = None

        with open(chat_log_path, "w", encoding="utf-8") as log_file:
            process = subprocess.Popen(
                cmd,
                cwd=self.work_dir,
                env=env,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            )
            send_stdin(process, prompt_content)

            for line in process.stdout:
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    event = json.loads(stripped)
                    event_type = event.get("type", "")

                    if event_type == "system":
                        # Startup / progress events (init, thinking_tokens, etc.)
                        # carry no transcript text, but printing them to the console
                        # shows the run is alive during long max-effort thinking
                        # phases instead of looking frozen.
                        subtype = event.get("subtype", "")
                        if subtype == "init":
                            print(
                                f"\n[*] Claude session started "
                                f"(model={event.get('model', '?')}, "
                                f"perm={event.get('permissionMode', '?')}). Thinking...",
                                flush=True,
                            )
                        elif subtype == "thinking_tokens":
                            safe_stdout_write(".")

                    elif event_type == "assistant":
                        message = event.get("message", {})
                        for block in message.get("content", []):
                            if block.get("type") == "text":
                                text = block.get("text", "")
                                safe_stdout_write(text)
                                log_file.write(text)
                                log_file.flush()
                            elif block.get("type") == "tool_use":
                                tool_name = block.get("name", "unknown")
                                tool_input = block.get("input", {})
                                if tool_name in ("Write", "Edit"):
                                    file_path = tool_input.get("file_path", "")
                                    info_line = f"\n[Tool: {tool_name}] {file_path}\n"
                                else:
                                    info_line = f"\n[Tool: {tool_name}]\n"
                                safe_stdout_write(info_line)
                                log_file.write(info_line)
                                log_file.flush()

                    elif event_type == "result":
                        result_data = event
                        result_text = event.get("result", "")
                        if result_text:
                            safe_stdout_write("\n" + result_text + "\n")
                            log_file.write("\n" + result_text + "\n")
                            log_file.flush()

                except json.JSONDecodeError:
                    # Non-JSON line, pass through as-is
                    safe_stdout_write(line)
                    log_file.write(line)
                    log_file.flush()

            try:
                process.wait(timeout=900)
            except subprocess.TimeoutExpired:
                print(f"[-] Agent process timed out after 900 seconds.")
                log_file.write(f"\n[ERROR] Process timed out after 900 seconds.\n")
                process.kill()
                process.wait()

            if process.returncode == 0:
                print(f"[+] Agent finished successfully.")
                log_file.write(f"\n[SUCCESS] Process exited cleanly.\n")
            else:
                print(f"[-] Agent finished with error code {process.returncode}")
                log_file.write(
                    f"\n[ERROR] Process exited with code {process.returncode}\n"
                )

        # Save result JSON for metadata extraction (token usage, cost, turns)
        if result_data:
            with open(result_json_path, "w", encoding="utf-8") as f:
                json.dump(result_data, f, indent=2)
            print(f"[+] Claude usage data saved to: {result_json_path}")


class VibeRunner(AgentRunner):
    supports_custom_provider = True

    _original_active_model: Optional[str] = None

    def configure_agent(self):
        """Set vibe's active_model to match the --model and --provider passed to this script."""
        if self.non_local:
            return

        vibe_config_path = Path.home() / ".vibe" / "config.toml"
        if not vibe_config_path.exists():
            return

        try:
            config_text = vibe_config_path.read_text(encoding="utf-8")

            # Find the alias for a [[models]] entry whose name and provider match
            # TOML parsing without a library: scan for [[models]] blocks
            target_alias = None
            in_models_block = False
            current_name = None
            current_provider = None
            current_alias = None

            for line in config_text.splitlines():
                stripped = line.strip()
                if stripped == "[[models]]":
                    # Save previous block if it matched
                    if in_models_block and current_name and current_alias:
                        # Check if this model matches (with optional provider)
                        if self.custom_provider:
                            # When provider is specified, match both provider and model name
                            if current_provider and current_provider.lower() == self.custom_provider.lower() and self.model_name in current_name:
                                target_alias = current_alias
                        else:
                            # When no provider specified, match just the model name
                            if self.model_name in current_name or current_name in self.model_name:
                                target_alias = current_alias
                    in_models_block = True
                    current_name = None
                    current_provider = None
                    current_alias = None
                elif stripped.startswith("[") and in_models_block:
                    # New non-models section — finalize
                    if current_name and current_alias:
                        if self.custom_provider:
                            if current_provider and current_provider.lower() == self.custom_provider.lower() and self.model_name in current_name:
                                target_alias = current_alias
                        else:
                            if self.model_name in current_name or current_name in self.model_name:
                                target_alias = current_alias
                    in_models_block = False
                elif in_models_block:
                    m = re.match(r'^name\s*=\s*"(.+?)"', stripped)
                    if m:
                        current_name = m.group(1).strip()
                    m = re.match(r'^provider\s*=\s*"(.+?)"', stripped)
                    if m:
                        current_provider = m.group(1).strip()
                    m = re.match(r'^alias\s*=\s*"(.+?)"', stripped)
                    if m:
                        current_alias = m.group(1).strip()

            # Check last block
            if in_models_block and current_name and current_alias:
                if self.custom_provider:
                    if current_provider and current_provider.lower() == self.custom_provider.lower() and self.model_name in current_name:
                        target_alias = current_alias
                else:
                    if self.model_name in current_name or current_name in self.model_name:
                        target_alias = current_alias

            if not target_alias:
                provider_str = f"{self.custom_provider}/" if self.custom_provider else ""
                print(
                    f"[-] No vibe model alias found matching '{provider_str}{self.model_name}', using current active_model."
                )
                return

            # Read current active_model so we can restore it later
            am_match = re.search(
                r'^active_model\s*=\s*"(.+?)"', config_text, re.MULTILINE
            )
            if am_match:
                self._original_active_model = am_match.group(1)
                if self._original_active_model == target_alias:
                    return  # Already set correctly

            # Update active_model in the config
            new_config = re.sub(
                r'^(active_model\s*=\s*)".*?"',
                f'\\1"{target_alias}"',
                config_text,
                count=1,
                flags=re.MULTILINE,
            )
            vibe_config_path.write_text(new_config, encoding="utf-8")
            print(
                f"[+] Set vibe active_model to '{target_alias}' (was '{self._original_active_model}')"
            )

        except Exception as e:
            print(f"[-] Failed to configure vibe model: {e}")

    def _restore_vibe_config(self):
        """Restore vibe's active_model to its original value after the run."""
        if self._original_active_model is None:
            return
        vibe_config_path = Path.home() / ".vibe" / "config.toml"
        try:
            config_text = vibe_config_path.read_text(encoding="utf-8")
            new_config = re.sub(
                r'^(active_model\s*=\s*)".*?"',
                f'\\1"{self._original_active_model}"',
                config_text,
                count=1,
                flags=re.MULTILINE,
            )
            vibe_config_path.write_text(new_config, encoding="utf-8")
            print(f"[+] Restored vibe active_model to '{self._original_active_model}'")
        except Exception as e:
            print(f"[-] Failed to restore vibe config: {e}")

    def _get_vibe_session_token_usage(self, start_time: datetime, work_dir: Path = None) -> Dict[str, int]:
        """Extract token usage from Vibe's session log files.
        
        Vibe stores session metadata in ~/.vibe/logs/session/<session_id>/meta.json
        which includes token usage statistics.
        """
        usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        
        # Find the most recent session that started around our run time
        vibe_logs_dir = Path.home() / ".vibe" / "logs" / "session"
        if not vibe_logs_dir.exists():
            return usage
        
        # Look for session directories created within the last few minutes
        # Vibe session dirs are named: session_YYYYMMDD_HHMMSS_xxxxxxxx
        session_dirs = sorted(vibe_logs_dir.iterdir(), reverse=True)
        
        best_match = None
        best_diff = float("inf")
        
        for session_dir in session_dirs:
            if not session_dir.is_dir():
                continue
            
            meta_path = session_dir / "meta.json"
            if not meta_path.exists():
                continue
            
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                
                # First, try to match by working directory if provided
                # This is more reliable than timestamp matching
                if work_dir and meta.get("environment", {}).get("working_directory"):
                    session_work_dir = Path(meta["environment"]["working_directory"]).resolve()
                    if session_work_dir == work_dir.resolve():
                        best_match = meta
                        break  # Exact match, no need to continue
                
                # Fallback to timestamp matching
                session_start_str = meta.get("start_time")
                if session_start_str:
                    # Parse ISO format timestamp: "2026-05-03T23:49:21.668692+00:00"
                    session_start_str_clean = session_start_str.replace("Z", "+00:00")
                    try:
                        session_start = datetime.fromisoformat(session_start_str_clean)
                        # Make start_time timezone-aware if it's naive
                        if start_time.tzinfo is None:
                            # Assume local timezone; convert session_start to local for comparison
                            import zoneinfo
                            try:
                                local_tz = zoneinfo.ZoneInfo(zoneinfo.ZoneInfo.local_key())
                                session_start = session_start.astimezone(local_tz)
                                start_time = start_time.replace(tzinfo=local_tz)
                            except (zoneinfo.ZoneInfoNotFoundError, AttributeError):
                                # Fallback: treat both as naive (remove tzinfo from session_start)
                                session_start = session_start.replace(tzinfo=None)
                        
                        time_diff = abs((session_start - start_time).total_seconds())
                        
                        # Track the closest session within 10 minutes
                        if time_diff <= 600 and time_diff < best_diff:
                            best_diff = time_diff
                            best_match = meta
                    except ValueError:
                        continue
            except Exception:
                continue
        
        # If we found a matching session, extract token usage
        if best_match:
            stats = best_match.get("stats", {})
            usage["prompt_tokens"] = stats.get("session_prompt_tokens", 0)
            usage["completion_tokens"] = stats.get("session_completion_tokens", 0)
            usage["total_tokens"] = usage["prompt_tokens"] + usage["completion_tokens"]
            
            # Also get cost if available
            cost = stats.get("session_cost", 0)
            if cost:
                usage["cost_usd"] = cost
        
        return usage

    def get_model_extra_info(self) -> Dict[str, str]:
        """Read provider/model info from Vibe result JSON."""
        result_path = self.work_dir / VIBE_RESULT_FILENAME
        if not result_path.exists():
            return {}
        try:
            with open(result_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            extra = {}
            if data.get("vibe_version"):
                extra["Vibe Version"] = data["vibe_version"]
            if data.get("model_id"):
                extra["Model ID"] = data["model_id"]
            if data.get("provider"):
                extra["Provider"] = data["provider"]
            if data.get("model_name"):
                extra["Model Name"] = data["model_name"]
            return extra
        except Exception:
            return {}

    def execute_agent(self):
        # Mistral Vibe: use --output streaming for JSON event stream
        # This allows us to parse the output and extract metadata
        prompt_content = read_prompt_file(self.prompt_file)

        cmd = [
            "vibe",
            "-p",
            prompt_content,
            "--output",
            "streaming",
            "--auto-approve",  # Approve all tool calls in programmatic evals
            "--trust",  # Trust the working directory for non-interactive runs
        ]

        env = self.get_env_vars()
        chat_log_path = self.work_dir / CHAT_SESSION_FILENAME
        result_json_path = self.work_dir / VIBE_RESULT_FILENAME

        print(f"[*] Executing: vibe -p <prompt> --output streaming --auto-approve --trust")
        print(f"[*] Output logging to: {chat_log_path}")

        # Track message info for result JSON
        vibe_version = None
        num_turns = 0
        start_time = datetime.now()  # Track when we started the run

        with open(chat_log_path, "w", encoding="utf-8") as log_file:
            process = subprocess.Popen(
                cmd,
                cwd=self.work_dir,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            )

            for line in process.stdout:
                stripped = line.strip()
                if not stripped:
                    continue

                try:
                    event = json.loads(stripped)
                    role = event.get("role", "")

                    # Extract readable text content for chat log and console
                    content = event.get("content", "")
                    if content:
                        # Write content to stdout and log
                        # Skip system prompt content to reduce noise
                        if role != "system":
                            safe_stdout_write(content)
                        log_file.write(line)
                        log_file.flush()

                    # Count assistant messages as turns
                    if role == "assistant":
                        num_turns += 1

                except json.JSONDecodeError:
                    # Non-JSON line, pass through as-is
                    safe_stdout_write(line)
                    log_file.write(line)
                    log_file.flush()

            try:
                process.wait(timeout=900)
            except subprocess.TimeoutExpired:
                print(f"[-] Agent process timed out after 900 seconds.")
                log_file.write(f"\n[ERROR] Process timed out after 900 seconds.\n")
                process.kill()
                process.wait()

            if process.returncode == 0:
                print(f"[+] Agent finished successfully.")
                log_file.write(f"\n[SUCCESS] Process exited cleanly.\n")
            else:
                print(f"[-] Agent finished with error code {process.returncode}")
                log_file.write(
                    f"\n[ERROR] Process exited with code {process.returncode}\n"
                )

        # Try to get vibe version
        try:
            vibe_version = subprocess.check_output(
                ["vibe", "--version"], text=True, timeout=10
            ).strip()
        except Exception:
            vibe_version = None

        # Try to get token usage from Vibe's session logs
        # Vibe stores session metadata with token usage in ~/.vibe/logs/session/
        token_usage = self._get_vibe_session_token_usage(start_time, self.work_dir)

        # Build result data with available metadata
        result_data = {
            "num_turns": num_turns,
        }

        # Add token usage if we found it
        if token_usage["prompt_tokens"] > 0 or token_usage["completion_tokens"] > 0:
            result_data["input_tokens"] = token_usage["prompt_tokens"]
            result_data["output_tokens"] = token_usage["completion_tokens"]
            result_data["total_tokens"] = token_usage["total_tokens"]
            if token_usage.get("cost_usd"):
                result_data["cost_usd"] = token_usage["cost_usd"]

        # Add model info based on non_local mode
        if self.non_local:
            # For non-local mode, try to extract provider from model_name if it contains /
            if "/" in self.model_name:
                parts = self.model_name.split("/", 1)
                result_data["provider"] = parts[0]
                result_data["model_id"] = parts[1]
                result_data["model_name"] = self.model_name
            else:
                result_data["model_id"] = self.model_name
                result_data["model_name"] = self.model_name
        else:
            # For local mode, model info comes from LM Studio
            result_data["model_name"] = self.model_name

        if vibe_version:
            result_data["vibe_version"] = vibe_version

        # Save result JSON for metadata extraction
        with open(result_json_path, "w", encoding="utf-8") as f:
            json.dump(result_data, f, indent=2)
        print(f"[+] Vibe metadata saved to: {result_json_path}")

        if self.restore_agent_config:
            self._restore_vibe_config()


class OpenCodeRunner(AgentRunner):
    supports_custom_provider = True

    NON_CHAT_MODEL_PATTERNS = (
        "whisper",
    )

    def _model_ref(self) -> Optional[str]:
        """Return the OpenCode provider/model reference to request, if known."""
        if self.custom_provider:
            return f"{self.custom_provider}/{self.model_name}"
        if not self.non_local:
            provider_name = self._resolve_global_provider_for_model(self.model_name)
            if provider_name:
                return f"{provider_name}/{self.model_name}"
        if self.non_local:
            # In non-local mode we do not synthesize a provider. If the caller
            # supplied a full OpenCode model reference, pass it through. For a
            # bare model id, resolve the provider from the user's OpenCode config.
            if "/" in self.model_name:
                return self.model_name
            provider_name = self._resolve_global_provider_for_model(self.model_name)
            return f"{provider_name}/{self.model_name}" if provider_name else None
        return f"lmstudio/{self.model_name}"

    @staticmethod
    def _model_id_from_ref(model_ref: str) -> str:
        """Extract the model id from an OpenCode provider/model reference."""
        return model_ref.split("/", 1)[1] if "/" in model_ref else model_ref

    @staticmethod
    def _resolve_global_provider_for_model(model_name: str) -> Optional[str]:
        """Find a provider in the user's OpenCode config that declares model_name."""
        config_path = Path.home() / ".config" / "opencode" / "opencode.json"
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                config = json.load(f)
        except Exception:
            return None

        providers = config.get("provider", {})
        if not isinstance(providers, dict):
            return None

        for provider_name, provider_config in providers.items():
            if not isinstance(provider_config, dict):
                continue
            models = provider_config.get("models", {})
            if isinstance(models, dict) and model_name in models:
                return provider_name

        return None

    def get_model_extra_info(self) -> Dict[str, str]:
        result_path = self.work_dir / OPENCODE_RESULT_FILENAME
        if not result_path.exists():
            return {}
        try:
            with open(result_path) as f:
                data = json.load(f)
            extra = {}
            if data.get("provider_id"):
                extra["Provider"] = data["provider_id"].title()
            if data.get("model_id"):
                extra["Model ID"] = data["model_id"]
            if data.get("opencode_version"):
                extra["OpenCode Version"] = data["opencode_version"]
            return extra
        except Exception:
            return {}

    def configure_agent(self):
        # OpenCode supports opencode.json
        config = {
            "$schema": "https://opencode.ai/config.json",
            "permission": "allow",  # Bypass all permission prompts for unattended evaluation
        }

        model_ref = self._model_ref()
        if model_ref:
            config["model"] = model_ref

        should_define_local_provider = (
            not self.non_local
            and (
                is_llama_server_provider(self.custom_provider)
                or (
                    not self.custom_provider
                    and self._resolve_global_provider_for_model(self.model_name) is None
                )
            )
        )

        if should_define_local_provider:
            # Default case: define an OpenAI-compatible local provider.
            context_limit = get_env_int(
                "LLM_EVAL_LOCAL_CONTEXT_LIMIT", DEFAULT_LOCAL_CONTEXT_LIMIT
            )
            output_limit = get_env_int(
                "LLM_EVAL_LOCAL_OUTPUT_LIMIT", DEFAULT_LOCAL_OUTPUT_LIMIT
            )
            base_url = LOCAL_API_URL
            provider_id = LOCAL_PROVIDER_ID
            config["provider"] = {
                provider_id: {
                    "npm": "@ai-sdk/openai-compatible",
                    "name": LOCAL_PROVIDER_NAME,
                    "options": {"baseURL": base_url},
                    "models": {
                        self.model_name: {
                            "name": self.model_name,
                            "limit": {
                                "context": context_limit,
                                "output": output_limit,
                            },
                        }
                    },
                }
            }
            print(
                "[*] OpenCode local limits: "
                f"context={context_limit}, output={output_limit} tokens "
                "(override with LLM_EVAL_LOCAL_CONTEXT_LIMIT / "
                "LLM_EVAL_LOCAL_OUTPUT_LIMIT)."
            )

        with open(self.work_dir / "opencode.json", "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)

    def execute_agent(self):
        prompt_content = read_prompt_file(self.prompt_file)

        lower_model_name = self.model_name.lower()
        if any(pattern in lower_model_name for pattern in self.NON_CHAT_MODEL_PATTERNS):
            message = (
                f"OpenCode requires a chat/completions model, but '{self.model_name}' "
                "appears to be a non-chat model."
            )
            chat_log_path = self.work_dir / CHAT_SESSION_FILENAME
            result_json_path = self.work_dir / OPENCODE_RESULT_FILENAME
            print(f"[-] {message}")
            with open(chat_log_path, "w", encoding="utf-8") as log_file:
                log_file.write(f"[ERROR] {message}\n")
            with open(result_json_path, "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "error": message,
                        "provider_id": self.custom_provider,
                        "model_id": self.model_name,
                        "num_turns": 0,
                    },
                    f,
                    indent=2,
                )
            return

        opencode_prompt_prefix = (
            "OpenCode harness note: use only tools that are present in the current "
            "OpenCode tool schema. For file changes, use write/edit/bash as exposed "
            "by OpenCode; do not call apply_patch unless it is explicitly listed as "
            "an available tool.\n\n"
        )
        prompt_content = opencode_prompt_prefix + prompt_content

        cmd = [
            "opencode",
            "run",
            prompt_content,
            "--format",
            "json",
            "--print-logs",
            "--dir",
            str(self.work_dir.resolve()),
        ]

        model_ref = self._model_ref()
        if model_ref:
            cmd.extend(["--model", model_ref])

        env = self.get_env_vars()
        chat_log_path = self.work_dir / CHAT_SESSION_FILENAME
        result_json_path = self.work_dir / OPENCODE_RESULT_FILENAME

        if model_ref:
            print(
                f"[*] Executing: opencode run <prompt> --model {model_ref} --format json --print-logs"
            )
        else:
            print(
                "[*] Executing: opencode run <prompt> --format json --print-logs (using OpenCode default model)"
            )
        print(f"[*] Output logging to: {chat_log_path}")

        # Patterns to suppress from terminal and log file (high-volume internal bus noise)
        _stderr_noise = re.compile(r"service=bus\b")

        # Accumulate token usage from step_finish events
        total_input = 0
        total_output = 0
        total_reasoning = 0
        total_cost = 0.0
        cache_read = 0
        cache_write = 0
        num_turns = 0

        # Provider/model info parsed from log output
        opencode_version = None
        provider_id = None
        model_id = None
        error_messages: List[str] = []

        with open(chat_log_path, "w", encoding="utf-8") as log_file:
            process = subprocess.Popen(
                cmd,
                cwd=PROJECT_ROOT,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            )

            # Read stdout (JSON events) and stderr (logs) concurrently
            import threading

            _log_version_re = re.compile(r"service=default\s+version=(\S+)")
            _log_llm_re = re.compile(
                r"service=llm\s+providerID=(\S+)\s+modelID=(\S+).*\bsmall=false\b"
            )

            def drain_stderr():
                nonlocal opencode_version, provider_id, model_id
                for line in process.stderr:
                    if _stderr_noise.search(line):
                        continue
                    sys.stderr.write(line)
                    sys.stderr.flush()
                    log_file.write(line)
                    log_file.flush()
                    # Parse opencode version from first log line
                    if opencode_version is None:
                        m = _log_version_re.search(line)
                        if m:
                            opencode_version = m.group(1)
                    # Parse provider/model from llm service lines (main build agent only)
                    if provider_id is None:
                        m = _log_llm_re.search(line)
                        if m:
                            provider_id = m.group(1)
                            model_id = m.group(2)
                    if " stream error" in line or "service=session.processor" in line and " error=" in line:
                        error_messages.append(line.strip())

            stderr_thread = threading.Thread(target=drain_stderr, daemon=True)
            stderr_thread.start()

            for line in process.stdout:
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    event = json.loads(stripped)
                    event_type = event.get("type", "")

                    # Extract readable text from JSON events
                    if event_type == "text":
                        text = event.get("content", event.get("text", ""))
                        if text:
                            safe_stdout_write(text)
                            log_file.write(text)
                            log_file.flush()
                    elif event_type == "tool_call":
                        tool_name = event.get("name", event.get("tool", "unknown"))
                        info_line = f"\n[Tool: {tool_name}]\n"
                        safe_stdout_write(info_line)
                        log_file.write(info_line)
                        log_file.flush()
                    elif event_type == "step_finish":
                        # Accumulate per-step token usage
                        part = event.get("part", {})
                        tokens = part.get("tokens", {})
                        total_input += tokens.get("input", 0)
                        total_output += tokens.get("output", 0)
                        total_reasoning += tokens.get("reasoning", 0)
                        total_cost += part.get("cost", 0)
                        cache = tokens.get("cache", {})
                        cache_read += cache.get("read", 0)
                        cache_write += cache.get("write", 0)
                        num_turns += 1
                        log_file.write(line)
                        log_file.flush()
                    elif event_type == "error":
                        error = event.get("error", {})
                        data = error.get("data", {})
                        message = data.get("message") or error.get("message") or stripped
                        error_messages.append(str(message))
                        log_file.write(line)
                        log_file.flush()
                    else:
                        # Log other event types as raw JSON for debugging
                        log_file.write(line)
                        log_file.flush()

                except json.JSONDecodeError:
                    # Non-JSON line (e.g. log output), pass through
                    safe_stdout_write(line)
                    log_file.write(line)
                    log_file.flush()

            stderr_thread.join(timeout=5)

            try:
                process.wait(timeout=900)
            except subprocess.TimeoutExpired:
                print(f"[-] Agent process timed out after 900 seconds.")
                log_file.write(f"\n[ERROR] Process timed out after 900 seconds.\n")
                process.kill()
                process.wait()

            if model_ref and model_id:
                expected_model_id = self._model_id_from_ref(model_ref)
                if model_id != expected_model_id:
                    error_messages.append(
                        "OpenCode selected "
                        f"{provider_id}/{model_id}, expected {model_ref}"
                    )

            if process.returncode == 0 and not error_messages:
                print(f"[+] Agent finished successfully.")
                log_file.write(f"\n[SUCCESS] Process exited cleanly.\n")
            else:
                error_code = process.returncode
                if error_messages and error_code == 0:
                    print("[-] Agent finished with provider/tool error.")
                else:
                    print(f"[-] Agent finished with error code {error_code}")
                log_file.write(
                    f"\n[ERROR] Process exited with code {error_code}\n"
                )
                for message in error_messages[-3:]:
                    log_file.write(f"[ERROR] {message}\n")

        # Save accumulated token usage to result JSON
        if total_input > 0 or total_output > 0 or error_messages:
            result_data = {
                "input_tokens": total_input,
                "output_tokens": total_output,
                "total_tokens": total_input + total_output,
                "reasoning_tokens": total_reasoning,
                "cache_read_tokens": cache_read,
                "cache_write_tokens": cache_write,
                "cost_usd": total_cost,
                "num_turns": num_turns,
            }
            if provider_id:
                result_data["provider_id"] = provider_id
            if model_id:
                result_data["model_id"] = model_id
            if opencode_version:
                result_data["opencode_version"] = opencode_version
            if error_messages:
                result_data["error"] = error_messages[-1]
            with open(result_json_path, "w", encoding="utf-8") as f:
                json.dump(result_data, f, indent=2)
            print(f"[+] OpenCode usage data saved to: {result_json_path}")


class CodexRunner(AgentRunner):
    @staticmethod
    def _get_exec_help(codex_bin: str) -> str:
        try:
            return subprocess.check_output(
                [codex_bin, "exec", "--help"],
                text=True,
                timeout=10,
                stderr=subprocess.STDOUT,
            )
        except Exception:
            return ""

    @staticmethod
    def _get_supported_models(codex_bin: str) -> List[str]:
        try:
            output = subprocess.check_output(
                [codex_bin, "debug", "models"],
                text=True,
                timeout=15,
                stderr=subprocess.STDOUT,
            )
            json_start = output.find("{")
            if json_start < 0:
                return []
            catalog = json.loads(output[json_start:])
            return [
                model.get("slug", "")
                for model in catalog.get("models", [])
                if model.get("slug") and model.get("visibility") != "hidden"
            ]
        except Exception:
            return []

    def get_model_extra_info(self) -> Dict[str, str]:
        result_path = self.work_dir / CODEX_RESULT_FILENAME
        if not result_path.exists():
            return {}
        try:
            with open(result_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            extra = {}
            if data.get("provider_id"):
                extra["Provider"] = data["provider_id"]
            if data.get("model_id"):
                extra["Model ID"] = data["model_id"]
            if data.get("codex_version"):
                extra["Codex Version"] = data["codex_version"]
            if data.get("session_id"):
                extra["Session ID"] = data["session_id"]
            return extra
        except Exception:
            return {}

    @staticmethod
    def _usage_from_obj(obj: dict) -> Dict[str, int]:
        """Normalize the token usage shapes emitted by different Codex CLI versions."""
        if not isinstance(obj, dict):
            return {}

        input_tokens = (
            obj.get("input_tokens")
            or obj.get("prompt_tokens")
            or obj.get("input")
            or obj.get("prompt")
            or 0
        )
        output_tokens = (
            obj.get("output_tokens")
            or obj.get("completion_tokens")
            or obj.get("output")
            or obj.get("completion")
            or 0
        )
        reasoning_tokens = (
            obj.get("reasoning_output_tokens")
            or obj.get("reasoning_tokens")
            or obj.get("reasoning")
            or 0
        )
        cache_read = (
            obj.get("cached_input_tokens")
            or obj.get("cache_read_input_tokens")
            or obj.get("cache_read_tokens")
            or obj.get("cached")
            or 0
        )

        total_tokens = (
            obj.get("total_tokens")
            or obj.get("total")
            or (input_tokens + output_tokens)
        )

        return {
            "input_tokens": int(input_tokens or 0),
            "output_tokens": int(output_tokens or 0),
            "total_tokens": int(total_tokens or 0),
            "reasoning_tokens": int(reasoning_tokens or 0),
            "cache_read_tokens": int(cache_read or 0),
        }

    @staticmethod
    def _find_usage_objects(event: dict) -> List[dict]:
        found = []

        def visit(value):
            if isinstance(value, dict):
                if isinstance(value.get("usage"), dict):
                    found.append(value["usage"])
                # Some JSONL variants put token fields directly under a stats object.
                if any(
                    key in value
                    for key in (
                        "input_tokens",
                        "prompt_tokens",
                        "output_tokens",
                        "completion_tokens",
                        "total_tokens",
                    )
                ):
                    found.append(value)
                for child in value.values():
                    visit(child)
            elif isinstance(value, list):
                for child in value:
                    visit(child)

        visit(event)
        return found

    @staticmethod
    def _extract_session_id(event: dict) -> Optional[str]:
        for key in ("session_id", "thread_id", "conversation_id", "id"):
            value = event.get(key)
            if isinstance(value, str) and value:
                return value
        for key in ("session", "thread", "conversation"):
            value = event.get(key)
            if isinstance(value, dict):
                nested = CodexRunner._extract_session_id(value)
                if nested:
                    return nested
        return None

    @staticmethod
    def _extract_readable_event(event: dict) -> Optional[str]:
        event_type = str(event.get("type", event.get("event", "")))

        def text_from_item(item):
            if not isinstance(item, dict):
                return None
            item_type = str(item.get("type", item.get("kind", ""))).lower()
            role = str(item.get("role", "")).lower()
            if role == "user":
                return None
            if any(name in item_type for name in ("tool", "command")):
                name = item.get("name") or item.get("command") or item_type
                return f"\n[Tool: {name}]\n"
            if any(name in item_type for name in ("assistant", "agent", "message")):
                for key in ("text", "content", "message", "delta"):
                    value = item.get(key)
                    if isinstance(value, str) and value:
                        return value
                    if isinstance(value, list):
                        pieces = []
                        for part in value:
                            if isinstance(part, dict):
                                part_text = part.get("text") or part.get("content")
                                if isinstance(part_text, str):
                                    pieces.append(part_text)
                        if pieces:
                            return "".join(pieces)
            return None

        item_text = text_from_item(event.get("item"))
        if item_text:
            return item_text

        if "message" in event_type or "agent" in event_type or "assistant" in event_type:
            for key in ("text", "content", "message", "delta"):
                value = event.get(key)
                if isinstance(value, str) and value:
                    return value

        return None

    def execute_agent(self):
        if not self.non_local:
            print("[-] Codex runner currently supports only --non-local ChatGPT account mode.")
            sys.exit(1)

        prompt_content = read_prompt_file(self.prompt_file)

        codex_bin = shutil.which("codex") or "codex"
        last_message_path = self.work_dir / CODEX_LAST_MESSAGE_FILENAME
        exec_help = self._get_exec_help(codex_bin)
        supported_models = self._get_supported_models(codex_bin)

        if supported_models and self.model_name not in supported_models:
            print(
                f"[-] Codex ChatGPT account mode does not list model '{self.model_name}'."
            )
            print("[*] Available Codex models include:")
            for model in supported_models[:20]:
                print(f"    - {model}")
            if len(supported_models) > 20:
                print(f"    ... and {len(supported_models) - 20} more")
            sys.exit(1)

        cmd = [
            codex_bin,
            "exec",
        ]

        if "--json" in exec_help:
            cmd.append("--json")
        if "--color" in exec_help:
            cmd.extend(["--color", "never"])
        if "--skip-git-repo-check" in exec_help:
            cmd.append("--skip-git-repo-check")

        if "--ask-for-approval" in exec_help:
            if "--sandbox" in exec_help:
                cmd.extend(["--sandbox", "workspace-write"])
            cmd.extend(["--ask-for-approval", "never"])
        elif "--dangerously-bypass-approvals-and-sandbox" in exec_help:
            cmd.append("--dangerously-bypass-approvals-and-sandbox")
        elif "--sandbox" in exec_help:
            cmd.extend(["--sandbox", "workspace-write"])

        if "--output-last-message" in exec_help:
            cmd.extend(["--output-last-message", CODEX_LAST_MESSAGE_FILENAME])

        if self.model_name:
            cmd.extend(["--model", self.model_name])

        cmd.append("-")

        env = self.get_env_vars()
        chat_log_path = self.work_dir / CHAT_SESSION_FILENAME
        events_path = self.work_dir / CODEX_EVENTS_FILENAME
        result_json_path = self.work_dir / CODEX_RESULT_FILENAME

        print("[*] Executing: codex exec --json --output-last-message CODEX_LAST_MESSAGE.TXT ...")
        print(f"[*] Output logging to: {chat_log_path}")

        total_input = 0
        total_output = 0
        total_reasoning = 0
        cache_read = 0
        num_turns = 0
        session_id = None
        last_usage_total = 0

        with (
            open(chat_log_path, "w", encoding="utf-8") as log_file,
            open(events_path, "w", encoding="utf-8") as events_file,
        ):
            process = subprocess.Popen(
                cmd,
                cwd=self.work_dir,
                env=env,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            )
            send_stdin(process, prompt_content)

            for line in process.stdout:
                stripped = line.strip()
                if not stripped:
                    continue

                try:
                    event = json.loads(stripped)
                    events_file.write(line)
                    events_file.flush()

                    if session_id is None:
                        session_id = self._extract_session_id(event)

                    readable = self._extract_readable_event(event)
                    if readable:
                        safe_stdout_write(readable)
                        log_file.write(readable)
                        log_file.flush()

                    event_type = str(event.get("type", event.get("event", ""))).lower()
                    usage_objects = self._find_usage_objects(event)
                    if usage_objects and (
                        "turn" in event_type
                        or "complete" in event_type
                        or "usage" in event_type
                        or event.get("usage")
                    ):
                        usage = self._usage_from_obj(usage_objects[0])
                        if usage["total_tokens"] > 0:
                            # Codex reports usage at turn boundaries. If a future CLI version
                            # reports cumulative totals, use the positive delta instead of
                            # double-counting the full cumulative snapshot.
                            current_total = usage["total_tokens"]
                            if current_total >= last_usage_total and last_usage_total > 0:
                                scale = (current_total - last_usage_total) / current_total
                            else:
                                scale = 1
                            total_input += round(usage["input_tokens"] * scale)
                            total_output += round(usage["output_tokens"] * scale)
                            total_reasoning += round(usage["reasoning_tokens"] * scale)
                            cache_read += round(usage["cache_read_tokens"] * scale)
                            last_usage_total = max(last_usage_total, current_total)
                            num_turns += 1

                except json.JSONDecodeError:
                    safe_stdout_write(line)
                    log_file.write(line)
                    log_file.flush()

            try:
                process.wait(timeout=900)
            except subprocess.TimeoutExpired:
                print(f"[-] Agent process timed out after 900 seconds.")
                log_file.write(f"\n[ERROR] Process timed out after 900 seconds.\n")
                process.kill()
                process.wait()

            if process.returncode == 0:
                print(f"\n[+] Agent finished successfully.")
                log_file.write(f"\n[SUCCESS] Process exited cleanly.\n")
            else:
                print(f"\n[-] Agent finished with error code {process.returncode}")
                log_file.write(
                    f"\n[ERROR] Process exited with code {process.returncode}\n"
                )

        if last_message_path.exists() and last_message_path.stat().st_size > 0:
            try:
                final_text = last_message_path.read_text(encoding="utf-8")
                with open(chat_log_path, "a", encoding="utf-8") as log_file:
                    log_file.write("\n\n--- Final Assistant Message ---\n")
                    log_file.write(final_text)
                    log_file.write("\n")
            except Exception as e:
                print(f"[-] Failed to append Codex final message: {e}")

        result_data = {
            "input_tokens": total_input,
            "output_tokens": total_output,
            "total_tokens": total_input + total_output,
            "reasoning_tokens": total_reasoning,
            "cache_read_tokens": cache_read,
            "num_turns": num_turns,
            "provider_id": "OpenAI",
            "model_id": self.model_name,
        }
        if session_id:
            result_data["session_id"] = session_id
        try:
            result_data["codex_version"] = subprocess.check_output(
                [codex_bin, "--version"], text=True, timeout=10
            ).strip()
        except Exception:
            pass

        with open(result_json_path, "w", encoding="utf-8") as f:
            json.dump(result_data, f, indent=2)
        print(f"[+] Codex usage data saved to: {result_json_path}")


class CrushRunner(AgentRunner):
    def execute_agent(self):
        # Crush accepts prompts on stdin; keep the full prompt out of argv.
        prompt_content = read_prompt_file(self.prompt_file)

        cmd = ["crush", "run", "-y"]
        self._run_process(
            cmd,
            input_text=prompt_content,
            display_cmd="crush run -y < prompt",
        )


class PiRunner(AgentRunner):
    supports_custom_provider = True

    def configure_agent(self):
        """Write ~/.pi/agent/models.json for the selected local OpenAI server."""
        if self.non_local:
            return

        self.models_json_path = Path.home() / ".pi" / "agent" / "models.json"
        self._original_models_json = None

        # Back up existing models.json if present
        if self.models_json_path.exists():
            self._original_models_json = self.models_json_path.read_text(
                encoding="utf-8"
            )

        config = {
            "providers": {
                self.custom_provider or LOCAL_PROVIDER_ID: {
                    "baseUrl": LOCAL_API_URL,
                    "api": "openai-completions",
                    "apiKey": LOCAL_API_KEY,
                    "compat": {
                        "supportsDeveloperRole": False,
                        "supportsReasoningEffort": False,
                    },
                    "models": [{"id": self.model_name}],
                }
            }
        }

        self.models_json_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.models_json_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
        print(f"[+] Wrote Pi models.json for {LOCAL_PROVIDER_NAME}: {self.models_json_path}")

    def _restore_pi_models_json(self):
        """Restore original models.json after the run."""
        if not hasattr(self, "models_json_path"):
            return
        if self._original_models_json is not None:
            self.models_json_path.write_text(
                self._original_models_json, encoding="utf-8"
            )
            print(f"[*] Restored original Pi models.json")
        elif self.models_json_path.exists():
            self.models_json_path.unlink()
            print(f"[*] Removed temporary Pi models.json")

    def get_model_extra_info(self) -> Dict[str, str]:
        """Read provider/model info captured during the run."""
        result_path = self.work_dir / PI_RESULT_FILENAME
        if not result_path.exists():
            result_path = self.work_dir / PI_WIGGUM_RESULT_FILENAME
        if not result_path.exists():
            return {}
        try:
            with open(result_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            extra = {}
            if data.get("provider_id"):
                extra["Provider"] = data["provider_id"].title()
            if data.get("model_id"):
                extra["Model ID"] = data["model_id"]
            return extra
        except Exception:
            return {}

    def execute_agent(self):
        # Pi reads the prompt from stdin here to avoid Windows command-line length limits.
        # Uses --mode json to get JSONL output with token usage in message_end events
        try:
            self._execute_pi()
        finally:
            self._restore_pi_models_json()

    def _execute_pi(self):
        prompt_content = read_prompt_file(self.prompt_file)
        result_data = self._run_pi_attempt(prompt_content, "PI_EVENTS.JSONL")

        if result_data["input_tokens"] > 0 or result_data["output_tokens"] > 0:
            result_json_path = self.work_dir / PI_RESULT_FILENAME
            with open(result_json_path, "w", encoding="utf-8") as f:
                json.dump(self._pi_result_metrics(result_data), f, indent=2)
            print(f"[+] Token metrics saved to {PI_RESULT_FILENAME}")

    def _build_pi_command(self) -> List[str]:
        cmd = ["pi", "--mode", "json", "--print", "--no-session"]

        if self.non_local:
            # Cloud mode: parse "provider/model" to split provider and model,
            # otherwise let pi use its configured defaults from settings.json.
            # Note: pi provider names can differ from simple names (e.g.
            # "google-gemini-cli" for OAuth vs "google" for API key).
            if "/" in self.model_name:
                provider, model_id = self.model_name.split("/", 1)
                cmd += ["--provider", provider, "--model", model_id]
            else:
                cmd += ["--model", self.model_name]
        else:
            # Local mode: use the provider configured in models.json
            cmd += [
                "--provider",
                self.custom_provider or LOCAL_PROVIDER_ID,
                "--model",
                self.model_name,
            ]
        return cmd

    def _run_pi_attempt(
        self,
        prompt_content: str,
        raw_jsonl_filename: str,
        append_chat: bool = False,
        attempt_number: Optional[int] = None,
        timeout_seconds: int = 900,
    ) -> Dict:
        cmd = self._build_pi_command()
        env = self.get_env_vars()
        chat_log_path = self.work_dir / CHAT_SESSION_FILENAME
        raw_jsonl_path = self.work_dir / raw_jsonl_filename

        approve_flag = " --approve" if "--approve" in cmd else ""
        print(f"[*] Executing: pi --mode json --print --no-session{approve_flag} ... < prompt")
        print(f"[*] Output logging to: {chat_log_path}")
        if raw_jsonl_filename != PI_RESULT_FILENAME:
            print(f"[*] Raw Pi JSONL logging to: {raw_jsonl_path}")

        # Accumulate token usage from assistant message_end events
        total_input = 0
        total_output = 0
        total_cost = 0.0
        cache_read = 0
        cache_write = 0
        num_turns = 0
        pi_provider = None
        pi_model = None
        timed_out = False

        chat_mode = "a" if append_chat else "w"
        with open(chat_log_path, chat_mode, encoding="utf-8") as log_file, open(
            raw_jsonl_path, "w", encoding="utf-8"
        ) as raw_file:
            if append_chat and attempt_number is not None:
                header = f"\n\n===== PI WIGGUM ATTEMPT {attempt_number:03d} =====\n"
                safe_stdout_write(header)
                log_file.write(header)
                log_file.flush()
            process = subprocess.Popen(
                cmd,
                cwd=self.work_dir,
                env=env,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                shell=(sys.platform == "win32"),  # pi is a .cmd on Windows
            )
            line_queue: queue.Queue[Optional[str]] = queue.Queue()

            def _read_stdout():
                try:
                    for stdout_line in process.stdout:
                        line_queue.put(stdout_line)
                finally:
                    line_queue.put(None)

            threading.Thread(target=_read_stdout, daemon=True).start()
            send_stdin(process, prompt_content)

            deadline = time.monotonic() + timeout_seconds
            stdout_done = False
            while not stdout_done:
                if process.poll() is None and time.monotonic() >= deadline:
                    timed_out = True
                    print(f"[-] Agent process timed out after {timeout_seconds} seconds.")
                    log_file.write(f"\n[ERROR] Process timed out after {timeout_seconds} seconds.\n")
                    log_file.flush()
                    process.kill()

                try:
                    line = line_queue.get(timeout=0.2)
                except queue.Empty:
                    continue

                if line is None:
                    stdout_done = True
                    continue

                raw_file.write(line)
                raw_file.flush()
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    event = json.loads(stripped)
                    event_type = event.get("type", "")

                    if event_type == "message_end":
                        msg = event.get("message", {})
                        if msg.get("role") == "assistant":
                            # Extract token usage
                            usage = msg.get("usage", {})
                            total_input += usage.get("input", 0)
                            total_output += usage.get("output", 0)
                            cache_read += usage.get("cacheRead", 0)
                            cache_write += usage.get("cacheWrite", 0)
                            cost_obj = usage.get("cost", {})
                            if isinstance(cost_obj, dict):
                                total_cost += cost_obj.get("total", 0)
                            elif isinstance(cost_obj, (int, float)):
                                total_cost += cost_obj
                            num_turns += 1
                            # Capture provider/model from first assistant message
                            if pi_provider is None:
                                pi_provider = msg.get("provider")
                                pi_model = msg.get("model")

                    elif event_type == "message_update":
                        # Extract text deltas for the chat log and console
                        ae = event.get("assistantMessageEvent", {})
                        ae_type = ae.get("type", "")
                        if ae_type == "text_delta":
                            delta = ae.get("delta", "")
                            if delta:
                                safe_stdout_write(delta)
                                log_file.write(delta)
                                log_file.flush()
                        elif ae_type == "tool_call_start":
                            tool_name = ae.get("name", "unknown")
                            info_line = f"\n[Tool: {tool_name}]\n"
                            safe_stdout_write(info_line)
                            log_file.write(info_line)
                            log_file.flush()

                    elif event_type == "agent_end":
                        # Final summary — log as-is for debugging
                        log_file.write(line)
                        log_file.flush()
                    else:
                        # Other events (session, agent_start, turn_start, etc.)
                        pass

                except json.JSONDecodeError:
                    # Non-JSON line, pass through
                    safe_stdout_write(line)
                    log_file.write(line)
                    log_file.flush()

            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                timed_out = True
                print(f"[-] Agent process did not exit after timeout kill.")
                log_file.write(f"\n[ERROR] Process did not exit after timeout kill.\n")
                process.kill()
                process.wait()

            if process.returncode == 0:
                print(f"\n[+] Agent finished successfully.")
                log_file.write(f"\n[SUCCESS] Process exited cleanly.\n")
            else:
                print(f"\n[-] Agent finished with error code {process.returncode}")
                log_file.write(
                    f"\n[ERROR] Process exited with code {process.returncode}\n"
                )

        return {
            "input_tokens": total_input,
            "output_tokens": total_output,
            "total_tokens": total_input + total_output,
            "cache_read_tokens": cache_read,
            "cache_write_tokens": cache_write,
            "cost_usd": total_cost,
            "num_turns": num_turns,
            "provider_id": pi_provider,
            "model_id": pi_model,
            "returncode": process.returncode,
            "timed_out": timed_out,
            "raw_jsonl": raw_jsonl_filename,
        }

    def _pi_result_metrics(self, result_data: Dict) -> Dict:
        metrics = {
            "input_tokens": result_data.get("input_tokens", 0),
            "output_tokens": result_data.get("output_tokens", 0),
            "total_tokens": result_data.get("total_tokens", 0),
            "cache_read_tokens": result_data.get("cache_read_tokens", 0),
            "cache_write_tokens": result_data.get("cache_write_tokens", 0),
            "cost_usd": result_data.get("cost_usd", 0.0),
            "num_turns": result_data.get("num_turns", 0),
        }
        if result_data.get("provider_id"):
            metrics["provider_id"] = result_data["provider_id"]
        if result_data.get("model_id"):
            metrics["model_id"] = result_data["model_id"]
        return metrics


class PiWiggumRunner(PiRunner):
    def _wiggum_prompt_kind(self) -> str:
        prompt_stem = self.prompt_file.stem
        if prompt_stem.startswith("office_prompt"):
            return "office"
        if prompt_stem.startswith("elevator_prompt"):
            return "elevator"
        return "generic"

    def _wiggum_required_files(self) -> List[str]:
        kind = self._wiggum_prompt_kind()
        if kind == "office":
            return [
                "index.html",
                "person.js",
                "world.js",
                "elevator_logic.js",
                "elevator.js",
                "sim.js",
                "elevator_logic_test.js",
            ]
        if kind == "elevator":
            return ["index.html", "person.js", "elevator.js"]
        return ["index.html"]

    def _build_pi_command(self) -> List[str]:
        cmd = super()._build_pi_command()
        if "--approve" not in cmd:
            cmd.insert(5, "--approve")
        return cmd

    def execute_agent(self):
        try:
            self._execute_wiggum_loop()
        finally:
            self._restore_pi_models_json()

    def _execute_wiggum_loop(self):
        start = time.monotonic()
        prompt_content = read_prompt_file(self.prompt_file)
        aggregate = {
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
            "cache_read_tokens": 0,
            "cache_write_tokens": 0,
            "cost_usd": 0.0,
            "num_turns": 0,
            "attempts": 0,
            "passed": False,
            "status": "failed",
            "terminal_reason": "failed",
            "elapsed_seconds": 0.0,
            "checker_summaries": [],
        }

        while True:
            elapsed = time.monotonic() - start
            if elapsed >= PI_WIGGUM_MAX_SECONDS:
                aggregate["terminal_reason"] = "time_cap_reached"
                break

            attempt = aggregate["attempts"] + 1
            remaining = max(1, int(PI_WIGGUM_MAX_SECONDS - elapsed))
            attempt_timeout = min(900, remaining)
            raw_filename = f"PI_WIGGUM_ATTEMPT_{attempt:03d}.JSONL"
            print(f"[*] Pi Wiggum attempt {attempt} starting; {remaining}s remain before cap.")

            attempt_result = self._run_pi_attempt(
                prompt_content,
                raw_filename,
                append_chat=True,
                attempt_number=attempt,
                timeout_seconds=attempt_timeout,
            )
            aggregate["attempts"] = attempt
            self._add_pi_attempt_metrics(aggregate, attempt_result)

            checker_summary = self._run_wiggum_checkers()
            aggregate["checker_summaries"].append(checker_summary)
            self._write_wiggum_result(aggregate, start)

            if checker_summary["passed"]:
                aggregate["passed"] = True
                aggregate["status"] = "success"
                aggregate["terminal_reason"] = "completed"
                break

            if time.monotonic() - start >= PI_WIGGUM_MAX_SECONDS:
                aggregate["terminal_reason"] = "time_cap_reached"
                break

            prompt_content = self._build_repair_prompt(checker_summary, attempt)

        self._write_wiggum_result(aggregate, start)
        if aggregate["status"] == "success":
            print(f"[+] Pi Wiggum checks passed after {aggregate['attempts']} attempt(s).")
        else:
            print(f"[-] Pi Wiggum stopped with status {aggregate['terminal_reason']} after {aggregate['attempts']} attempt(s).")

    def _add_pi_attempt_metrics(self, aggregate: Dict, attempt_result: Dict):
        for key in (
            "input_tokens",
            "output_tokens",
            "total_tokens",
            "cache_read_tokens",
            "cache_write_tokens",
            "num_turns",
        ):
            aggregate[key] += attempt_result.get(key, 0) or 0
        aggregate["cost_usd"] += attempt_result.get("cost_usd", 0.0) or 0.0
        if attempt_result.get("provider_id") and not aggregate.get("provider_id"):
            aggregate["provider_id"] = attempt_result["provider_id"]
        if attempt_result.get("model_id") and not aggregate.get("model_id"):
            aggregate["model_id"] = attempt_result["model_id"]

    def _run_wiggum_checkers(self) -> Dict:
        static = self._run_checker(["node", "../../static_check.js", "."], "static")
        runtime = self._run_checker(["node", "../../runtime_check.js", "."], "runtime")
        logic_test = None
        if self._wiggum_prompt_kind() == "office":
            logic_test = self._run_checker(["node", "elevator_logic_test.js"], "elevator logic test")

        static_json = self._read_json_file(self.work_dir / "static_check.json")
        runtime_json = self._read_json_file(self.work_dir / "runtime_check.json")

        missing_files = [
            name for name in self._wiggum_required_files()
            if not (self.work_dir / name).is_file()
        ]
        static_errors = static_json.get("static_errors", []) if isinstance(static_json, dict) else []
        console_errors = runtime_json.get("console_errors", []) if isinstance(runtime_json, dict) else []
        page_errors = runtime_json.get("page_errors", []) if isinstance(runtime_json, dict) else []
        loaded = bool(runtime_json.get("loaded")) if isinstance(runtime_json, dict) else False
        nonblank = bool(runtime_json.get("nonblank_canvas")) if isinstance(runtime_json, dict) else False
        frames = int(runtime_json.get("animation_frames", 0) or 0) if isinstance(runtime_json, dict) else 0
        objects = int(runtime_json.get("scene_object_count", 0) or 0) if isinstance(runtime_json, dict) else 0
        changes = int(runtime_json.get("dynamic_changes", 0) or 0) if isinstance(runtime_json, dict) else 0

        passed = (
            static["returncode"] == 0
            and runtime["returncode"] == 0
            and not missing_files
            and not static_errors
            and not console_errors
            and not page_errors
            and loaded
            and nonblank
            and frames >= 2
            and objects > 0
            and changes > 0
        )
        if logic_test is not None:
            passed = passed and logic_test["returncode"] == 0

        summary = {
            "passed": passed,
            "static": static,
            "runtime": runtime,
            "logic_test": logic_test,
            "missing_files": missing_files,
            "static_errors": static_errors[:10],
            "console_errors": console_errors[:10],
            "page_errors": page_errors[:10],
            "loaded": loaded,
            "nonblank_canvas": nonblank,
            "animation_frames": frames,
            "scene_object_count": objects,
            "dynamic_changes": changes,
        }
        self._append_checker_summary_to_chat(summary)
        return summary

    def _run_checker(self, cmd: List[str], label: str) -> Dict:
        print(f"[*] Running {label} checker: {' '.join(cmd)}")
        try:
            result = subprocess.run(
                cmd,
                cwd=self.work_dir,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=300,
            )
            output = "\n".join(part for part in (result.stdout, result.stderr) if part)
            safe_stdout_write(output)
            return {
                "returncode": result.returncode,
                "output": output[-6000:],
            }
        except subprocess.TimeoutExpired as exc:
            output = "\n".join(
                part for part in (exc.stdout or "", exc.stderr or "") if part
            )
            return {
                "returncode": 124,
                "output": f"{output}\n{label} checker timed out after 300 seconds."[-6000:],
            }

    def _read_json_file(self, path: Path) -> Dict:
        if not path.exists():
            return {}
        try:
            return json.loads(path.read_text(encoding="utf-8", errors="ignore"))
        except json.JSONDecodeError:
            return {}

    def _append_checker_summary_to_chat(self, summary: Dict):
        with open(self.work_dir / CHAT_SESSION_FILENAME, "a", encoding="utf-8") as f:
            f.write("\n\n===== PI WIGGUM CHECKER SUMMARY =====\n")
            f.write(self._checker_text(summary))
            f.write("\n")

    def _checker_text(self, summary: Dict) -> str:
        lines = [
            f"passed: {summary['passed']}",
            f"static return code: {summary['static']['returncode']}",
            f"runtime return code: {summary['runtime']['returncode']}",
            f"loaded: {summary['loaded']}",
            f"nonblank_canvas: {summary['nonblank_canvas']}",
            f"animation_frames: {summary['animation_frames']}",
            f"scene_object_count: {summary['scene_object_count']}",
            f"dynamic_changes: {summary['dynamic_changes']}",
        ]
        if summary.get("logic_test") is not None:
            lines.append(f"elevator logic test return code: {summary['logic_test']['returncode']}")
        if summary.get("missing_files"):
            lines.append("missing_files:")
            lines.extend(f"- {value}" for value in summary["missing_files"])
        for label, values in (
            ("static_errors", summary["static_errors"]),
            ("page_errors", summary["page_errors"]),
            ("console_errors", summary["console_errors"]),
        ):
            if values:
                lines.append(f"{label}:")
                lines.extend(f"- {value}" for value in values[:10])
        for label in ("static", "runtime", "logic_test"):
            if summary.get(label) is None:
                continue
            output = summary[label].get("output", "").strip()
            if output:
                lines.append(f"{label} checker output:")
                lines.append(output[-3000:])
        return "\n".join(lines)

    def _build_repair_prompt(self, summary: Dict, attempt: int) -> str:
        checker_text = self._checker_text(summary)
        kind = self._wiggum_prompt_kind()
        files = ", ".join(self._wiggum_required_files())
        if kind == "office":
            scenario = "office-building simulation"
            extra_criteria = [
                "- all required office files exist",
                "- `node elevator_logic_test.js` passes",
                "- the simulation still reads as an office day with workers, visitors, world geometry, elevator logic, and UI",
            ]
            check_commands = [
                "node elevator_logic_test.js",
                "node ../../static_check.js .",
                "node ../../runtime_check.js .",
            ]
        elif kind == "elevator":
            scenario = "elevator simulation"
            extra_criteria = ["- the elevator simulation continues running in the browser"]
            check_commands = [
                "node ../../static_check.js .",
                "node ../../runtime_check.js .",
            ]
        else:
            scenario = "browser simulation"
            extra_criteria = ["- the simulation continues running in the browser"]
            check_commands = [
                "node ../../static_check.js .",
                "node ../../runtime_check.js .",
            ]

        criteria = "\n".join([
            "- zero static checker errors",
            "- zero startup, console, and page runtime errors",
            "- loaded page with a visible nonblank Three.js canvas",
            "- animation frames observed",
            "- scene objects observed",
            "- visible motion / dynamic changes observed",
            *extra_criteria,
        ])
        commands = "\n".join(check_commands)

        return f"""The approved {scenario} implementation did not pass evaluator-owned checks after attempt {attempt}.

Edit the existing files and create any missing required files from the original prompt: {files}. Do not replace this task with a different prompt's artifact, do not ask the human for decisions, and do not stop until the checks pass.

Required success criteria:
{criteria}

Checker feedback to fix:

{checker_text}

After editing, run:
{commands}

If any checker still reports failure, fix the files and rerun the checks before reporting completion.
"""

    def _write_wiggum_result(self, aggregate: Dict, start: float):
        aggregate["elapsed_seconds"] = round(time.monotonic() - start, 3)
        aggregate["duration_ms"] = int(aggregate["elapsed_seconds"] * 1000)
        path = self.work_dir / PI_WIGGUM_RESULT_FILENAME
        with open(path, "w", encoding="utf-8") as f:
            json.dump(aggregate, f, indent=2)
        print(f"[+] Pi Wiggum aggregate result saved to {PI_WIGGUM_RESULT_FILENAME}")


# --- Factory ---


AGENT_RUNNERS = {
    "gemini": GeminiRunner,
    "agy": GeminiRunner,
    "antigravity": GeminiRunner,
    "claude": ClaudeRunner,
    "codex": CodexRunner,
    "vibe": VibeRunner,
    "mistral": VibeRunner,  # Backward compatibility alias
    "opencode": OpenCodeRunner,
    "crush": CrushRunner,
    "pi": PiRunner,
    "pi-wiggum": PiWiggumRunner,
}
CLI_AGENT_CHOICES = tuple(name for name in AGENT_RUNNERS if name != "mistral")


def get_runner(agent: str) -> Optional[type[AgentRunner]]:
    return AGENT_RUNNERS.get(agent.lower())


# --- Main ---


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Evaluate local LLM agents.")
    parser.add_argument("--model", required=True, help="LM Studio model key/identifier")
    parser.add_argument(
        "--agent",
        required=True,
        choices=CLI_AGENT_CHOICES,
        help="Agent to evaluate (vibe = Mistral Vibe, gemini/agy = Antigravity CLI)",
    )
    parser.add_argument(
        "--prompt-file",
        required=True,
        type=Path,
        help="Path to the initial prompt file",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        default=True,
        help="Run in headless mode (default: True)",
    )
    parser.add_argument(
        "--non-local",
        action="store_true",
        help="Disable LM Studio-related functionality and use default inference providers",
    )
    parser.add_argument(
        "--provider",
        help="Local provider (e.g., omlx or llama-server) or custom OpenCode/Vibe/Gemini provider",
    )
    parser.add_argument(
        "--restore-agent-config",
        action="store_true",
        help="Restore agent config (e.g. vibe active_model) to its original value after the run",
    )
    return parser


def main(argv: Optional[List[str]] = None):
    args = build_argument_parser().parse_args(argv)

    runner_cls = get_runner(args.agent)
    if not runner_cls:
        print(f"[-] Unknown agent: {args.agent}")
        sys.exit(1)

    # Warn if --provider is used with --non-local for runners that do not use it.
    if args.provider and args.non_local and not runner_cls.supports_custom_provider:
        print("[!] Warning: --provider flag is ignored when using --non-local mode")
    elif is_llama_server_provider(args.provider):
        use_llama_server_provider()
        print(f"[*] Using llama-server provider at {LOCAL_API_URL}")
    elif is_omlx_provider(args.provider):
        use_omlx_provider()
        print(f"[*] Using oMLX provider at {LOCAL_API_URL}")

    if not args.prompt_file.exists():
        print(f"[-] Prompt file not found: {args.prompt_file}")
        sys.exit(1)

    runner = runner_cls(
        args.agent,
        args.model,
        args.prompt_file,
        args.headless,
        args.non_local,
        args.restore_agent_config,
        custom_provider=args.provider if runner_cls.supports_custom_provider else None,
    )

    runner.confirm_workspace_overwrite()

    skip_local_model_load = False
    if args.agent == "opencode" and not args.non_local and not args.provider:
        provider_name = OpenCodeRunner._resolve_global_provider_for_model(args.model)
        skip_local_model_load = provider_name not in (None, "lmstudio", "lm-studio")

    if not args.non_local and not args.provider and not skip_local_model_load:
        load_lms_model(args.model)

    runner.run()


if __name__ == "__main__":
    main()

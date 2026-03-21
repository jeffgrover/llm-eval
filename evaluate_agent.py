#!/usr/bin/env python3
import argparse
import os
import subprocess
import time
import shutil
import sys
import json
import re
import platform
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

# --- Configuration & Constants ---
LM_STUDIO_API_URL = "http://localhost:1234/v1"
LM_STUDIO_REST_BASE = "http://localhost:1234"
EVALS_DIR = Path("evals")
SERVER_LOG_FILENAME = "SERVER.LOG"
CHAT_SESSION_FILENAME = "CHAT_SESSION.TXT"
CLAUDE_RESULT_FILENAME = "CLAUDE_RESULT.JSON"
GEMINI_RESULT_FILENAME = "GEMINI_RESULT.JSON"
OPENCODE_RESULT_FILENAME = "OPENCODE_RESULT.JSON"

# Tracks whether the lms CLI is responsive (set during model loading)
_lms_cli_available = True

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

def lms_api_request(path: str, method: str = "GET", data: dict = None, timeout: int = 15) -> Optional[dict]:
    """Makes an HTTP request to the LM Studio REST API. Returns parsed JSON or None on failure."""
    url = f"{LM_STUDIO_REST_BASE}{path}"
    try:
        body = json.dumps(data).encode("utf-8") if data else None
        req = urllib.request.Request(url, data=body, method=method)
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, json.JSONDecodeError) as e:
        print(f"[-] LM Studio API request failed ({method} {path}): {e}")
        return None


def load_lms_model(model_key: str):
    """Loads a model into LM Studio, preferring the REST API over the CLI."""
    global _lms_cli_available

    # Try REST API first
    models = lms_api_request("/api/v0/models")
    if models is not None:
        # REST API is reachable — use it exclusively
        model_list = models if isinstance(models, list) else models.get("data", models.get("models", []))

        target_loaded = False
        others_loaded = []

        for m in model_list:
            model_id = m.get("id", m.get("path", ""))
            state = m.get("state", "")
            if model_key in model_id:
                if state == "loaded":
                    target_loaded = True
                    print(f"[+] Model '{model_key}' is already loaded — skipping reload.")
            elif state == "loaded":
                others_loaded.append(m)

        # Unload other models first
        for other in others_loaded:
            other_id = other.get("id", other.get("path", ""))
            instance_id = other.get("instance_id", other_id)
            print(f"[*] Unloading other model: {other_id}")
            lms_api_request("/api/v1/models/unload", method="POST", data={"model": instance_id})

        if target_loaded:
            return  # Already loaded, nothing to do

        print(f"[*] Loading model '{model_key}' via REST API...")
        result = lms_api_request("/api/v1/models/load", method="POST", data={"model": model_key}, timeout=120)
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
        print("[-] 'lms' command not found. Please ensure LM Studio CLI is installed and bootstrapped.")
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
        print("[-] 'lms' command not found. Please ensure LM Studio CLI is installed and bootstrapped.")
        sys.exit(1)



# --- Metadata & Reporting ---

class MetadataCollector:
    @staticmethod
    def get_hardware_info() -> Dict[str, str]:
        info = {
            "Machine": platform.machine(),
            "Processor": platform.processor(),
            "System": platform.system(),
            "Release": platform.release()
        }
        if sys.platform == "darwin":
            try:
                # Try to get detailed Mac info
                cmd = ["system_profiler", "SPHardwareDataType"]
                result = subprocess.run(cmd, capture_output=True, text=True)
                output = result.stdout
                
                chip_match = re.search(r"Chip:\s+(.+)", output)
                mem_match = re.search(r"Memory:\s+(.+)", output)
                
                if chip_match: info["Chip"] = chip_match.group(1)
                if mem_match: info["Memory"] = mem_match.group(1)
            except Exception:
                pass
        elif sys.platform == "linux":
            try:
                # Try to get machine manufacturer from DMI
                vendor_path = "/sys/devices/virtual/dmi/id/sys_vendor"
                if os.path.exists(vendor_path):
                    with open(vendor_path, 'r') as f:
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
                gpu_result = subprocess.run(gpu_devices_cmd, capture_output=True, text=True)
                
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
                        detail_result = subprocess.run(detail_cmd, capture_output=True, text=True)
                        
                        # Parse the output for VGA or 3D controller lines
                        for line in detail_result.stdout.splitlines():
                            if "VGA compatible controller" in line or "3D controller" in line:
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
                    ["powershell", "-NoProfile", "-Command",
                     "(Get-CimInstance Win32_Processor).Name"],
                    text=True, timeout=10
                ).strip()
                if cpu_out:
                    info["Processor"] = cpu_out
            except Exception:
                pass

            try:
                # GPU info via PowerShell
                gpu_out = subprocess.check_output(
                    ["powershell", "-NoProfile", "-Command",
                     "(Get-CimInstance Win32_VideoController).Name"],
                    text=True, timeout=10
                ).strip()
                if gpu_out:
                    # May return multiple lines if multiple GPUs
                    gpu_lines = [g.strip() for g in gpu_out.splitlines() if g.strip()]
                    for i, gpu in enumerate(gpu_lines):
                        if i == 0:
                            info["GPU Model"] = gpu
                        else:
                            info[f"GPU {i+1}"] = gpu
            except Exception:
                pass

            try:
                # RAM via PowerShell
                ram_out = subprocess.check_output(
                    ["powershell", "-NoProfile", "-Command",
                     "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory"],
                    text=True, timeout=10
                ).strip()
                if ram_out:
                    ram_bytes = int(ram_out)
                    ram_gb = round(ram_bytes / (1024 ** 3))
                    info["Memory"] = f"{ram_gb} GB"
            except Exception:
                pass

            try:
                # Windows version detail
                ver_out = subprocess.check_output(
                    ["powershell", "-NoProfile", "-Command",
                     "(Get-CimInstance Win32_OperatingSystem).Caption"],
                    text=True, timeout=10
                ).strip()
                if ver_out:
                    info["System"] = ver_out
            except Exception:
                pass
        return info

    @staticmethod
    def get_software_versions(agent_binary: str, non_local: bool = False) -> Dict[str, str]:
        def strip_ansi(text: str) -> str:
            ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
            return ansi_escape.sub('', text)

        versions = {}
        
        if not non_local:
            # LM Studio CLI Version (with timeout to avoid hangs on Windows)
            try:
                lms_out = subprocess.check_output(["lms", "version"], text=True, timeout=10).strip()
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
                        versions["LM Studio CLI Version"] = lms_out.splitlines()[-1] if lms_out else "Unknown"
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
                        ["mdls", "-name", "kMDItemVersion", "/Applications/LM Studio.app"], 
                        text=True
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
                            match = re.search(r'LM-Studio-([^-]+)', app_image_path)
                            if match:
                                return match.group(1)
                            return ""

                        # Sort by version (using natural sorting for numbers)
                        app_images.sort(key=lambda x: [int(part) if part.isdigit() else part
                                                         for part in extract_version(x).split('.')])

                        latest_app = app_images[-1]  # Last one after sort
                        version = extract_version(latest_app)
                        versions["LM Studio App Version"] = version if version else "Unknown"
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
                        '| Select-Object -ExpandProperty DisplayVersion'
                    )
                    ps_out = subprocess.check_output(
                        ["powershell", "-NoProfile", "-Command", ps_cmd],
                        text=True, timeout=10
                    ).strip()
                    versions["LM Studio App Version"] = ps_out if ps_out else "Not Found"
                except Exception:
                    versions["LM Studio App Version"] = "Unknown"
        
        # Agent Version
        try:
            # Most agents support --version
            agent_ver = subprocess.check_output([agent_binary, "--version"], text=True).strip()
            versions[agent_binary] = strip_ansi(agent_ver)
        except Exception:
            versions[agent_binary] = "Unknown"
            
        return versions

    @staticmethod
    def get_token_usage(log_path: Path, chat_log_path: Optional[Path] = None) -> Dict[str, int]:
        """Parses server logs, agent chat logs, or Claude result JSON for token usage statistics."""
        usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

        # Check for Claude result JSON first (from --output-format stream-json)
        if chat_log_path:
            claude_result_path = chat_log_path.parent / CLAUDE_RESULT_FILENAME
            if claude_result_path.exists():
                try:
                    with open(claude_result_path, 'r') as f:
                        result_data = json.load(f)
                    # Prefer modelUsage for comprehensive per-model totals
                    model_usage = result_data.get("modelUsage", {})
                    if model_usage:
                        for model_id, model_data in model_usage.items():
                            usage["prompt_tokens"] += (
                                model_data.get("inputTokens", 0) +
                                model_data.get("cacheCreationInputTokens", 0) +
                                model_data.get("cacheReadInputTokens", 0)
                            )
                            usage["completion_tokens"] += model_data.get("outputTokens", 0)
                            cache_read = model_data.get("cacheReadInputTokens", 0)
                            if cache_read:
                                usage["cache_read_tokens"] = cache_read
                    else:
                        # Fallback to top-level usage object
                        usage_data = result_data.get("usage", {})
                        usage["prompt_tokens"] = (
                            usage_data.get("input_tokens", 0) +
                            usage_data.get("cache_creation_input_tokens", 0) +
                            usage_data.get("cache_read_input_tokens", 0)
                        )
                        usage["completion_tokens"] = usage_data.get("output_tokens", 0)
                        cache_read = usage_data.get("cache_read_input_tokens", 0)
                        if cache_read:
                            usage["cache_read_tokens"] = cache_read
                    usage["total_tokens"] = usage["prompt_tokens"] + usage["completion_tokens"]
                    # Include cost if available
                    cost = result_data.get("cost_usd") or result_data.get("total_cost_usd")
                    if cost:
                        usage["cost_usd"] = cost
                    num_turns = result_data.get("num_turns")
                    if num_turns:
                        usage["num_turns"] = num_turns
                    if usage["total_tokens"] > 0:
                        return usage
                except Exception as e:
                    print(f"[-] Error parsing Claude result JSON: {e}")

        # Check for Gemini result JSON
        if chat_log_path:
            gemini_result_path = chat_log_path.parent / GEMINI_RESULT_FILENAME
            if gemini_result_path.exists():
                try:
                    with open(gemini_result_path, 'r') as f:
                        result_data = json.load(f)
                    stats = result_data.get("stats", {})
                    if stats:
                        usage["prompt_tokens"] = stats.get("input_tokens", 0)
                        usage["completion_tokens"] = stats.get("output_tokens", 0)
                        usage["total_tokens"] = stats.get("total_tokens", 0)
                        
                        cached = stats.get("cached", 0)
                        if cached:
                            usage["cache_read_tokens"] = cached
                        
                        num_turns = stats.get("tool_calls", None) # approximate depending on use case or could just drop
                        
                        if usage["total_tokens"] > 0:
                            return usage
                except Exception as e:
                    print(f"[-] Error parsing Gemini result JSON: {e}")

        # Check for OpenCode result JSON
        if chat_log_path:
            opencode_result_path = chat_log_path.parent / OPENCODE_RESULT_FILENAME
            if opencode_result_path.exists():
                try:
                    with open(opencode_result_path, 'r') as f:
                        result_data = json.load(f)
                    usage["prompt_tokens"] = result_data.get("input_tokens", 0)
                    usage["completion_tokens"] = result_data.get("output_tokens", 0)
                    usage["total_tokens"] = result_data.get("total_tokens", 0)
                    cache_read = result_data.get("cache_read_tokens", 0)
                    if cache_read:
                        usage["cache_read_tokens"] = cache_read
                    cost = result_data.get("cost_usd", 0)
                    if cost:
                        usage["cost_usd"] = cost
                    num_turns = result_data.get("num_turns", 0)
                    if num_turns:
                        usage["num_turns"] = num_turns
                    if usage["total_tokens"] > 0:
                        return usage
                except Exception as e:
                    print(f"[-] Error parsing OpenCode result JSON: {e}")

        # Try server log first (LM Studio)
        if log_path and log_path.exists():
            try:
                with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    
                # Attempt to parse from JSON 'usage' blocks (LMS 0.3.x style)
                json_pattern = re.compile(r'"usage":\s*({[^}]+})', re.DOTALL)
                json_matches = json_pattern.findall(content)

                if json_matches:
                    for match in json_matches:
                        try:
                            usage_data = json.loads(match)
                            usage["prompt_tokens"] += usage_data.get("prompt_tokens", 0)
                            usage["completion_tokens"] += usage_data.get("completion_tokens", 0)
                            usage["total_tokens"] += usage_data.get("total_tokens", 0)
                        except json.JSONDecodeError:
                            # Fallback for malformed JSON within the matched block
                            p_tok = re.search(r'"prompt_tokens":\s*(\d+)', match)
                            c_tok = re.search(r'"completion_tokens":\s*(\d+)', match)
                            t_tok = re.search(r'"total_tokens":\s*(\d+)', match)
                            if p_tok: usage["prompt_tokens"] += int(p_tok.group(1))
                            if c_tok: usage["completion_tokens"] += int(c_tok.group(1))
                            if t_tok: usage["total_tokens"] += int(t_tok.group(1))
                else:
                    # Fallback to parse from new "prompt eval time" and "eval time" lines (LMS 0.4.x style)
                    prompt_tokens_match = re.search(r'prompt eval time =.* (\d+) tokens', content)
                    if prompt_tokens_match:
                        usage["prompt_tokens"] = int(prompt_tokens_match.group(1))
                    
                    completion_tokens_match = re.search(r'^\s*eval time =.* (\d+) tokens', content, re.MULTILINE)
                    if completion_tokens_match:
                        usage["completion_tokens"] = int(completion_tokens_match.group(1))
                        
                    usage["total_tokens"] = usage["prompt_tokens"] + usage["completion_tokens"]
            except Exception as e:
                print(f"[-] Error parsing server log token usage: {e}")

        # If we still have no tokens, or want to supplement, try chat log (Agent output)
        if usage["total_tokens"] == 0 and chat_log_path and chat_log_path.exists():
            try:
                with open(chat_log_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                
                # Heuristics for common agent token reporting patterns
                # Example: "Tokens: 123 prompt, 45 completion"
                # Example: "Usage: prompt_tokens=121, completion_tokens=40"
                patterns = [
                    (r'prompt_tokens["\']?\s*[:=]\s*(\d+)', r'completion_tokens["\']?\s*[:=]\s*(\d+)'),
                    (r'(\d+)\s+prompt tokens', r'(\d+)\s+completion tokens'),
                    (r'Tokens used:\s*(\d+)\s*input,\s*(\d+)\s*output', None)
                ]
                
                for p_pat, c_pat in patterns:
                    pm = re.search(p_pat, content, re.IGNORECASE)
                    if pm:
                        usage["prompt_tokens"] = int(pm.group(1))
                        if c_pat:
                            cm = re.search(c_pat, content, re.IGNORECASE)
                            if cm: usage["completion_tokens"] = int(cm.group(1))
                        elif pm.lastindex >= 2:
                            usage["completion_tokens"] = int(pm.group(2))
                        
                        usage["total_tokens"] = usage["prompt_tokens"] + usage["completion_tokens"]
                        if usage["total_tokens"] > 0: break
            except Exception:
                pass
            
        return usage

    @staticmethod
    def get_prompt_processing_time(log_path: Path) -> float:
        """Calculates total time spent on prompt processing from logs."""
        if not log_path.exists():
            return 0.0
            
        total_duration = 0.0
        
        try:
            with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
                
            # Regex for timestamp: [YYYY-MM-DD HH:MM:SS]
            ts_pattern = re.compile(r'^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]')
            
            in_block = False
            block_start_time = None
            last_timestamp = None
            
            for line in lines:
                match = ts_pattern.match(line)
                if not match: continue
                
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
                            total_duration += (current_ts - block_start_time).total_seconds()
                        in_block = False
                        block_start_time = None
            
            if in_block and block_start_time and last_timestamp:
                 total_duration += (last_timestamp - block_start_time).total_seconds()
        except Exception as e:
            print(f"[-] Error calculating prompt processing time: {e}")
            
        return total_duration

    @staticmethod
    def parse_model_info(model_key: str, non_local: bool = False, agent_name: str = None) -> Dict[str, str]:
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
            elif agent_name == "gemini":
                info["Provider"] = "Google"
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
                    model_list = models if isinstance(models, list) else models.get("data", models.get("models", []))
                    for m in model_list:
                        mid = m.get("id", m.get("path", ""))
                        if model_key in mid:
                            if m.get("arch"): info["Architecture"] = m["arch"]
                            if m.get("quantization"): info["Quantization"] = m["quantization"]
                            if m.get("max_context_length"): info["Max Context"] = str(m["max_context_length"])
                            if m.get("compatibility_type"): info["Compatibility"] = m["compatibility_type"]
                            if m.get("publisher"): info["Publisher"] = m["publisher"]
                            if m.get("state"): info["State"] = m["state"]
                            if mid: info["Full Name"] = mid
                            break
                else:
                    # Fallback to lms ls CLI
                    ls_output = subprocess.check_output(["lms", "ls"], text=True, timeout=10)
                    for line in ls_output.splitlines():
                        if "LOADED" in line:
                            parts = re.split(r'\s{2,}', line.strip())
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

def format_duration_human(seconds: float) -> str:
    """Formats a duration in seconds into a human-readable string (H:M:S)."""
    if seconds < 0:
        return "0.00 sec"
    if seconds < 60:
        return f"{seconds:.2f} sec"
    
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    remaining_seconds = seconds % 60
    
    parts = []
    if hours > 0:
        parts.append(f"{hours}h")
    if minutes > 0:
        parts.append(f"{minutes}m")
    if remaining_seconds > 0 or not parts:
        parts.append(f"{remaining_seconds:.1f}s")
    
    return " ".join(parts)

def generate_html_report(work_dir: Path, metadata: Dict, prompt_text: str, duration_seconds: float, agent_name: str) -> Path:
    """Generates a self-contained HTML report."""
    report_path = work_dir / "summary.html"
    
    # Calculate Tokens/Sec
    tokens = metadata.get("Tokens", {})
    total_output = tokens.get("completion_tokens", 0)
    prompt_time_seconds = metadata.get("PromptTime", 0.0)
    
    duration_str = format_duration_human(duration_seconds)
    prompt_time_str = format_duration_human(prompt_time_seconds)
    
    tps = 0
    num_turns = tokens.get('num_turns', 0)
    if num_turns > 1:
        # Multi-turn: prompt processing is interleaved with generation at each step,
        # so use total wall time for effective throughput
        if total_output > 0 and duration_seconds > 0:
            tps = round(total_output / duration_seconds, 2)
    elif duration_seconds > prompt_time_seconds:
        generation_seconds = duration_seconds - prompt_time_seconds
        tps = round(total_output / generation_seconds, 2)
    elif total_output > 0 and duration_seconds > 0:
        tps = round(total_output / duration_seconds, 2)

    # Build optional extra token metric rows (cost, turns from cloud APIs)
    extra_token_rows = ""
    cost_usd = tokens.get('cost_usd')
    if cost_usd:
        extra_token_rows += f'<div class="token-stat"><span class="label">Cost:</span> <span class="value">${cost_usd:.4f}</span></div>'
    cache_read = tokens.get('cache_read_tokens')
    if cache_read:
        extra_token_rows += f'<div class="token-stat"><span class="label">Cache Read:</span> <span class="value">{cache_read:,}</span></div>'
    num_turns = tokens.get('num_turns')
    if num_turns:
        extra_token_rows += f'<div class="token-stat"><span class="label">Turns:</span> <span class="value">{num_turns}</span></div>'

    # Collect artifacts
    artifacts = []
    for p in work_dir.iterdir():
        if p.name == "summary.html": continue
        if p.is_dir(): continue
        artifacts.append(p.name)
    artifacts.sort()
    
    # Python dict to HTML Table Rows helper
    def dict_to_rows(d):
        rows = ""
        for k, v in d.items():
            if k == "Full Name": continue # Skip redundant full name if used elsewhere or show it
            rows += f'<div class="info-row"><span class="label">{k}:</span> <span class="value">{v}</span></div>'
        return rows

    # Agent Name Mapping
    agent_display_names = {
        "mistral": "Mistral Vibe",
        "gemini": "Gemini CLI",
        "claude": "Claude Code",
        "crush": "Charmbracelet Crush",
        "opencode": "OpenCode CLI"
    }
    display_agent_name = agent_display_names.get(agent_name.lower(), agent_name)

    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Evaluation Report: {metadata['Model'].get('Full Name')}</title>
        <style>
            body {{ font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; background: #f5f3ff; color: #1d1d1f; }}
            .container {{ max-width: 1200px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); overflow: hidden; }}
            header {{ background: #1a202c; color: white; padding: 24px; border-bottom: 4px solid #7c3aed; }}
            h1 {{ margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.5px; }}
            .header-info {{ display: flex; justify-content: space-between; font-size: 14px; opacity: 0.9; margin-top: 8px; font-weight: 400; color: #a0aec0; }}
            .header-info span {{ color: #a78bfa; font-weight: 500; }}
            
            .meta-grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; padding: 24px; background: #faf5ff; border-bottom: 1px solid #e9d5ff; }}
            .meta-item {{ background: white; padding: 20px; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid #ede9fe; display: flex; flex-direction: column; }}
            .meta-item h3 {{ margin: 0 0 12px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #8b5cf6; font-weight: 700; }}
            
            .info-row {{ display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; border-bottom: 1px solid #f5f3ff; padding-bottom: 4px; }}
            .info-row:last-child {{ border-bottom: none; margin-bottom: 0; }}
            .label {{ color: #8b5cf6; font-weight: 500; }}
            .value {{ color: #2d3748; font-weight: 600; text-align: right; max-width: 70%; word-break: break-all; }}
            
            .prompt-card {{ grid-column: span 2; position: relative; }}
            .prompt-content {{ flex: 1; overflow-y: auto; font-size: 13px; font-family: "Menlo", "Monaco", "Courier New", monospace; line-height: 1.5; color: #4a5568; background: #f5f3ff; padding: 12px; border-radius: 6px; border: 1px solid #ede9fe; max-height: 200px; white-space: pre-wrap; }}
            .prompt-footer {{ margin-top: 10px; font-size: 12px; color: #8b5cf6; text-align: right; border-top: 1px solid #ede9fe; padding-top: 8px; }}
            
            .tokens-content {{ flex: 1; display: flex; flex-direction: column; justify-content: space-between; }}
            .token-stat {{ display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px; }}
            .token-stat.total {{ margin-top: 8px; padding-top: 8px; border-top: 1px solid #ede9fe; font-weight: 700; color: #2d3748; }}
            .token-rate {{ margin-top: auto; padding-top: 12px; text-align: center; color: #7c3aed; font-weight: 600; font-size: 14px; background: #ddd6fe; border-radius: 6px; padding: 8px; }}
            
            .content-area {{ display: flex; height: 800px; }}
            .sidebar {{ width: 280px; background: #faf5ff; border-right: 1px solid #e9d5ff; overflow-y: auto; padding: 16px; }}
            .sidebar h3 {{ margin: 0 0 16px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #8b5cf6; font-weight: 700; }}
            
            .main-view {{ flex: 1; padding: 0; display: flex; flex-direction: column; background: white; }}
            
            .file-list-item {{ display: block; padding: 10px 12px; margin-bottom: 6px; background: white; border: 1px solid #e9d5ff; border-radius: 8px; cursor: pointer; text-decoration: none; color: #4a5568; font-size: 12px; font-weight: 500; transition: all 0.2s; }}
            .file-list-item:hover {{ background: #ede9fe; border-color: #8b5cf6; color: #5b21b6; transform: translateY(-1px); }}
            .file-list-item.active {{ background: #8b5cf6; color: white; border-color: #8b5cf6; box-shadow: 0 4px 6px rgba(139, 92, 246, 0.2); }}
            .file-list-item .badge {{ font-size: 9px; text-transform: uppercase; background: #ede9fe; color: #8b5cf6; padding: 1px 4px; border-radius: 4px; float: right; margin-top: 2px; }}
            .file-list-item.active .badge {{ background: rgba(255,255,255,0.2); color: white; }}
            
            #preview-frame {{ width: 100%; height: 100%; border: none; background: white; }}
        </style>
        <script>
            function loadFile(filename, type) {{
                const frame = document.getElementById('preview-frame');
                document.querySelectorAll('.file-list-item').forEach(el => el.classList.remove('active'));
                event.currentTarget.classList.add('active');
                frame.srcdoc = ''; // Reset
                frame.src = filename;
            }}

            function loadHTMLPreview(filename, b64) {{
                const frame = document.getElementById('preview-frame');
                document.querySelectorAll('.file-list-item').forEach(el => el.classList.remove('active'));
                event.currentTarget.classList.add('active');
                
                try {{
                    const decoded = atob(b64);
                    // Don't escape HTML tags - we want to render the HTML content
                    frame.srcdoc = decoded;
                }} catch (e) {{
                    frame.srcdoc = '<html><body><p>Error decoding preview: ' + e + '</p></body></html>';
                }}
            }}

            function loadSource(filename, b64) {{
                const frame = document.getElementById('preview-frame');
                document.querySelectorAll('.file-list-item').forEach(el => el.classList.remove('active'));
                event.currentTarget.classList.add('active');
                
                try {{
                    const decoded = atob(b64);
                    const escaped = decoded.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    frame.src = 'about:blank';
                    frame.srcdoc = `<html><body style="margin:0;padding:20px;background:#1e1e1e;color:#d4d4d4;font-family:monospace;font-size:13px;line-height:1.5;"><pre style="white-space:pre-wrap;word-break:break-all;">${{escaped}}</pre></body></html>`;
                }} catch (e) {{
                    frame.srcdoc = '<html><body><p>Error decoding source: ' + e + '</p></body></html>';
                }}
            }}
        </script>
    </head>
    <body>
        <div class="container">
            <header>
                <h1>Agent Evaluation Report</h1>
                <div class="header-info">
                    <div>Agent: <span>{display_agent_name}</span> &nbsp;&nbsp;|&nbsp;&nbsp; Model: <span>{metadata['Model'].get('Full Name')}</span></div>
                    <div>Generation Time: <span>{duration_str}</span></div>
                </div>
            </header>
            
            <div class="meta-grid">
                <div class="meta-item">
                    <h3>System Info</h3>
                    <div>{dict_to_rows(metadata['Hardware'])}</div>
                </div>
                <div class="meta-item">
                    <h3>Software Versions</h3>
                    <div>{dict_to_rows(metadata['Software'])}</div>
                </div>
                <div class="meta-item">
                    <h3>Model Details</h3>
                    <div>{dict_to_rows(metadata['Model'])}</div>
                </div>
                <div class="meta-item prompt-card">
                     <h3>Prompt</h3>
                     <div class="prompt-content">{prompt_text}</div>
                     <div class="prompt-footer">Processing Time: {prompt_time_str}</div>
                </div>
                <div class="meta-item">
                    <h3>Token Metrics</h3>
                    <div class="tokens-content">
                        <div>
                            <div class="token-stat"><span class="label">Input:</span> <span class="value">{tokens.get('prompt_tokens', 0)}</span></div>
                            <div class="token-stat"><span class="label">Output:</span> <span class="value">{tokens.get('completion_tokens', 0)}</span></div>
                            <div class="token-stat total"><span class="label">Total:</span> <span class="value">{tokens.get('total_tokens', 0)}</span></div>
                            {extra_token_rows}
                        </div>
                        <div class="token-rate">~{tps} tokens/sec</div>
                    </div>
                </div>
            </div>

            <div class="content-area">
                <div class="sidebar">
                    <h3>Artifacts</h3>
    """
    
    import base64
    for art in artifacts:
        is_html = art.lower().endswith(('.html', '.htm'))
        is_image = art.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.svg'))
        
        if is_html:
            # Add Preview item with base64 content for proper HTML rendering
            try:
                b64_content = base64.b64encode((work_dir / art).read_bytes()).decode()
                html_content += f"""
                <div class="file-list-item" onclick="loadHTMLPreview('{art}', '{b64_content}')">
                    {art} <span class="badge">Preview</span>
                </div>
                """
            except: pass
            # Add Source item
            try:
                b64_content = base64.b64encode((work_dir / art).read_bytes()).decode()
                html_content += f"""
                <div class="file-list-item" onclick="loadSource('{art}', '{b64_content}')">
                    {art} <span class="badge">Source</span>
                </div>
                """
            except: pass
        elif is_image:
            html_content += f"""
            <div class="file-list-item" onclick="loadFile('{art}', 'html')">
                {art}
            </div>
            """
        else:
            # All other files (textual) - use loadSource with base64 for reliability
            try:
                b64_content = base64.b64encode((work_dir / art).read_bytes()).decode()
                html_content += f"""
                <div class="file-list-item" onclick="loadSource('{art}', '{b64_content}')">
                    {art}
                </div>
                """
            except:
                # Fallback to loadFile if b64 fails (e.g. binary)
                html_content += f"""
                <div class="file-list-item" onclick="loadFile('{art}', 'text')">
                    {art}
                </div>
                """

    html_content += """
                </div>
                <div class="main-view">
                    <iframe id="preview-frame" src="about:blank"></iframe>
                </div>
            </div>
        </div>
        <script>
            // Auto-load first item if available
            const firstItem = document.querySelector('.file-list-item');
            if(firstItem) firstItem.click();
        </script>
    </body>
    </html>
    """
    
    with open(report_path, "w") as f:
        f.write(html_content)
    
    return report_path

# --- Agent Runners ---

class AgentRunner:
    def __init__(self, agent_name: str, model_name: str, prompt_file: Path, headless: bool, non_local: bool = False, restore_agent_config: bool = False):
        self.agent_name = agent_name
        self.model_name = model_name
        self.prompt_file = prompt_file
        self.headless = headless
        self.non_local = non_local
        self.restore_agent_config = restore_agent_config
        
        # Binary to name mapping
        self.binary_map = {
            "mistral": "vibe",
        }
        self.agent_binary = self.binary_map.get(agent_name, agent_name)
        
        # Prepare workspace
        self.safe_model_name = "".join(c for c in model_name if c.isalnum() or c in ('-', '_')).strip()
        # Requested naming convention: {binary_name}_{safe_model_name}_{prompt_stem}
        self.work_dir = EVALS_DIR / f"{self.agent_binary}_{self.safe_model_name}_{prompt_file.stem}"
        
        self.log_process: Optional[subprocess.Popen] = None
        
    def setup_workspace(self):
        """Creates the evaluation directory."""
        if self.work_dir.exists():
            print(f"[*] Cleaning up existing directory: {self.work_dir}")
            shutil.rmtree(self.work_dir)
        self.work_dir.mkdir(parents=True, exist_ok=True)
        print(f"[+] Created workspace: {self.work_dir}")

    def get_model_extra_info(self) -> Dict[str, str]:
        """Returns additional model metadata to merge into the Model Details box. Override per agent."""
        return {}

    def get_env_vars(self) -> Dict[str, str]:
        """Returns the environment variables needed for the agent to talk to localhost."""
        env = os.environ.copy()
        if not self.non_local:
            # Standard OpenAI-compatible env vars
            env["OPENAI_API_BASE"] = LM_STUDIO_API_URL
            env["OPENAI_BASE_URL"] = LM_STUDIO_API_URL
            env["OPENAI_API_KEY"] = "lm-studio"  # Usually ignored but required
        return env

    def start_server_logger(self):
        """Starts streaming server logs to file."""
        self._run_start_time = datetime.now()

        if self.non_local:
            return

        # Skip if lms CLI is known to be unresponsive (e.g. hangs on Windows)
        if not _lms_cli_available:
            print("[*] Skipping lms log stream (CLI unavailable). Will read on-disk server logs instead.")
            return

        log_path = self.work_dir / SERVER_LOG_FILENAME
        print(f"[*] Starting server log stream to: {log_path}")

        try:
            self.server_log_file = open(log_path, "w")
            self.log_process = subprocess.Popen(
                ["lms", "log", "stream", "--source", "server"],
                stdout=self.server_log_file,
                stderr=subprocess.STDOUT
            )
            # Quick check: if process exits immediately it likely can't connect
            time.sleep(0.5)
            if self.log_process.poll() is not None:
                print("[-] lms log stream exited immediately — will read on-disk server logs instead.")
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

        log_path = self.work_dir / SERVER_LOG_FILENAME

        # If SERVER.LOG already has useful content (from lms log stream), skip
        if log_path.exists() and log_path.stat().st_size > 0:
            try:
                content = log_path.read_text(encoding='utf-8', errors='ignore')
                if '"usage"' in content or 'Prompt processing progress' in content:
                    return  # lms log stream worked fine
            except Exception:
                pass

        # Find LM Studio's on-disk log directory
        lms_log_dir = Path.home() / ".lmstudio" / "server-logs"
        if not lms_log_dir.exists():
            print("[-] LM Studio server-logs directory not found, cannot recover token metrics.")
            return

        start_time = getattr(self, '_run_start_time', None)
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
        ts_pattern = re.compile(r'^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]')

        collected_lines = []
        capturing = False

        for log_file in log_files:
            try:
                with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
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
            with open(log_path, 'w', encoding='utf-8') as f:
                f.writelines(collected_lines)
            print(f"[+] Recovered {len(collected_lines)} lines from LM Studio on-disk logs into SERVER.LOG")
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

        if hasattr(self, 'server_log_file') and self.server_log_file:
            self.server_log_file.close()

        # Fallback: read from LM Studio's on-disk logs if streaming didn't work
        self._collect_server_log_from_disk()

    def run(self):
        """Orchestrates the run."""
        start_time = datetime.now()
        
        self.setup_workspace()
        
        # specific agent configuration
        self.configure_agent()
        
        # Start logging LMS server
        self.start_server_logger()
        
        try:
            # Execute
            print(f"[*] Running {self.agent_name}...")
            self.execute_agent()
        finally:
            # Stop logging
            self.stop_server_logger()
            
        end_time = datetime.now()
        duration_delta = end_time - start_time
        duration_seconds = duration_delta.total_seconds()
        
        # --- Automatic Script Execution ---
        # Find any .py files generated by the agent and run them
        for py_file in self.work_dir.glob("*.py"):
            if py_file.name == "evaluate_agent.py": continue 
            
            print(f"[*] Automatically executing generated script: {py_file.name}")
            output_log_path = self.work_dir / "OUTPUT.TXT"
            
            try:
                result = subprocess.run(
                    [sys.executable, py_file.name],
                    cwd=self.work_dir,
                    capture_output=True,
                    text=True,
                    timeout=300
                )
                
                with open(output_log_path, "a") as f:
                    f.write(f"--- Execution of {py_file.name} ---\n")
                    f.write("STDOUT:\n")
                    f.write(result.stdout)
                    if result.stderr:
                        f.write("\nSTDERR:\n")
                        f.write(result.stderr)
                    f.write("\n---------------------------\n\n")
                
                print(f"[+] Execution of {py_file.name} finished. Results appended to OUTPUT.TXT")
            except Exception as e:
                print(f"[-] Execution of {py_file.name} failed: {e}")

        # --- Metadata & Reporting ---
        print("[*] Generating run report...")
        
        # Metadata collection using centralized binary mapping
        
        # Read prompt text
        try:
            with open(self.prompt_file, 'r') as f:
                prompt_text = f.read()
        except Exception:
            prompt_text = "Error reading prompt file."

        model_info = MetadataCollector.parse_model_info(self.model_name, self.non_local, self.agent_name)
        model_info.update(self.get_model_extra_info())

        metadata = {
            "Hardware": MetadataCollector.get_hardware_info(),
            "Software": MetadataCollector.get_software_versions(self.agent_binary, self.non_local),
            "Model": model_info,
            "Tokens": MetadataCollector.get_token_usage(
                self.work_dir / SERVER_LOG_FILENAME, 
                self.work_dir / CHAT_SESSION_FILENAME
            ),
            "PromptTime": MetadataCollector.get_prompt_processing_time(self.work_dir / SERVER_LOG_FILENAME)
        }
        
        report_path = generate_html_report(
            self.work_dir, 
            metadata, 
            prompt_text, 
            duration_seconds, 
            self.agent_name
        )
        
        print(f"[+] Report generated: {report_path}")
        
        # Open the report (if we didn't just run a py script output, or maybe along with it?)
        # User said: "In addition to these options on the page..."
        # If output was .py, implementation plan said we still open summary.html because it contains the OUTPUT.TXT view.
        # But process_output prints logic to console. Let's open the report too.
        try:
            if sys.platform == "darwin": # macOS
                subprocess.run(["open", str(report_path)])
            elif sys.platform == "win32": # Windows
                os.startfile(str(report_path))
            else: # Linux
                subprocess.run(["xdg-open", str(report_path)])
        except Exception as e:
            print(f"[-] Failed to open report: {e}")




    def configure_agent(self):
        """Hook for agent-specific configuration file generation."""
        pass

    def execute_agent(self):
        """Runs the actual agent command."""
        raise NotImplementedError

    def _run_process(self, cmd: List[str], env: Optional[Dict[str, str]] = None):
        """Runs the process and streams output to file and stdout."""
        if env is None:
            env = self.get_env_vars()
        
        chat_log_path = self.work_dir / CHAT_SESSION_FILENAME
        
        print(f"[*] Executing: {' '.join(cmd)}")
        print(f"[*] Output logging to: {chat_log_path}")
        
        with open(chat_log_path, "w") as log_file:
            # We want to capture both stdout and stderr
            # And also print to the console? 
            # Subprocess.PIPE might buffer, but let's try.
            
            # Start process in the work dir
            process = subprocess.Popen(
                cmd,
                cwd=self.work_dir,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, # Merge stderr into stdout
                text=True,
                bufsize=1 # Line buffered
            )
            
            # Stream output
            for line in process.stdout:
                sys.stdout.write(line)
                sys.stdout.flush()
                log_file.write(line)
                log_file.flush()
                
            try:
                process.wait(timeout=900) # Wait with a timeout
            except subprocess.TimeoutExpired:
                print(f"[-] Agent process timed out after 900 seconds.")
                log_file.write(f"\n[ERROR] Process timed out after 900 seconds.\n")
                process.kill() # Terminate the process
                process.wait() # Wait for it to actually terminate
            
            if process.returncode != 0:
                print(f"[-] Agent finished with error code {process.returncode}")
                log_file.write(f"\n[ERROR] Process exited with code {process.returncode}\n")
            else:
                print(f"[+] Agent finished successfully.")
                log_file.write(f"\n[SUCCESS] Process exited cleanly.\n")

# --- Specific Agent Implementations ---

class GeminiRunner(AgentRunner):
    def execute_agent(self):
        # Gemini CLI: `gemini --prompt "content"`
        with open(self.prompt_file, 'r') as f:
            prompt_content = f.read()
        
        # Use absolute path to avoid FileNotFoundError
        gemini_bin = shutil.which("gemini") or "gemini"
        
        cmd = [gemini_bin, "--yolo", "--prompt", prompt_content, "--output-format", "stream-json"]
        
        if self.model_name:
            cmd.extend(["--model", self.model_name])

        env = self.get_env_vars()
        # Remove Gemini-specific env vars to avoid nested session detection/relaunch issues
        env.pop("GEMINI_CLI", None)
        env.pop("GEMINI_CLI_NO_RELAUNCH", None)
        
        chat_log_path = self.work_dir / CHAT_SESSION_FILENAME
        result_json_path = self.work_dir / GEMINI_RESULT_FILENAME

        print(f"[*] Executing: gemini --yolo --prompt <prompt> --output-format stream-json")
        print(f"[*] Output logging to: {chat_log_path}")

        result_data = None

        with open(chat_log_path, "w") as log_file:
            process = subprocess.Popen(
                cmd,
                cwd=self.work_dir,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1
            )

            for line in process.stdout:
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    event = json.loads(stripped)
                    event_type = event.get("type", "")

                    if event_type == "message":
                        # Gemini's message event provides continuous strings without "blocks"
                        content = event.get("content", "")
                        if content and event.get("role") == "assistant":
                            # It streams delta updates usually.
                            sys.stdout.write(content)
                            sys.stdout.flush()
                            log_file.write(content)
                            log_file.flush()
                            
                    elif event_type == "tool_call":
                        tool_name = event.get("function", "")
                        info_line = f"\n[Tool: {tool_name}]\n"
                        sys.stdout.write(info_line)
                        sys.stdout.flush()
                        log_file.write(info_line)
                        log_file.flush()

                    elif event_type == "result":
                        result_data = event
                        sys.stdout.write("\n")
                        sys.stdout.flush()
                        log_file.write("\n")
                        log_file.flush()

                except json.JSONDecodeError:
                    # Non-JSON line, pass through as-is
                    sys.stdout.write(line)
                    sys.stdout.flush()
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
                log_file.write(f"\n[ERROR] Process exited with code {process.returncode}\n")

        if result_data:
            with open(result_json_path, "w") as f:
                json.dump(result_data, f, indent=2)
            print(f"[+] Gemini usage data saved to: {result_json_path}")

class ClaudeRunner(AgentRunner):
    def execute_agent(self):
        # Claude Code: `claude -p "content"` (headless)
        # Using --output-format stream-json to capture token usage and cost metrics
        with open(self.prompt_file, 'r') as f:
            prompt_content = f.read()

        cmd = ["claude", "-p", prompt_content, "--dangerously-skip-permissions",
               "--output-format", "stream-json", "--verbose"]

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

        print(f"[*] Executing: claude -p <prompt> --dangerously-skip-permissions --output-format stream-json")
        print(f"[*] Output logging to: {chat_log_path}")

        result_data = None

        with open(chat_log_path, "w") as log_file:
            process = subprocess.Popen(
                cmd,
                cwd=self.work_dir,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1
            )

            for line in process.stdout:
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    event = json.loads(stripped)
                    event_type = event.get("type", "")

                    if event_type == "assistant":
                        message = event.get("message", {})
                        for block in message.get("content", []):
                            if block.get("type") == "text":
                                text = block.get("text", "")
                                sys.stdout.write(text)
                                sys.stdout.flush()
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
                                sys.stdout.write(info_line)
                                sys.stdout.flush()
                                log_file.write(info_line)
                                log_file.flush()

                    elif event_type == "result":
                        result_data = event
                        result_text = event.get("result", "")
                        if result_text:
                            sys.stdout.write("\n" + result_text + "\n")
                            sys.stdout.flush()
                            log_file.write("\n" + result_text + "\n")
                            log_file.flush()

                except json.JSONDecodeError:
                    # Non-JSON line, pass through as-is
                    sys.stdout.write(line)
                    sys.stdout.flush()
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
                log_file.write(f"\n[ERROR] Process exited with code {process.returncode}\n")

        # Save result JSON for metadata extraction (token usage, cost, turns)
        if result_data:
            with open(result_json_path, "w") as f:
                json.dump(result_data, f, indent=2)
            print(f"[+] Claude usage data saved to: {result_json_path}")

class VibeRunner(AgentRunner):
    _original_active_model: Optional[str] = None

    def configure_agent(self):
        """Set vibe's active_model to match the --model passed to this script."""
        if self.non_local:
            return

        vibe_config_path = Path.home() / ".vibe" / "config.toml"
        if not vibe_config_path.exists():
            return

        try:
            config_text = vibe_config_path.read_text(encoding='utf-8')

            # Find the alias for a [[models]] entry whose name matches our model
            # TOML parsing without a library: scan for [[models]] blocks
            target_alias = None
            in_models_block = False
            current_name = None
            current_alias = None

            for line in config_text.splitlines():
                stripped = line.strip()
                if stripped == "[[models]]":
                    # Save previous block if it matched
                    if in_models_block and current_name and current_alias:
                        if self.model_name in current_name or current_name in self.model_name:
                            target_alias = current_alias
                    in_models_block = True
                    current_name = None
                    current_alias = None
                elif stripped.startswith("[") and in_models_block:
                    # New non-models section — finalize
                    if current_name and current_alias:
                        if self.model_name in current_name or current_name in self.model_name:
                            target_alias = current_alias
                    in_models_block = False
                elif in_models_block:
                    m = re.match(r'^name\s*=\s*"(.+?)"', stripped)
                    if m:
                        current_name = m.group(1)
                    m = re.match(r'^alias\s*=\s*"(.+?)"', stripped)
                    if m:
                        current_alias = m.group(1)

            # Check last block
            if in_models_block and current_name and current_alias:
                if self.model_name in current_name or current_name in self.model_name:
                    target_alias = current_alias

            if not target_alias:
                print(f"[-] No vibe model alias found matching '{self.model_name}', using current active_model.")
                return

            # Read current active_model so we can restore it later
            am_match = re.search(r'^active_model\s*=\s*"(.+?)"', config_text, re.MULTILINE)
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
                flags=re.MULTILINE
            )
            vibe_config_path.write_text(new_config, encoding='utf-8')
            print(f"[+] Set vibe active_model to '{target_alias}' (was '{self._original_active_model}')")

        except Exception as e:
            print(f"[-] Failed to configure vibe model: {e}")

    def _restore_vibe_config(self):
        """Restore vibe's active_model to its original value after the run."""
        if self._original_active_model is None:
            return
        vibe_config_path = Path.home() / ".vibe" / "config.toml"
        try:
            config_text = vibe_config_path.read_text(encoding='utf-8')
            new_config = re.sub(
                r'^(active_model\s*=\s*)".*?"',
                f'\\1"{self._original_active_model}"',
                config_text,
                count=1,
                flags=re.MULTILINE
            )
            vibe_config_path.write_text(new_config, encoding='utf-8')
            print(f"[+] Restored vibe active_model to '{self._original_active_model}'")
        except Exception as e:
            print(f"[-] Failed to restore vibe config: {e}")

    def execute_agent(self):
        # Mistral Vibe: `vibe -p "content"`
        with open(self.prompt_file, 'r') as f:
            prompt_content = f.read()

        cmd = ["vibe", "-p", prompt_content]
        try:
            self._run_process(cmd)
        finally:
            if self.restore_agent_config:
                self._restore_vibe_config()

class OpenCodeRunner(AgentRunner):
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

        if not self.non_local:
            config["provider"] = {
                "lmstudio": {
                    "npm": "@ai-sdk/openai-compatible",
                    "name": "LM Studio (local)",
                    "options": {
                        "baseURL": LM_STUDIO_API_URL
                    },
                    "models": {
                        self.model_name: {
                            "name": self.model_name
                        }
                    }
                }
            }
            config["model"] = f"lmstudio/{self.model_name}"

        with open(self.work_dir / "opencode.json", "w") as f:
            json.dump(config, f, indent=2)

    def execute_agent(self):
        with open(self.prompt_file, 'r') as f:
            prompt_content = f.read()

        cmd = ["opencode", "run", prompt_content,
               "--format", "json", "--print-logs"]

        if not self.non_local:
            cmd.extend(["--model", f"lmstudio/{self.model_name}"])

        env = self.get_env_vars()
        chat_log_path = self.work_dir / CHAT_SESSION_FILENAME
        result_json_path = self.work_dir / OPENCODE_RESULT_FILENAME

        print(f"[*] Executing: opencode run <prompt> --format json --print-logs")
        print(f"[*] Output logging to: {chat_log_path}")

        # Patterns to suppress from terminal and log file (high-volume internal bus noise)
        _stderr_noise = re.compile(r'service=bus\b')

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

        with open(chat_log_path, "w") as log_file:
            process = subprocess.Popen(
                cmd,
                cwd=self.work_dir,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1
            )

            # Read stdout (JSON events) and stderr (logs) concurrently
            import threading

            _log_version_re = re.compile(r'service=default\s+version=(\S+)')
            _log_llm_re = re.compile(r'service=llm\s+providerID=(\S+)\s+modelID=(\S+).*\bsmall=false\b')

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
                            sys.stdout.write(text)
                            sys.stdout.flush()
                            log_file.write(text)
                            log_file.flush()
                    elif event_type == "tool_call":
                        tool_name = event.get("name", event.get("tool", "unknown"))
                        info_line = f"\n[Tool: {tool_name}]\n"
                        sys.stdout.write(info_line)
                        sys.stdout.flush()
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
                    else:
                        # Log other event types as raw JSON for debugging
                        log_file.write(line)
                        log_file.flush()

                except json.JSONDecodeError:
                    # Non-JSON line (e.g. log output), pass through
                    sys.stdout.write(line)
                    sys.stdout.flush()
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

            if process.returncode == 0:
                print(f"[+] Agent finished successfully.")
                log_file.write(f"\n[SUCCESS] Process exited cleanly.\n")
            else:
                print(f"[-] Agent finished with error code {process.returncode}")
                log_file.write(f"\n[ERROR] Process exited with code {process.returncode}\n")

        # Save accumulated token usage to result JSON
        if total_input > 0 or total_output > 0:
            result_data = {
                "input_tokens": total_input,
                "output_tokens": total_output,
                "total_tokens": total_input + total_output,
                "reasoning_tokens": total_reasoning,
                "cache_read_tokens": cache_read,
                "cache_write_tokens": cache_write,
                "cost_usd": total_cost,
                "num_turns": num_turns
            }
            if provider_id:
                result_data["provider_id"] = provider_id
            if model_id:
                result_data["model_id"] = model_id
            if opencode_version:
                result_data["opencode_version"] = opencode_version
            with open(result_json_path, "w") as f:
                json.dump(result_data, f, indent=2)
            print(f"[+] OpenCode usage data saved to: {result_json_path}")

class CrushRunner(AgentRunner):
    def execute_agent(self):
        # Crush: `crush run "content" -y`
        with open(self.prompt_file, 'r') as f:
            prompt_content = f.read()
        
        cmd = ["crush", "run", prompt_content, "-y"]
        self._run_process(cmd)


# --- Factory ---

def get_runner(agent: str) -> type[AgentRunner]:
    mapping = {
        "gemini": GeminiRunner,
        "claude": ClaudeRunner,
        "vibe": VibeRunner,
        "mistral": VibeRunner, # Backward compatibility alias
        "opencode": OpenCodeRunner,
        "crush": CrushRunner
    }
    return mapping.get(agent.lower())

# --- Main ---

def main():
    parser = argparse.ArgumentParser(description="Evaluate local LLM agents.")
    parser.add_argument("--model", required=True, help="LM Studio model key/identifier")
    parser.add_argument("--agent", required=True, choices=["gemini", "claude", "vibe", "opencode", "crush"], help="Agent to evaluate (vibe = Mistral Vibe)")
    parser.add_argument("--prompt-file", required=True, type=Path, help="Path to the initial prompt file")
    parser.add_argument("--headless", action="store_true", default=True, help="Run in headless mode (default: True)")
    parser.add_argument("--non-local", action="store_true", help="Disable LM Studio-related functionality and use default inference providers")
    parser.add_argument("--restore-agent-config", action="store_true", help="Restore agent config (e.g. vibe active_model) to its original value after the run")

    args = parser.parse_args()
    
    if not args.prompt_file.exists():
        print(f"[-] Prompt file not found: {args.prompt_file}")
        sys.exit(1)

    # 1. Load Model (Local only)
    if not args.non_local:
        load_lms_model(args.model)
    
    # 2. Get Runner
    runner_cls = get_runner(args.agent)
    if not runner_cls:
        print(f"[-] Unknown agent: {args.agent}")
        sys.exit(1)
        
    runner = runner_cls(args.agent, args.model, args.prompt_file, args.headless, args.non_local, args.restore_agent_config)
    
    # 3. Run
    runner.run()

if __name__ == "__main__":
    main()

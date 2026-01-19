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
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

# --- Configuration & Constants ---
LM_STUDIO_API_URL = "http://localhost:1234/v1"
EVALS_DIR = Path("evals")
SERVER_LOG_FILENAME = "SERVER.LOG"
CHAT_SESSION_FILENAME = "CHAT_SESSION.TXT"

# --- LM Studio Client ---

def load_lms_model(model_key: str):
    """Loads a model into LM Studio via the CLI."""
    print("[*] Unloading any existing models...")
    try:
        subprocess.run(["lms", "unload", "--all"], check=True, text=True)
    except subprocess.CalledProcessError:
        print("[-] Warning: Failed to unload models, attempting to proceed...")

    print(f"[*] Loading model '{model_key}' into LM Studio...")
    # Using --gpu=max to ensure best performance
    cmd = ["lms", "load", model_key, "--gpu=max", "-y"]
    
    try:
        subprocess.run(cmd, check=True, text=True)
        print(f"[+] Model '{model_key}' loaded successfully.")
    except subprocess.CalledProcessError as e:
        print(f"[-] Failed to load model: {e}")
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
        return info

    @staticmethod
    def get_software_versions(agent_binary: str) -> Dict[str, str]:
        def strip_ansi(text: str) -> str:
            ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
            return ansi_escape.sub('', text)

        versions = {}
        
        # LM Studio CLI Version
        try:
            lms_out = subprocess.check_output(["lms", "version"], text=True).strip()
            # Extract clean version, e.g. "v0.0.47"
            m = re.search(r"lms - LM Studio CLI - (v[\d.]+)", lms_out)
            if m:
                versions["LM Studio CLI Version"] = m.group(1)
            else:
                # Fallback to just the last line or raw output if unexpected
                versions["LM Studio CLI Version"] = lms_out.splitlines()[-1] if lms_out else "Unknown"
        except Exception:
            versions["LM Studio CLI Version"] = "Unknown"

        # LM Studio App Version (Mac only via mdls)
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
        
        # Agent Version
        try:
            # Most agents support --version
            agent_ver = subprocess.check_output([agent_binary, "--version"], text=True).strip()
            versions[agent_binary] = strip_ansi(agent_ver)
        except Exception:
            versions[agent_binary] = "Unknown"
            
        return versions

    @staticmethod
    def get_token_usage(log_path: Path) -> Dict[str, int]:
        """Parses SERVER.LOG for token usage statistics."""
        usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        if not log_path.exists():
            return usage
            
        try:
            with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                
            # Regex to find JSON usage blocks: "usage": { "prompt_tokens": 123, ... }
            # usage matches might be multiline
            # We look for the specific pattern that appears in LMS logs
            # pattern: "usage":\s*\{\s*"prompt_tokens":\s*(\d+),\s*"completion_tokens":\s*(\d+),\s*"total_tokens":\s*(\d+)\s*\}
            pattern = re.compile(r'"usage":\s*\{\s*"prompt_tokens":\s*(\d+),\s*"completion_tokens":\s*(\d+),\s*"total_tokens":\s*(\d+)\s*\}')
            
            matches = pattern.findall(content)
            for match in matches:
                p_tok, c_tok, t_tok = map(int, match)
                usage["prompt_tokens"] += p_tok
                usage["completion_tokens"] += c_tok
                usage["total_tokens"] += t_tok
                
        except Exception as e:
            print(f"[-] Error parsing token usage: {e}")
            
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
            # [2026-01-18 18:10:43]
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
                        # Block ended on previous meaningful line (or this line indicates end of block context)
                        # We use the timestamp of this line as the end, effectively
                        # Actually, if we just stopped seeing it, the processing finished between the last "progress" line and this line.
                        # Let's count duration from block_start to the current timestamp
                        if block_start_time:
                            total_duration += (current_ts - block_start_time).total_seconds()
                        in_block = False
                        block_start_time = None
            
            # If log ends while in block
            if in_block and block_start_time and last_timestamp:
                 total_duration += (last_timestamp - block_start_time).total_seconds()

        except Exception as e:
            print(f"[-] Error calculating prompt processing time: {e}")
            
        return total_duration

    @staticmethod
    def parse_model_info(model_key: str) -> Dict[str, str]:
        # Basic Info
        info = {"Full Name": model_key}
        
        # Heuristic Defaults
        if "24b" in model_key.lower():
            info["Parameters"] = "24B"
        elif "8b" in model_key.lower():
            info["Parameters"] = "8B"
        elif "7b" in model_key.lower():
            info["Parameters"] = "7B"
            
        # Parse lms ls output for detailed info
        try:
            # Check lms ls for details
            # Output format: ID  PARAMS  ARCH  SIZE  [STATUS]
            ls_output = subprocess.check_output(["lms", "ls"], text=True)
            for line in ls_output.splitlines():
                if "LOADED" in line:
                    # This is likely the loaded model
                    # Split by multiple spaces
                    parts = re.split(r'\s{2,}', line.strip())
                    # parts might be: [ID, PARAMS, ARCH, SIZE, STATUS] or variations
                    # We expect at least PARAMS, ARCH, SIZE before the loaded checkmark
                    # Example: ['mistralai...', '24B', 'mistral3', '12.54 GB', '✓ LOADED']
                    
                    # We can try to map based on known columns or position from end
                    # Since LOADED is at the end, previous 3 should be Size, Arch, Params
                    if len(parts) >= 4:
                        # parts[-1] is "✓ LOADED"
                        # parts[-2] is Size
                        # parts[-3] is Arch
                        # parts[-4] is Params
                        info["Size"] = parts[-2]
                        info["Architecture"] = parts[-3]
                        info["Parameters"] = parts[-4] 
                        
                        # Also get full name if possible, though we have model_key
                        if len(parts) >= 5:
                             info["Full Name"] = parts[0]
                    break
        except Exception:
            pass # Fallback to heuristic
            
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
    if duration_seconds > prompt_time_seconds:
        generation_seconds = duration_seconds - prompt_time_seconds
        tps = round(total_output / generation_seconds, 2)
    elif total_output > 0 and duration_seconds > 0:
        tps = round(total_output / duration_seconds, 2)
    
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
            # Add Preview item
            html_content += f"""
            <div class="file-list-item" onclick="loadFile('{art}', 'html')">
                {art} <span class="badge">Preview</span>
            </div>
            """
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
    def __init__(self, agent_name: str, model_name: str, prompt_file: Path, headless: bool):
        self.agent_name = agent_name
        self.model_name = model_name
        self.prompt_file = prompt_file
        self.headless = headless
        
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

    def get_env_vars(self) -> Dict[str, str]:
        """Returns the environment variables needed for the agent to talk to localhost."""
        env = os.environ.copy()
        # Standard OpenAI-compatible env vars
        env["OPENAI_API_BASE"] = LM_STUDIO_API_URL
        env["OPENAI_BASE_URL"] = LM_STUDIO_API_URL
        env["OPENAI_API_KEY"] = "lm-studio"  # Usually ignored but required
        return env

    def start_server_logger(self):
        """Starts streaming server logs to file."""
        log_path = self.work_dir / SERVER_LOG_FILENAME
        print(f"[*] Starting server log stream to: {log_path}")
        
        try:
            self.server_log_file = open(log_path, "w")
            self.log_process = subprocess.Popen(
                ["lms", "log", "stream", "--source", "server"],
                stdout=self.server_log_file,
                stderr=subprocess.STDOUT
            )
        except Exception as e:
            print(f"[-] Failed to start server logger: {e}")

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
                    ["python3", py_file.name],
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

        metadata = {
            "Hardware": MetadataCollector.get_hardware_info(),
            "Software": MetadataCollector.get_software_versions(self.agent_binary),
            "Model": MetadataCollector.parse_model_info(self.model_name),
            "Tokens": MetadataCollector.get_token_usage(self.work_dir / SERVER_LOG_FILENAME),
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

    def _run_process(self, cmd: List[str]):
        """Runs the process and streams output to file and stdout."""
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
                
            process.wait()
            
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
        # The help output suggests `gemini --prompt`
        with open(self.prompt_file, 'r') as f:
            prompt_content = f.read()
        
        cmd = ["gemini", "--prompt", prompt_content] 
        self._run_process(cmd)

class ClaudeRunner(AgentRunner):
    def execute_agent(self):
        # Claude Code: `claude -p "content"` (headless)
        # Also using --dangerously-skip-permissions for true headless
        with open(self.prompt_file, 'r') as f:
            prompt_content = f.read()
            
        cmd = ["claude", "-p", prompt_content, "--dangerously-skip-permissions"]
        self._run_process(cmd)

class VibeRunner(AgentRunner):
    def configure_agent(self):
        # Mistral Vibe might need a config file to point to local model
        # Try generating .vibe/agents/default.toml or similar if needed.
        # For now, we rely on standard env vars potentially supported by underlying engines,
        # or we might need to create a specific vibe config.
        # Research indicated vibe CLI is "model agnostic" but usually uses a toml.
        # We'll try setting OPENAI_BASE_URL env var as a fallback.
        pass

    def execute_agent(self):
        # Mistral Vibe: `vibe -p "content"`
        with open(self.prompt_file, 'r') as f:
            prompt_content = f.read()
            
        cmd = ["vibe", "-p", prompt_content]
        self._run_process(cmd)

class OpenCodeRunner(AgentRunner):
    def configure_agent(self):
        # OpenCode supports opencode.json
        config = {
            "providers": {
                "local": {
                    "type": "openai",
                    "baseUrl": LM_STUDIO_API_URL,
                    "model": self.model_name
                }
            },
            "defaultProvider": "local"
        }
        with open(self.work_dir / "opencode.json", "w") as f:
            json.dump(config, f, indent=2)

    def execute_agent(self):
        # OpenCode: `opencode -p "content"`
        # It reads opencode.json from CWD usually, or we might need to specify --project .
        with open(self.prompt_file, 'r') as f:
            prompt_content = f.read()
            
        cmd = ["opencode", "-p", prompt_content]
        self._run_process(cmd)

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
    
    args = parser.parse_args()
    
    if not args.prompt_file.exists():
        print(f"[-] Prompt file not found: {args.prompt_file}")
        sys.exit(1)

    # 1. Load Model
    load_lms_model(args.model)
    
    # 2. Get Runner
    runner_cls = get_runner(args.agent)
    if not runner_cls:
        print(f"[-] Unknown agent: {args.agent}")
        sys.exit(1)
        
    runner = runner_cls(args.agent, args.model, args.prompt_file, args.headless)
    
    # 3. Run
    runner.run()

if __name__ == "__main__":
    main()

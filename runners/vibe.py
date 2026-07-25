"""Mistral Vibe CLI adapter."""

import json
import re
import subprocess
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional

from evaluation_core import (
    AgentRunner,
    CHAT_SESSION_FILENAME,
    read_prompt_file,
    safe_stdout_write,
)
from evaluation_metrics import VIBE_RESULT_FILENAME

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

    @contextmanager
    def agent_configuration(self):
        """Temporarily select the requested Vibe model."""
        try:
            self.configure_agent()
            yield
        finally:
            if self.restore_agent_config:
                self._restore_vibe_config()

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

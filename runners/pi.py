"""Pi Coding Agent adapter."""

import json
import os
import queue
import subprocess
import sys
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Dict, List, Optional

from evaluation_core import (
    AgentRunner,
    CHAT_SESSION_FILENAME,
    read_prompt_file,
    safe_stdout_write,
    send_stdin,
    stop_process_tree,
)
from evaluation_metrics import PI_RESULT_FILENAME, PI_WIGGUM_RESULT_FILENAME
from runner_events import extract_pi_tool_call, parse_pi_event

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
                self.custom_provider or self.local_provider.provider_id: {
                    "baseUrl": self.local_provider.api_url,
                    "api": "openai-completions",
                    "apiKey": self.local_provider.api_key,
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
        print(
            f"[+] Wrote Pi models.json for {self.local_provider.display_name}: "
            f"{self.models_json_path}"
        )

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

    @contextmanager
    def agent_configuration(self):
        """Install Pi's temporary provider config for one agent execution."""
        try:
            self.configure_agent()
            yield
        finally:
            self._restore_pi_models_json()

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
        self._execute_pi()

    def _execute_pi(self):
        prompt_content = read_prompt_file(self.prompt_file)
        result_data = self._run_pi_attempt(prompt_content, "PI_EVENTS.JSONL")

        if (
            result_data["input_tokens"] > 0
            or result_data["output_tokens"] > 0
            or result_data.get("termination")
            or result_data.get("returncode") != 0
        ):
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
                self.custom_provider or self.local_provider.provider_id,
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
        timeout_seconds: Optional[float] = None,
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
        termination = None
        safety_monitor = self.create_safety_monitor()
        effective_timeout = (
            self.safety_limits.process_timeout
            if timeout_seconds is None
            else timeout_seconds
        )
        effective_idle_timeout = self.safety_limits.process_idle_timeout

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
                start_new_session=os.name != "nt",
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

            started_at = time.monotonic()
            last_activity_at = started_at
            deadline = (
                started_at + effective_timeout
                if effective_timeout and effective_timeout > 0
                else None
            )

            def terminate_attempt(reason, message, evidence):
                nonlocal termination, timed_out
                if termination is not None:
                    return
                timed_out = reason in ("time_limit", "inactivity_limit")
                termination = {
                    "reason": reason,
                    "message": message,
                    "evidence": evidence,
                }
                print(f"[-] Agent run terminated: {message}")
                log_file.write(f"\n[TERMINATED] {message}\n")
                log_file.flush()
                stop_process_tree(process)

            stdout_done = False
            while not stdout_done:
                now = time.monotonic()
                if (
                    deadline is not None
                    and process.poll() is None
                    and now >= deadline
                ):
                    terminate_attempt(
                        "time_limit",
                        (
                            "Run stopped after reaching the "
                            f"{effective_timeout:g}-second time limit."
                        ),
                        {
                            "limit_seconds": effective_timeout,
                            "observed_seconds": now - started_at,
                        },
                    )
                elif (
                    effective_idle_timeout
                    and effective_idle_timeout > 0
                    and process.poll() is None
                    and now - last_activity_at >= effective_idle_timeout
                ):
                    idle_seconds = now - last_activity_at
                    terminate_attempt(
                        "inactivity_limit",
                        (
                            f"Run stopped after {effective_idle_timeout:g} seconds "
                            "without agent process output."
                        ),
                        {
                            "detector": "output_inactivity",
                            "observed_idle_seconds": idle_seconds,
                            "limit_seconds": effective_idle_timeout,
                            "elapsed_seconds": now - started_at,
                        },
                    )

                try:
                    line = line_queue.get(timeout=0.2)
                except queue.Empty:
                    continue

                if line is None:
                    stdout_done = True
                    continue

                last_activity_at = time.monotonic()
                raw_file.write(line)
                raw_file.flush()
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    event = json.loads(stripped)
                    parsed = parse_pi_event(event)
                    if parsed.text:
                        safe_stdout_write(parsed.text)
                        log_file.write(parsed.text)
                        log_file.flush()
                    if parsed.usage:
                        total_input += parsed.usage.get("input_tokens", 0)
                        total_output += parsed.usage.get("output_tokens", 0)
                        cache_read += parsed.usage.get("cache_read_tokens", 0)
                        cache_write += parsed.usage.get("cache_write_tokens", 0)
                        total_cost += parsed.usage.get("cost_usd", 0)
                    if parsed.turn_completed:
                        num_turns += 1
                        safety_termination = safety_monitor.observe_turn(parsed.usage)
                        if safety_termination and termination is None:
                            terminate_attempt(
                                safety_termination.reason,
                                safety_termination.message,
                                safety_termination.evidence,
                            )
                        if pi_provider is None:
                            pi_provider = parsed.provider_id
                            pi_model = parsed.model_id
                    tool_call = extract_pi_tool_call(event)
                    if tool_call:
                        safety_termination = safety_monitor.observe_tool(*tool_call)
                        if safety_termination and termination is None:
                            terminate_attempt(
                                safety_termination.reason,
                                safety_termination.message,
                                safety_termination.evidence,
                            )
                    if parsed.log_raw:
                        log_file.write(line)
                        log_file.flush()

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
                stop_process_tree(process)
                process.wait()

            for stream in (process.stdout, getattr(process, "stderr", None)):
                close = getattr(stream, "close", None)
                if close:
                    close()

            if process.returncode == 0 and not termination:
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
            "termination": termination,
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
        if result_data.get("termination"):
            termination = result_data["termination"]
            metrics.update(
                {
                    "status": "error",
                    "is_error": True,
                    "error": termination["message"],
                    "terminal_reason": termination["reason"],
                    "termination": termination,
                    "warnings": [
                        "Run terminated by safety guardrail: "
                        f"{termination['message']}"
                    ],
                }
            )
        elif result_data.get("returncode") != 0:
            metrics.update(
                {
                    "status": "error",
                    "is_error": True,
                    "error": f"Pi exited with code {result_data['returncode']}",
                }
            )
        else:
            metrics.update({"status": "success", "is_error": False})
        return metrics

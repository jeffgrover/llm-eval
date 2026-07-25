"""OpenCode CLI adapter."""

import json
import re
import subprocess
import sys
import threading
from pathlib import Path
from typing import Dict, List, Optional

import evaluation_core as core
from evaluation_core import (
    AgentRunner,
    CHAT_SESSION_FILENAME,
    DEFAULT_LOCAL_CONTEXT_LIMIT,
    DEFAULT_LOCAL_OUTPUT_LIMIT,
    PROJECT_ROOT,
    get_env_int,
    is_llama_server_provider,
    read_prompt_file,
    safe_stdout_write,
)
from evaluation_metrics import OPENCODE_RESULT_FILENAME

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
            base_url = core.LOCAL_API_URL
            provider_id = core.LOCAL_PROVIDER_ID
            config["provider"] = {
                provider_id: {
                    "npm": "@ai-sdk/openai-compatible",
                    "name": core.LOCAL_PROVIDER_NAME,
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

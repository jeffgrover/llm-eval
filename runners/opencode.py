"""OpenCode CLI adapter."""

import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from evaluation_core import (
    AgentRunner,
    CHAT_SESSION_FILENAME,
    DEFAULT_LOCAL_CONTEXT_LIMIT,
    DEFAULT_LOCAL_OUTPUT_LIMIT,
    LM_STUDIO_API_URL,
    PROJECT_ROOT,
    SERVER_LOG_FILENAME,
    get_env_int,
    get_lms_loaded_context_length,
    is_llama_server_provider,
    read_prompt_file,
    run_streaming_process,
    safe_stdout_write,
)
from evaluation_metrics import OPENCODE_RESULT_FILENAME
from run_safety import DEFAULT_MAX_IDLE_SECONDS, DEFAULT_MAX_SECONDS, RunSafetyTermination
from runner_events import extract_opencode_tool_call, parse_opencode_event


# OpenCode emits no output while a tool call's arguments are streaming in, so
# a local model decoding one large response can stay silent far longer than
# the stock watchdog defaults (a 32,768-token response at ~7 t/s needs
# ~78 minutes). These floors apply to local runs with default limits only.
OPENCODE_LOCAL_IDLE_TIMEOUT = 5400.0
OPENCODE_LOCAL_PROCESS_TIMEOUT = 14400.0


def _adjusted_local_timeouts(safety_limits, non_local: bool):
    """Watchdog timeouts for an OpenCode run, with local-run floors applied.

    Explicit user limits (anything other than the stock defaults, including
    0/disabled) are preserved unchanged.
    """
    process_timeout = safety_limits.process_timeout
    idle_timeout = safety_limits.process_idle_timeout
    if non_local:
        return process_timeout, idle_timeout
    if process_timeout == DEFAULT_MAX_SECONDS:
        process_timeout = OPENCODE_LOCAL_PROCESS_TIMEOUT
    if idle_timeout == DEFAULT_MAX_IDLE_SECONDS:
        idle_timeout = OPENCODE_LOCAL_IDLE_TIMEOUT
    return process_timeout, idle_timeout


class OpenCodeRunner(AgentRunner):
    supports_custom_provider = True

    NON_CHAT_MODEL_PATTERNS = (
        "whisper",
    )

    _LOG_VERSION_RE = re.compile(
        r"(?:service=default\s+version=|message=created\b.*?\bversion=)(\S+)"
    )
    _LOG_LLM_RE = re.compile(
        r"(?:service=llm|message=stream)\s+providerID=(\S+)\s+modelID=(\S+).*\bsmall=false\b"
    )

    @classmethod
    def _parse_log_metadata(
        cls, line: str
    ) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """Return version/provider/model values advertised by an OpenCode log line."""
        version_match = cls._LOG_VERSION_RE.search(line)
        llm_match = cls._LOG_LLM_RE.search(line)
        return (
            version_match.group(1) if version_match else None,
            llm_match.group(1) if llm_match else None,
            llm_match.group(2) if llm_match else None,
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

    def get_env_vars(self) -> Dict[str, str]:
        env = super().get_env_vars()
        env.setdefault("OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX", "131072")
        return env

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

    def _discover_local_models(self) -> List[str]:
        """Return model IDs advertised by the local OpenAI-compatible server."""
        models_url = f"{self.local_provider.api_url.rstrip('/')}/models"
        request = urllib.request.Request(
            models_url,
            headers={"Authorization": f"Bearer {self.local_provider.api_key}"},
        )
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                payload = json.load(response)
        except (OSError, ValueError, urllib.error.URLError) as exc:
            print(
                f"[-] Could not discover OpenCode models from {models_url}: {exc}. "
                f"Using requested model '{self.model_name}'."
            )
            return []

        entries = payload.get("data", []) if isinstance(payload, dict) else []
        discovered = []
        for entry in entries:
            model_id = entry.get("id") if isinstance(entry, dict) else None
            if isinstance(model_id, str) and model_id and model_id not in discovered:
                discovered.append(model_id)
        return discovered

    def configure_agent(self):
        # OpenCode supports opencode.json
        config = {
            "$schema": "https://opencode.ai/config.json",
            "permission": "allow",  # Bypass all permission prompts for unattended evaluation
            # Avoid a concurrent title-generation request duplicating local
            # model prompt/KV memory while the main agent is starting.
            "agent": {"title": {"disable": True}},
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
            base_url = self.local_provider.api_url
            context_limit = getattr(self, "local_context_limit", None) or get_env_int(
                "LLM_EVAL_LOCAL_CONTEXT_LIMIT", 0
            )
            if not context_limit and base_url == LM_STUDIO_API_URL:
                # OpenCode cannot discover context limits through the
                # OpenAI-compatible /v1/models endpoint, so follow the loaded
                # LM Studio instance when no explicit limit was requested.
                context_limit = get_lms_loaded_context_length(self.model_name)
                if context_limit:
                    print(
                        "[+] OpenCode context limit follows loaded LM Studio "
                        f"context: {context_limit}"
                    )
            context_limit = context_limit or DEFAULT_LOCAL_CONTEXT_LIMIT
            output_limit = get_env_int(
                "LLM_EVAL_LOCAL_OUTPUT_LIMIT", DEFAULT_LOCAL_OUTPUT_LIMIT
            )
            provider_id = self.local_provider.provider_id
            model_ids = self._discover_local_models()
            if self.model_name not in model_ids:
                model_ids.append(self.model_name)
            models = {
                model_id: {
                    "name": model_id,
                    "limit": {
                        "context": context_limit,
                        "output": output_limit,
                    },
                }
                for model_id in model_ids
            }
            config["provider"] = {
                provider_id: {
                    "npm": "@ai-sdk/openai-compatible",
                    "name": self.local_provider.display_name,
                    "options": {"baseURL": base_url},
                    "models": models,
                }
            }
            print(
                f"[+] OpenCode discovered {len(model_ids)} local model(s) from "
                f"{base_url.rstrip('/')}/models."
            )
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

        # Pass the prompt via stdin: office prompts exceed Windows' 32,767
        # character command-line limit, and opencode reads piped stdin when no
        # positional message is given.
        cmd = [
            "opencode",
            "run",
            "--format",
            "json",
            "--print-logs",
            "--pure",
            "--title",
            f"{self.model_name} {self.prompt_file.stem}",
            "--dir",
            str(self.work_dir.resolve()),
        ]

        model_ref = self._model_ref()
        if model_ref:
            cmd.extend(["--model", model_ref])

        env = self.get_env_vars()
        chat_log_path = self.work_dir / CHAT_SESSION_FILENAME
        result_json_path = self.work_dir / OPENCODE_RESULT_FILENAME

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
        tool_calls = 0
        finish_reasons: List[str] = []

        # Provider/model info parsed from log output
        opencode_version = None
        provider_id = None
        model_id = None
        error_messages: List[str] = []
        safety_monitor = self.create_safety_monitor()

        def stop_if_needed(termination) -> None:
            if termination:
                raise RunSafetyTermination(termination)

        def on_stdout(line: str, log_file) -> None:
            nonlocal total_input, total_output, total_reasoning, total_cost
            nonlocal cache_read, cache_write, num_turns, tool_calls
            stripped = line.strip()
            if not stripped:
                return
            try:
                event = json.loads(stripped)
                parsed = parse_opencode_event(event)
                if parsed.text:
                    safe_stdout_write(parsed.text)
                    log_file.write(parsed.text)
                    log_file.flush()
                if parsed.usage:
                    total_input += parsed.usage.get("input_tokens", 0)
                    total_output += parsed.usage.get("output_tokens", 0)
                    total_reasoning += parsed.usage.get("reasoning_tokens", 0)
                    total_cost += parsed.usage.get("cost_usd", 0)
                    cache_read += parsed.usage.get("cache_read_tokens", 0)
                    cache_write += parsed.usage.get("cache_write_tokens", 0)
                if parsed.turn_completed:
                    num_turns += 1
                    stop_if_needed(safety_monitor.observe_turn(parsed.usage))
                tool_calls += parsed.tool_calls
                tool_call = extract_opencode_tool_call(event)
                if tool_call:
                    stop_if_needed(safety_monitor.observe_tool(*tool_call))
                if parsed.finish_reason:
                    finish_reasons.append(parsed.finish_reason)
                if parsed.error:
                    error_messages.append(parsed.error)
                if parsed.log_raw:
                    log_file.write(line)
                    log_file.flush()
            except json.JSONDecodeError:
                safe_stdout_write(line)
                log_file.write(line)
                log_file.flush()

        def on_stderr(line: str, log_file) -> None:
            nonlocal opencode_version, provider_id, model_id
            if _stderr_noise.search(line):
                return
            sys.stderr.write(line)
            sys.stderr.flush()
            log_file.write(line)
            log_file.flush()
            version, parsed_provider, parsed_model = self._parse_log_metadata(line)
            if opencode_version is None and version:
                opencode_version = version
            if provider_id is None and parsed_provider:
                provider_id = parsed_provider
                model_id = parsed_model
            if " stream error" in line or (
                "service=session.processor" in line and " error=" in line
            ):
                error_messages.append(line.strip())

        display_cmd = "opencode run <prompt> --format json --print-logs (prompt via stdin)"
        if model_ref:
            display_cmd += f" --model {model_ref}"
        else:
            display_cmd += " (using OpenCode default model)"
        process_timeout, idle_timeout = _adjusted_local_timeouts(
            self.safety_limits, self.non_local
        )
        if idle_timeout != self.safety_limits.process_idle_timeout:
            print(
                "[*] OpenCode local watchdog raised for silent generations: "
                f"idle={idle_timeout:g}s, total={process_timeout:g}s "
                "(override with --max-idle-seconds / --max-seconds)"
            )
        process_result = run_streaming_process(
            cmd=cmd,
            work_dir=self.work_dir,
            chat_log_path=chat_log_path,
            env=env,
            input_text=prompt_content,
            display_cmd=display_cmd,
            timeout=process_timeout,
            idle_timeout=idle_timeout,
            on_line=on_stdout,
            on_stderr_line=on_stderr,
            merge_stderr=False,
            cwd=PROJECT_ROOT,
            report_completion=False,
        )

        if model_ref and model_id:
            expected_model_id = self._model_id_from_ref(model_ref)
            if model_id != expected_model_id:
                error_messages.append(
                    f"OpenCode selected {provider_id}/{model_id}, expected {model_ref}"
                )

        termination = process_result.termination
        if termination:
            error_messages.append(termination.message)
        elif process_result.returncode == 0 and not error_messages:
            print("[+] Agent finished successfully.")
            with open(chat_log_path, "a", encoding="utf-8") as log_file:
                log_file.write("\n[SUCCESS] Process exited cleanly.\n")
        else:
            if error_messages and process_result.returncode == 0:
                print("[-] Agent finished with provider/tool error.")
            else:
                print(
                    f"[-] Agent finished with error code {process_result.returncode}"
                )
            with open(chat_log_path, "a", encoding="utf-8") as log_file:
                log_file.write(
                    f"\n[ERROR] Process exited with code {process_result.returncode}\n"
                )
                for message in error_messages[-3:]:
                    log_file.write(f"[ERROR] {message}\n")

        bookkeeping_files = {
            CHAT_SESSION_FILENAME,
            OPENCODE_RESULT_FILENAME,
            SERVER_LOG_FILENAME,
            "opencode.json",
            "summary.html",
        }
        artifacts = sorted(
            path.name
            for path in self.work_dir.iterdir()
            if path.is_file() and path.name not in bookkeeping_files
        )
        warnings = []
        if termination:
            warnings.append(
                f"Run terminated by safety guardrail: {termination.message}"
            )
        if "length" in finish_reasons:
            warnings.append(
                "The model reached the configured output-token limit before completing the turn."
            )
        if tool_calls == 0:
            warnings.append("The model emitted no tool calls.")
        if not artifacts:
            warnings.append("The run produced no generated artifact files.")
        for warning in warnings:
            print(f"[-] OpenCode diagnostic: {warning}")

        # Save accumulated token usage and completion diagnostics to result JSON
        if total_input > 0 or total_output > 0 or error_messages or termination:
            result_data = {
                "input_tokens": total_input,
                "output_tokens": total_output,
                "total_tokens": total_input + total_output,
                "reasoning_tokens": total_reasoning,
                "cache_read_tokens": cache_read,
                "cache_write_tokens": cache_write,
                "cost_usd": total_cost,
                "num_turns": num_turns,
                "tool_calls": tool_calls,
                "finish_reasons": finish_reasons,
                "artifacts_produced": artifacts,
                "warnings": warnings,
                "status": "error" if error_messages or termination else "success",
                "is_error": bool(error_messages or termination),
                "process_returncode": process_result.returncode,
            }
            if termination:
                result_data["terminal_reason"] = termination.reason
                result_data["termination"] = termination.to_dict()
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

"""Codex CLI adapter."""

import json
import shutil
import subprocess
import sys
from typing import Dict, List, Optional

from evaluation_core import (
    AgentRunner,
    CHAT_SESSION_FILENAME,
    CODEX_EVENTS_FILENAME,
    CODEX_LAST_MESSAGE_FILENAME,
    run_streaming_process,
    read_prompt_file,
    safe_stdout_write,
)
from evaluation_metrics import CODEX_RESULT_FILENAME
from runner_events import (
    codex_usage_from_obj,
    extract_codex_readable_event,
    extract_codex_session_id,
    find_codex_usage_objects,
)


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

        cmd = [codex_bin, "exec"]

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

        # Mutable state captured by the on_line callback
        state = {
            "total_input": 0,
            "total_output": 0,
            "total_reasoning": 0,
            "cache_read": 0,
            "num_turns": 0,
            "session_id": None,
            "last_usage_total": 0,
        }
        events_file = open(events_path, "w", encoding="utf-8")

        def on_line(line: str, log_file) -> None:
            stripped = line.strip()
            if not stripped:
                return

            try:
                event = json.loads(stripped)
                events_file.write(line)
                events_file.flush()

                if state["session_id"] is None:
                    state["session_id"] = extract_codex_session_id(event)

                readable = extract_codex_readable_event(event)
                if readable:
                    safe_stdout_write(readable)
                    log_file.write(readable)
                    log_file.flush()

                event_type = str(event.get("type", event.get("event", ""))).lower()
                usage_objects = find_codex_usage_objects(event)
                if usage_objects and (
                    "turn" in event_type
                    or "complete" in event_type
                    or "usage" in event_type
                    or event.get("usage")
                ):
                    usage = codex_usage_from_obj(usage_objects[0])
                    if usage["total_tokens"] > 0:
                        # Codex reports usage at turn boundaries. If a future CLI version
                        # reports cumulative totals, use the positive delta instead of
                        # double-counting the full cumulative snapshot.
                        current_total = usage["total_tokens"]
                        last_total = state["last_usage_total"]
                        if current_total >= last_total and last_total > 0:
                            scale = (current_total - last_total) / current_total
                        else:
                            scale = 1
                        state["total_input"] += round(usage["input_tokens"] * scale)
                        state["total_output"] += round(usage["output_tokens"] * scale)
                        state["total_reasoning"] += round(usage["reasoning_tokens"] * scale)
                        state["cache_read"] += round(usage["cache_read_tokens"] * scale)
                        state["last_usage_total"] = max(last_total, current_total)
                        state["num_turns"] += 1

            except json.JSONDecodeError:
                safe_stdout_write(line)
                log_file.write(line)
                log_file.flush()

        try:
            run_streaming_process(
                cmd=cmd,
                work_dir=self.work_dir,
                chat_log_path=chat_log_path,
                env=env,
                input_text=prompt_content,
                display_cmd="codex exec --json --output-last-message CODEX_LAST_MESSAGE.TXT ...",
                on_line=on_line,
            )
        finally:
            events_file.close()

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
            "input_tokens": state["total_input"],
            "output_tokens": state["total_output"],
            "total_tokens": state["total_input"] + state["total_output"],
            "reasoning_tokens": state["total_reasoning"],
            "cache_read_tokens": state["cache_read"],
            "num_turns": state["num_turns"],
            "provider_id": "OpenAI",
            "model_id": self.model_name,
        }
        if state["session_id"]:
            result_data["session_id"] = state["session_id"]
        try:
            result_data["codex_version"] = subprocess.check_output(
                [codex_bin, "--version"], text=True, timeout=10
            ).strip()
        except Exception:
            pass

        with open(result_json_path, "w", encoding="utf-8") as f:
            json.dump(result_data, f, indent=2)
        print(f"[+] Codex usage data saved to: {result_json_path}")

"""Qoder CLI adapter."""

import json
from typing import Dict

from evaluation_core import (
    AgentRunner,
    CHAT_SESSION_FILENAME,
    run_streaming_process,
    read_prompt_file,
    safe_stdout_write,
)
from evaluation_metrics import QODER_EVENTS_FILENAME, QODER_RESULT_FILENAME
from runner_events import (
    QoderUsageEstimator,
    normalize_qoder_result,
    parse_qoder_event,
)


class QoderRunner(AgentRunner):
    executable_name = "qodercli"

    def get_model_extra_info(self) -> Dict[str, str]:
        result_path = self.work_dir / QODER_RESULT_FILENAME
        if not result_path.exists():
            return {}
        try:
            with open(result_path, encoding="utf-8") as f:
                data = json.load(f)
            extra = {}
            model_usage = data.get("modelUsage", {})
            if model_usage:
                routed_models = [
                    model for model in model_usage if model != "<synthetic>"
                ]
                if routed_models:
                    extra["Routed Model"] = routed_models[0]
            return extra
        except (OSError, ValueError):
            return {}

    def execute_agent(self):
        prompt_content = read_prompt_file(self.prompt_file)

        cmd = [
            self.agent_binary,
            "-p",
            "--permission-mode",
            "bypass_permissions",
            "--output-format",
            "stream-json",
            "--no-session-persistence",
            "-m",
            self.model_name,
        ]

        env = self.get_env_vars()
        env.pop("QODER_CLI", None)
        chat_log_path = self.work_dir / CHAT_SESSION_FILENAME
        events_path = self.work_dir / QODER_EVENTS_FILENAME
        result_json_path = self.work_dir / QODER_RESULT_FILENAME

        result_data = None
        qodercli_version = None
        usage_estimator = QoderUsageEstimator.from_prompt(prompt_content)
        events_file = open(events_path, "w", encoding="utf-8")

        def on_line(line: str, log_file) -> None:
            nonlocal result_data, qodercli_version
            stripped = line.strip()
            if not stripped:
                return
            try:
                event = json.loads(stripped)
                events_file.write(
                    json.dumps(event, ensure_ascii=False, separators=(",", ":"))
                    + "\n"
                )
                events_file.flush()
                usage_estimator.observe(event)
                event_type = event.get("type", "")

                if event_type == "system":
                    subtype = event.get("subtype", "")
                    if subtype == "init":
                        qodercli_version = event.get("qodercli_version")
                        print(
                            f"\n[*] Qoder session started "
                            f"(model={event.get('model', '?')}, "
                            f"version={event.get('qodercli_version', '?')}). "
                            f"Working...",
                            flush=True,
                        )
                    # hook_started/hook_progress/hook_response are noise
                else:
                    parsed = parse_qoder_event(event)
                    if parsed.text:
                        safe_stdout_write(parsed.text)
                        log_file.write(parsed.text)
                        log_file.flush()
                    if parsed.result is not None:
                        result_data = parsed.result

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
                display_cmd=(
                    f"{self.agent_binary} -p <prompt> "
                    f"--permission-mode bypass_permissions "
                    f"--output-format stream-json -m {self.model_name}"
                ),
                on_line=on_line,
            )
        finally:
            events_file.close()

        if result_data is None:
            result_data = {
                "type": "result",
                "subtype": "success",
                "is_error": False,
                "num_turns": usage_estimator.turns,
                "errors": [],
            }

        result_data = normalize_qoder_result(
            result_data,
            usage_estimator.result(),
            qodercli_version,
        )
        with open(result_json_path, "w", encoding="utf-8") as f:
            json.dump(result_data, f, indent=2)
        print(f"[+] Qoder usage data saved to: {result_json_path}")

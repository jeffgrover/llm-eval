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
from run_safety import RunSafetyTermination
from runner_events import (
    QoderUsageEstimator,
    extract_message_tool_calls,
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
        safety_monitor = self.create_safety_monitor()
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
                previous_estimate = usage_estimator.result()
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
                    if event_type == "assistant":
                        for tool_name, tool_input in extract_message_tool_calls(event):
                            termination = safety_monitor.observe_tool(
                                tool_name, tool_input
                            )
                            if termination:
                                raise RunSafetyTermination(termination)
                        current_estimate = usage_estimator.result()
                        termination = safety_monitor.observe_turn(
                            {
                                "input_tokens": (
                                    current_estimate["input_tokens"]
                                    - previous_estimate["input_tokens"]
                                ),
                                "output_tokens": (
                                    current_estimate["output_tokens"]
                                    - previous_estimate["output_tokens"]
                                ),
                            }
                        )
                        if termination:
                            raise RunSafetyTermination(termination)

            except json.JSONDecodeError:
                safe_stdout_write(line)
                log_file.write(line)
                log_file.flush()

        try:
            process_result = run_streaming_process(
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
                timeout=self.safety_limits.process_timeout,
                on_line=on_line,
            )
        finally:
            events_file.close()

        if result_data is None:
            result_data = {
                "type": "result",
                "subtype": (
                    "success"
                    if process_result.returncode == 0 and not process_result.timed_out
                    else "error_during_execution"
                ),
                "is_error": process_result.returncode != 0 or process_result.timed_out,
                "num_turns": usage_estimator.turns,
                "errors": (
                    []
                    if process_result.returncode == 0 and not process_result.timed_out
                    else [
                        "Process timed out"
                        if process_result.timed_out
                        else f"Exit code {process_result.returncode}"
                    ]
                ),
            }

        result_data = normalize_qoder_result(
            result_data,
            usage_estimator.result(),
            qodercli_version,
        )
        if process_result.termination:
            result_data.update(
                {
                    "subtype": "error_during_execution",
                    "status": "error",
                    "is_error": True,
                    "error": process_result.termination.message,
                    "errors": [process_result.termination.message],
                    "terminal_reason": process_result.termination.reason,
                    "termination": process_result.termination.to_dict(),
                    "warnings": [
                        "Run terminated by safety guardrail: "
                        f"{process_result.termination.message}"
                    ],
                }
            )
        with open(result_json_path, "w", encoding="utf-8") as f:
            json.dump(result_data, f, indent=2)
        print(f"[+] Qoder usage data saved to: {result_json_path}")

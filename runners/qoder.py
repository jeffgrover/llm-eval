"""Qoder CLI adapter."""

import json
import subprocess
from typing import Dict

from evaluation_core import (
    AgentRunner,
    CHAT_SESSION_FILENAME,
    read_prompt_file,
    safe_stdout_write,
    send_stdin,
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

        print(
            f"[*] Executing: {self.agent_binary} -p <prompt> "
            f"--permission-mode bypass_permissions "
            f"--output-format stream-json -m {self.model_name}"
        )
        print(f"[*] Output logging to: {chat_log_path}")

        result_data = None
        qodercli_version = None
        usage_estimator = QoderUsageEstimator.from_prompt(prompt_content)

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

        if result_data is None:
            result_data = {
                "type": "result",
                "subtype": (
                    "success" if process.returncode == 0 else "error_during_execution"
                ),
                "is_error": process.returncode != 0,
                "num_turns": usage_estimator.turns,
                "errors": (
                    [] if process.returncode == 0 else [f"Exit code {process.returncode}"]
                ),
            }

        result_data = normalize_qoder_result(
            result_data,
            usage_estimator.result(),
            qodercli_version,
        )
        with open(result_json_path, "w", encoding="utf-8") as f:
            json.dump(result_data, f, indent=2)
        print(f"[+] Qoder usage data saved to: {result_json_path}")

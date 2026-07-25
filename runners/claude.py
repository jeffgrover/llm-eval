"""Claude Code CLI adapter."""

import json
import subprocess

from evaluation_core import (
    AgentRunner,
    CHAT_SESSION_FILENAME,
    CLAUDE_MODEL_IDS,
    read_prompt_file,
    safe_stdout_write,
    send_stdin,
)
from evaluation_metrics import CLAUDE_RESULT_FILENAME
from runner_events import parse_claude_event

class ClaudeRunner(AgentRunner):
    def execute_agent(self):
        # Claude Code: `claude -p` reads the prompt from stdin in headless mode.
        # Using --output-format stream-json to capture token usage and cost metrics
        prompt_content = read_prompt_file(self.prompt_file)

        cmd = [
            "claude",
            "-p",
            # bypassPermissions auto-approves every action without prompting.
            # NOTE: --dangerously-skip-permissions alone hangs headless `-p` runs
            # on claude >= 2.1.x (it now waits on an interactive confirmation that
            # stdin never provides), so use the explicit permission mode instead.
            "--permission-mode",
            "bypassPermissions",
            "--output-format",
            "stream-json",
            "--verbose",
            "--effort=max",
        ]

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

        print(
            f"[*] Executing: claude -p <prompt> --permission-mode bypassPermissions --output-format stream-json"
        )
        print(f"[*] Output logging to: {chat_log_path}")

        result_data = None

        with open(chat_log_path, "w", encoding="utf-8") as log_file:
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
                    event_type = event.get("type", "")

                    if event_type == "system":
                        # Startup / progress events (init, thinking_tokens, etc.)
                        # carry no transcript text, but printing them to the console
                        # shows the run is alive during long max-effort thinking
                        # phases instead of looking frozen.
                        subtype = event.get("subtype", "")
                        if subtype == "init":
                            print(
                                f"\n[*] Claude session started "
                                f"(model={event.get('model', '?')}, "
                                f"perm={event.get('permissionMode', '?')}). Thinking...",
                                flush=True,
                            )
                        elif subtype == "thinking_tokens":
                            safe_stdout_write(".")

                    else:
                        parsed = parse_claude_event(event)
                        if parsed.text:
                            safe_stdout_write(parsed.text)
                            log_file.write(parsed.text)
                            log_file.flush()
                        if parsed.result is not None:
                            result_data = parsed.result

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

        # Save result JSON for metadata extraction (token usage, cost, turns)
        if result_data:
            with open(result_json_path, "w", encoding="utf-8") as f:
                json.dump(result_data, f, indent=2)
            print(f"[+] Claude usage data saved to: {result_json_path}")

"""Antigravity/Gemini CLI adapter."""

import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List

from evaluation_core import (
    AgentRunner,
    CHAT_SESSION_FILENAME,
    SERVER_LOG_FILENAME,
    run_streaming_process,
    read_prompt_file,
    safe_stdout_write,
)
from evaluation_metrics import GEMINI_RESULT_FILENAME
from runner_events import parse_gemini_transcript

class GeminiRunner(AgentRunner):
    supports_custom_provider = True

    _RUNNER_OUTPUT_FILES = {
        CHAT_SESSION_FILENAME,
        GEMINI_RESULT_FILENAME,
        SERVER_LOG_FILENAME,
        "summary.html",
    }

    def get_model_extra_info(self) -> Dict[str, str]:
        """Read provider/model info from Gemini result JSON."""
        result_path = self.work_dir / GEMINI_RESULT_FILENAME
        if not result_path.exists():
            return {}
        try:
            with open(result_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            extra = {}
            if data.get("agy_version"):
                extra["Antigravity Version"] = data["agy_version"]
            if data.get("provider"):
                extra["Provider"] = data["provider"]
            if data.get("model_id"):
                extra["Model ID"] = data["model_id"]
            return extra
        except Exception:
            return {}

    def _get_agy_transcript_stats(self, work_dir: Path, start_time: datetime) -> Dict[str, int]:
        stats = {
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
            "cached": 0,
            "tool_calls": 0,
            "num_turns": 0,
        }

        conv_id = None
        last_conv_file = Path.home() / ".gemini" / "antigravity-cli" / "cache" / "last_conversations.json"
        if last_conv_file.exists():
            try:
                mapping = json.loads(last_conv_file.read_text(encoding="utf-8"))
                conv_id = mapping.get(str(work_dir.resolve())) or mapping.get(str(work_dir))
            except Exception:
                pass

        transcript_path = None
        if conv_id:
            candidate = Path.home() / ".gemini" / "antigravity-cli" / "brain" / conv_id / ".system_generated" / "logs" / "transcript_full.jsonl"
            if candidate.exists():
                transcript_path = candidate
            else:
                candidate_short = Path.home() / ".gemini" / "antigravity-cli" / "brain" / conv_id / ".system_generated" / "logs" / "transcript.jsonl"
                if candidate_short.exists():
                    transcript_path = candidate_short

        if not transcript_path:
            brain_dir = Path.home() / ".gemini" / "antigravity-cli" / "brain"
            if brain_dir.exists():
                best_time = 0
                for path in brain_dir.glob("*/.system_generated/logs/transcript_full.jsonl"):
                    mtime = path.stat().st_mtime
                    if mtime > best_time:
                        best_time = mtime
                        transcript_path = path

        if not transcript_path or not transcript_path.exists():
            return stats

        records = []
        try:
            with open(transcript_path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    records.append(json.loads(line))
        except Exception as e:
            print(f"[-] Error parsing transcript file {transcript_path}: {e}")

        return parse_gemini_transcript(records)

    def _build_agy_command(self, agy_bin: str, prompt_content: str) -> List[str]:
        """Build an isolated AGY command whose project is the evaluation workspace."""
        cmd = [
            agy_bin,
            "--new-project",
            "--add-dir",
            str(self.work_dir.resolve()),
            "--dangerously-skip-permissions",
            "--print",
            prompt_content,
        ]
        if self.model_name:
            cmd.extend(["--model", self.model_name])
        return cmd

    def _generated_artifacts(self) -> List[str]:
        """Return root-level files produced by the evaluated agent."""
        return sorted(
            path.name
            for path in self.work_dir.iterdir()
            if path.is_file() and path.name not in self._RUNNER_OUTPUT_FILES
        )

    def execute_agent(self):
        prompt_content = read_prompt_file(self.prompt_file)

        agy_bin = shutil.which("agy") or shutil.which("gemini") or "agy"
        cmd = self._build_agy_command(agy_bin, prompt_content)

        env = self.get_env_vars()
        env.pop("GEMINI_CLI", None)
        env.pop("GEMINI_CLI_NO_RELAUNCH", None)
        env.pop("ANTIGRAVITY_CLI", None)

        chat_log_path = self.work_dir / CHAT_SESSION_FILENAME
        result_json_path = self.work_dir / GEMINI_RESULT_FILENAME

        display_cmd = (
            f"agy --new-project --add-dir {self.work_dir.resolve()} "
            "--dangerously-skip-permissions --print <prompt>"
        )
        if self.model_name:
            display_cmd += f" --model {self.model_name}"
        print(f"[*] Executing: {display_cmd}")
        print(f"[*] Output logging to: {chat_log_path}")

        start_time = datetime.now()
        tool_call_count = 0

        def on_line(line: str, log_file) -> None:
            nonlocal tool_call_count
            safe_stdout_write(line)
            log_file.write(line)
            log_file.flush()
            if "[Tool:" in line or "tool_call" in line:
                tool_call_count += 1

        result = run_streaming_process(
            cmd=cmd,
            work_dir=self.work_dir,
            chat_log_path=chat_log_path,
            env=env,
            display_cmd=display_cmd,
            on_line=on_line,
        )

        generated_artifacts = self._generated_artifacts()
        if result.returncode == 0 and not generated_artifacts:
            artifact_error = (
                "AGY exited cleanly but produced no root-level artifacts in "
                f"{self.work_dir.resolve()}."
            )
            print(f"[-] {artifact_error}")
            with open(chat_log_path, "a", encoding="utf-8") as log_file:
                log_file.write(f"\n[ERROR] {artifact_error}\n")

        end_time = datetime.now()
        duration_ms = int((end_time - start_time).total_seconds() * 1000)

        # Get agy version
        try:
            agy_version = subprocess.check_output(
                [agy_bin, "--version"], text=True, timeout=10
            ).strip()
        except Exception:
            agy_version = None

        transcript_stats = self._get_agy_transcript_stats(self.work_dir, start_time)

        provider_name = self.custom_provider.title() if self.custom_provider else "Google"
        run_succeeded = result.returncode == 0 and bool(generated_artifacts)

        result_data = {
            "type": "result",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": "success" if run_succeeded else "error",
            "stats": {
                "input_tokens": transcript_stats["input_tokens"],
                "output_tokens": transcript_stats["output_tokens"],
                "total_tokens": transcript_stats["total_tokens"],
                "cached": transcript_stats.get("cached", 0),
                "duration_ms": duration_ms,
                "tool_calls": max(transcript_stats.get("tool_calls", 0), tool_call_count),
            },
            "num_turns": max(transcript_stats.get("num_turns", 1), 1),
            "agy_version": agy_version,
            "provider": provider_name,
            "model_id": self.model_name,
            "artifacts": generated_artifacts,
        }
        if result.returncode == 0 and not generated_artifacts:
            result_data["error"] = (
                "AGY exited successfully but did not create any root-level "
                f"artifacts in {self.work_dir.resolve()}."
            )

        with open(result_json_path, "w", encoding="utf-8") as f:
            json.dump(result_data, f, indent=2)
        print(f"[+] Antigravity/Gemini usage data saved to: {result_json_path}")

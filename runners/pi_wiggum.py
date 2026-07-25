"""Pi Wiggum iterative checker adapter."""

import json
import subprocess
import time
from pathlib import Path
from typing import Dict, List

from evaluation_core import (
    CHAT_SESSION_FILENAME,
    PI_WIGGUM_MAX_SECONDS,
    read_prompt_file,
    safe_stdout_write,
)
from evaluation_metrics import PI_WIGGUM_RESULT_FILENAME
from .pi import PiRunner

class PiWiggumRunner(PiRunner):
    def _wiggum_prompt_kind(self) -> str:
        prompt_stem = self.prompt_file.stem
        if prompt_stem.startswith("office_prompt"):
            return "office"
        if prompt_stem.startswith("elevator_prompt"):
            return "elevator"
        return "generic"

    def _wiggum_required_files(self) -> List[str]:
        kind = self._wiggum_prompt_kind()
        if kind == "office":
            return [
                "index.html",
                "person.js",
                "world.js",
                "elevator_logic.js",
                "elevator.js",
                "sim.js",
                "elevator_logic_test.js",
            ]
        if kind == "elevator":
            return ["index.html", "person.js", "elevator.js"]
        return ["index.html"]

    def _build_pi_command(self) -> List[str]:
        cmd = super()._build_pi_command()
        if "--approve" not in cmd:
            cmd.insert(5, "--approve")
        return cmd

    def execute_agent(self):
        self._execute_wiggum_loop()

    def _execute_wiggum_loop(self):
        start = time.monotonic()
        prompt_content = read_prompt_file(self.prompt_file)
        aggregate = {
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
            "cache_read_tokens": 0,
            "cache_write_tokens": 0,
            "cost_usd": 0.0,
            "num_turns": 0,
            "attempts": 0,
            "passed": False,
            "status": "failed",
            "terminal_reason": "failed",
            "elapsed_seconds": 0.0,
            "checker_summaries": [],
        }

        while True:
            elapsed = time.monotonic() - start
            if elapsed >= PI_WIGGUM_MAX_SECONDS:
                aggregate["terminal_reason"] = "time_cap_reached"
                break

            attempt = aggregate["attempts"] + 1
            remaining = max(1, int(PI_WIGGUM_MAX_SECONDS - elapsed))
            attempt_timeout = min(900, remaining)
            raw_filename = f"PI_WIGGUM_ATTEMPT_{attempt:03d}.JSONL"
            print(f"[*] Pi Wiggum attempt {attempt} starting; {remaining}s remain before cap.")

            attempt_result = self._run_pi_attempt(
                prompt_content,
                raw_filename,
                append_chat=True,
                attempt_number=attempt,
                timeout_seconds=attempt_timeout,
            )
            aggregate["attempts"] = attempt
            self._add_pi_attempt_metrics(aggregate, attempt_result)

            checker_summary = self._run_wiggum_checkers()
            aggregate["checker_summaries"].append(checker_summary)
            self._write_wiggum_result(aggregate, start)

            if checker_summary["passed"]:
                aggregate["passed"] = True
                aggregate["status"] = "success"
                aggregate["terminal_reason"] = "completed"
                break

            if time.monotonic() - start >= PI_WIGGUM_MAX_SECONDS:
                aggregate["terminal_reason"] = "time_cap_reached"
                break

            prompt_content = self._build_repair_prompt(checker_summary, attempt)

        self._write_wiggum_result(aggregate, start)
        if aggregate["status"] == "success":
            print(f"[+] Pi Wiggum checks passed after {aggregate['attempts']} attempt(s).")
        else:
            print(f"[-] Pi Wiggum stopped with status {aggregate['terminal_reason']} after {aggregate['attempts']} attempt(s).")

    def _add_pi_attempt_metrics(self, aggregate: Dict, attempt_result: Dict):
        for key in (
            "input_tokens",
            "output_tokens",
            "total_tokens",
            "cache_read_tokens",
            "cache_write_tokens",
            "num_turns",
        ):
            aggregate[key] += attempt_result.get(key, 0) or 0
        aggregate["cost_usd"] += attempt_result.get("cost_usd", 0.0) or 0.0
        if attempt_result.get("provider_id") and not aggregate.get("provider_id"):
            aggregate["provider_id"] = attempt_result["provider_id"]
        if attempt_result.get("model_id") and not aggregate.get("model_id"):
            aggregate["model_id"] = attempt_result["model_id"]

    def _run_wiggum_checkers(self) -> Dict:
        static = self._run_checker(["node", "../../static_check.js", "."], "static")
        runtime = self._run_checker(["node", "../../runtime_check.js", "."], "runtime")
        logic_test = None
        if self._wiggum_prompt_kind() == "office":
            logic_test = self._run_checker(["node", "elevator_logic_test.js"], "elevator logic test")

        static_json = self._read_json_file(self.work_dir / "static_check.json")
        runtime_json = self._read_json_file(self.work_dir / "runtime_check.json")

        missing_files = [
            name for name in self._wiggum_required_files()
            if not (self.work_dir / name).is_file()
        ]
        static_errors = static_json.get("static_errors", []) if isinstance(static_json, dict) else []
        console_errors = runtime_json.get("console_errors", []) if isinstance(runtime_json, dict) else []
        page_errors = runtime_json.get("page_errors", []) if isinstance(runtime_json, dict) else []
        loaded = bool(runtime_json.get("loaded")) if isinstance(runtime_json, dict) else False
        nonblank = bool(runtime_json.get("nonblank_canvas")) if isinstance(runtime_json, dict) else False
        frames = int(runtime_json.get("animation_frames", 0) or 0) if isinstance(runtime_json, dict) else 0
        objects = int(runtime_json.get("scene_object_count", 0) or 0) if isinstance(runtime_json, dict) else 0
        changes = int(runtime_json.get("dynamic_changes", 0) or 0) if isinstance(runtime_json, dict) else 0

        passed = (
            static["returncode"] == 0
            and runtime["returncode"] == 0
            and not missing_files
            and not static_errors
            and not console_errors
            and not page_errors
            and loaded
            and nonblank
            and frames >= 2
            and objects > 0
            and changes > 0
        )
        if logic_test is not None:
            passed = passed and logic_test["returncode"] == 0

        summary = {
            "passed": passed,
            "static": static,
            "runtime": runtime,
            "logic_test": logic_test,
            "missing_files": missing_files,
            "static_errors": static_errors[:10],
            "console_errors": console_errors[:10],
            "page_errors": page_errors[:10],
            "loaded": loaded,
            "nonblank_canvas": nonblank,
            "animation_frames": frames,
            "scene_object_count": objects,
            "dynamic_changes": changes,
        }
        self._append_checker_summary_to_chat(summary)
        return summary

    def _run_checker(self, cmd: List[str], label: str) -> Dict:
        print(f"[*] Running {label} checker: {' '.join(cmd)}")
        try:
            result = subprocess.run(
                cmd,
                cwd=self.work_dir,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=300,
            )
            output = "\n".join(part for part in (result.stdout, result.stderr) if part)
            safe_stdout_write(output)
            return {
                "returncode": result.returncode,
                "output": output[-6000:],
            }
        except subprocess.TimeoutExpired as exc:
            output = "\n".join(
                part for part in (exc.stdout or "", exc.stderr or "") if part
            )
            return {
                "returncode": 124,
                "output": f"{output}\n{label} checker timed out after 300 seconds."[-6000:],
            }

    def _read_json_file(self, path: Path) -> Dict:
        if not path.exists():
            return {}
        try:
            return json.loads(path.read_text(encoding="utf-8", errors="ignore"))
        except json.JSONDecodeError:
            return {}

    def _append_checker_summary_to_chat(self, summary: Dict):
        with open(self.work_dir / CHAT_SESSION_FILENAME, "a", encoding="utf-8") as f:
            f.write("\n\n===== PI WIGGUM CHECKER SUMMARY =====\n")
            f.write(self._checker_text(summary))
            f.write("\n")

    def _checker_text(self, summary: Dict) -> str:
        lines = [
            f"passed: {summary['passed']}",
            f"static return code: {summary['static']['returncode']}",
            f"runtime return code: {summary['runtime']['returncode']}",
            f"loaded: {summary['loaded']}",
            f"nonblank_canvas: {summary['nonblank_canvas']}",
            f"animation_frames: {summary['animation_frames']}",
            f"scene_object_count: {summary['scene_object_count']}",
            f"dynamic_changes: {summary['dynamic_changes']}",
        ]
        if summary.get("logic_test") is not None:
            lines.append(f"elevator logic test return code: {summary['logic_test']['returncode']}")
        if summary.get("missing_files"):
            lines.append("missing_files:")
            lines.extend(f"- {value}" for value in summary["missing_files"])
        for label, values in (
            ("static_errors", summary["static_errors"]),
            ("page_errors", summary["page_errors"]),
            ("console_errors", summary["console_errors"]),
        ):
            if values:
                lines.append(f"{label}:")
                lines.extend(f"- {value}" for value in values[:10])
        for label in ("static", "runtime", "logic_test"):
            if summary.get(label) is None:
                continue
            output = summary[label].get("output", "").strip()
            if output:
                lines.append(f"{label} checker output:")
                lines.append(output[-3000:])
        return "\n".join(lines)

    def _build_repair_prompt(self, summary: Dict, attempt: int) -> str:
        checker_text = self._checker_text(summary)
        kind = self._wiggum_prompt_kind()
        files = ", ".join(self._wiggum_required_files())
        if kind == "office":
            scenario = "office-building simulation"
            extra_criteria = [
                "- all required office files exist",
                "- `node elevator_logic_test.js` passes",
                "- the simulation still reads as an office day with workers, visitors, world geometry, elevator logic, and UI",
            ]
            check_commands = [
                "node elevator_logic_test.js",
                "node ../../static_check.js .",
                "node ../../runtime_check.js .",
            ]
        elif kind == "elevator":
            scenario = "elevator simulation"
            extra_criteria = ["- the elevator simulation continues running in the browser"]
            check_commands = [
                "node ../../static_check.js .",
                "node ../../runtime_check.js .",
            ]
        else:
            scenario = "browser simulation"
            extra_criteria = ["- the simulation continues running in the browser"]
            check_commands = [
                "node ../../static_check.js .",
                "node ../../runtime_check.js .",
            ]

        criteria = "\n".join([
            "- zero static checker errors",
            "- zero startup, console, and page runtime errors",
            "- loaded page with a visible nonblank Three.js canvas",
            "- animation frames observed",
            "- scene objects observed",
            "- visible motion / dynamic changes observed",
            *extra_criteria,
        ])
        commands = "\n".join(check_commands)

        return f"""The approved {scenario} implementation did not pass evaluator-owned checks after attempt {attempt}.

Edit the existing files and create any missing required files from the original prompt: {files}. Do not replace this task with a different prompt's artifact, do not ask the human for decisions, and do not stop until the checks pass.

Required success criteria:
{criteria}

Checker feedback to fix:

{checker_text}

After editing, run:
{commands}

If any checker still reports failure, fix the files and rerun the checks before reporting completion.
"""

    def _write_wiggum_result(self, aggregate: Dict, start: float):
        aggregate["elapsed_seconds"] = round(time.monotonic() - start, 3)
        aggregate["duration_ms"] = int(aggregate["elapsed_seconds"] * 1000)
        path = self.work_dir / PI_WIGGUM_RESULT_FILENAME
        with open(path, "w", encoding="utf-8") as f:
            json.dump(aggregate, f, indent=2)
        print(f"[+] Pi Wiggum aggregate result saved to {PI_WIGGUM_RESULT_FILENAME}")

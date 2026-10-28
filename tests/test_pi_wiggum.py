import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from run_safety import DEFAULT_MAX_SECONDS, RunSafetyLimits
from evaluation_metrics import load_run_metrics
from runners import PiRunner, PiWiggumRunner


class PiRunnerTests(unittest.TestCase):
    def test_provider_outcome_overrides_clean_process_exit(self):
        failed_message = {
            "type": "message_end",
            "message": {
                "role": "assistant",
                "stopReason": "error",
                "errorMessage": "Upstream idle timeout exceeded",
            },
        }
        retry_failure = {
            "type": "auto_retry_end",
            "success": False,
            "finalError": "Upstream idle timeout exceeded",
        }
        recovered_message = {
            "type": "message_end",
            "message": {
                "role": "assistant",
                "stopReason": "stop",
                "usage": {"input": 1, "output": 1},
            },
        }
        for events, expected_error in (
            ([failed_message], "Upstream idle timeout exceeded"),
            ([retry_failure], "Upstream idle timeout exceeded"),
            ([failed_message, retry_failure], "Upstream idle timeout exceeded"),
            ([{"type": "message_end", "message": {
                "role": "assistant", "stopReason": "error",
            }}], "Pi assistant stopped: error"),
            ([{"type": "message_end", "message": {
                "role": "assistant", "stopReason": "aborted",
            }}], "Pi assistant stopped: aborted"),
            ([{"type": "auto_retry_end", "success": False}],
             "Pi exhausted provider retries"),
            ([failed_message, recovered_message,
              {"type": "auto_retry_end", "success": True}], None),
            ([{"type": "message_end", "message": {
                "role": "assistant", "stopReason": "length",
            }}, recovered_message], None),
        ):
            with self.subTest(events=events), tempfile.TemporaryDirectory() as temp_dir:
                work_dir = Path(temp_dir)
                prompt_path = work_dir / "prompt.txt"
                prompt_path.write_text("build it", encoding="utf-8")
                runner = PiRunner(
                    "pi", "test-model", prompt_path, headless=True, non_local=True
                )
                runner.work_dir = work_dir
                script = (
                    "import json; "
                    f"[print(json.dumps(event), flush=True) for event in {events!r}]"
                )
                with contextlib.redirect_stdout(io.StringIO()), mock.patch.object(
                    runner, "_build_pi_command",
                    return_value=[sys.executable, "-c", script],
                ):
                    runner.execute_agent()

                result = json.loads((work_dir / "PI_RESULT.JSON").read_text())
                is_error = expected_error is not None
                self.assertEqual(result["is_error"], is_error)
                self.assertEqual(result["status"], "error" if is_error else "success")
                self.assertEqual(result.get("error"), expected_error)
                if is_error:
                    self.assertNotIn("[SUCCESS]", (work_dir / "CHAT_SESSION.TXT").read_text())

    def test_clean_exit_with_length_finish_is_failure(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            runner = PiRunner("pi", "test-model", Path("prompt.txt"),
                              headless=True, non_local=True)
            runner.work_dir = Path(temp_dir)
            event = {"type": "message_end", "message": {
                "role": "assistant", "stopReason": "length",
                "usage": {"input": 20, "output": 32, "reasoning": 32},
            }}
            with (
                contextlib.redirect_stdout(io.StringIO()),
                mock.patch.object(runner, "_build_pi_command", return_value=[
                    sys.executable, "-c", f"print({json.dumps(event)!r})",
                ]),
            ):
                result = runner._run_pi_attempt("build it", "PI_EVENTS.JSONL")
            metrics = runner._pi_result_metrics(result)
            self.assertEqual(result["returncode"], 0)
            self.assertEqual(metrics["reasoning_tokens"], 32)
            self.assertEqual(metrics["terminal_reason"], "output_limit")
            self.assertTrue(metrics["is_error"])
            (runner.work_dir / "PI_RESULT.JSON").write_text(
                json.dumps(metrics), encoding="utf-8"
            )
            loaded = load_run_metrics(runner.work_dir)
            self.assertEqual(loaded.finish_reasons, ["length"])
            self.assertEqual(loaded.reasoning_tokens, 32)
            self.assertTrue(loaded.error)
            self.assertNotIn("[SUCCESS]", (runner.work_dir / "CHAT_SESSION.TXT").read_text())

    def test_normal_stop_without_office_entry_point_is_failure(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            prompt = work_dir / "office_prompt_v3.txt"
            prompt.write_text("build it", encoding="utf-8")
            runner = PiRunner("pi", "test-model", prompt,
                              headless=True, non_local=True)
            runner.work_dir = work_dir
            (work_dir / "person.js").write_text("// person", encoding="utf-8")
            (work_dir / "index.html").write_text("", encoding="utf-8")
            with (
                contextlib.redirect_stdout(io.StringIO()),
                mock.patch.object(runner, "_run_pi_attempt", return_value={
                    "input_tokens": 20, "output_tokens": 10,
                    "returncode": 0, "finish_reason": "stop",
                }),
            ):
                runner._execute_pi()
            metrics = json.loads((work_dir / "PI_RESULT.JSON").read_text())
            self.assertTrue(metrics["is_error"])
            self.assertEqual(metrics["terminal_reason"], "missing_artifacts")
            self.assertIn("index.html", metrics["missing_files"])
            self.assertIn("sim.js", metrics["missing_files"])
            self.assertNotIn("person.js", metrics["missing_files"])

    def test_response_error_overrides_clean_process_exit(self):
        runner = PiRunner("pi", "test-model", Path("prompt.txt"),
                          headless=True, non_local=True)
        metrics = runner._pi_result_metrics({
            "returncode": 0, "finish_reason": "error",
            "error": "server disconnected",
        })
        self.assertTrue(metrics["is_error"])
        self.assertEqual(metrics["error"], "server disconnected")

    def test_pi_command_passes_explicit_thinking_level(self):
        runner = PiRunner(
            "pi",
            "test-model",
            Path("prompt.txt"),
            headless=True,
            non_local=False,
        )
        runner.thinking_level = "medium"

        command = runner._build_pi_command()

        self.assertIn("--thinking", command)
        self.assertEqual(command[command.index("--thinking") + 1], "medium")

    def test_attempt_stops_after_output_inactivity(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            prompt_path = work_dir / "prompt.txt"
            prompt_path.write_text("build it", encoding="utf-8")
            runner = PiRunner(
                "pi",
                "test-model",
                prompt_path,
                headless=True,
                non_local=True,
                safety_limits=RunSafetyLimits(
                    max_seconds=5,
                    max_idle_seconds=0.05,
                ),
            )
            runner.work_dir = work_dir

            with (
                contextlib.redirect_stdout(io.StringIO()),
                mock.patch.object(
                    runner,
                    "_build_pi_command",
                    return_value=[
                        sys.executable,
                        "-c",
                        "import time; print('started', flush=True); time.sleep(5)",
                    ],
                ),
            ):
                result = runner._run_pi_attempt("build it", "PI_EVENTS.JSONL")

            self.assertTrue(result["timed_out"])
            self.assertEqual(
                result["termination"]["reason"],
                "inactivity_limit",
            )


class PiWiggumTests(unittest.TestCase):
    def test_reasoning_usage_survives_multiple_attempts(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            prompt = work_dir / "office_prompt_wiggum.md"
            prompt.write_text("build it", encoding="utf-8")
            runner = PiWiggumRunner(
                "pi-wiggum", "test-model", prompt,
                headless=True, non_local=True,
            )
            runner.work_dir = work_dir
            with (
                contextlib.redirect_stdout(io.StringIO()),
                mock.patch.object(runner, "_run_pi_attempt", side_effect=[
                    {"output_tokens": 10, "reasoning_tokens": 7},
                    {"output_tokens": 20, "reasoning_tokens": 11},
                ]),
                mock.patch.object(runner, "_run_wiggum_checkers", side_effect=[
                    {"passed": False}, {"passed": True},
                ]),
                mock.patch.object(runner, "_build_repair_prompt", return_value="repair"),
            ):
                runner._execute_wiggum_loop()
            metrics = load_run_metrics(work_dir)
            self.assertEqual(metrics.reasoning_tokens, 18)
            self.assertEqual(metrics.output_tokens, 30)
            self.assertEqual(metrics.wiggum_attempts, 2)

    def test_zero_artifact_repair_prompt_forces_small_immediate_writes(self):
        runner = PiWiggumRunner(
            "pi-wiggum",
            "test-model",
            Path("office_prompt_wiggum.md"),
            headless=True,
            non_local=True,
        )
        missing = runner._wiggum_required_files()
        summary = {
            "passed": False,
            "missing_files": missing,
            "static": {"returncode": 0, "output": ""},
            "runtime": {"returncode": 1, "output": ""},
            "logic_test": {"returncode": 1, "output": ""},
            "static_errors": [],
            "console_errors": [],
            "page_errors": [],
            "loaded": False,
            "nonblank_canvas": False,
            "animation_frames": 0,
            "scene_object_count": 0,
            "dynamic_changes": 0,
        }

        prompt = runner._build_repair_prompt(summary, 1)

        self.assertIn("zero-artifact bootstrap attempt", prompt)
        self.assertIn("one file per tool call", prompt)
        self.assertIn("Do not read the original prompt", prompt)

    def test_checker_run_discards_stale_result_files(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            prompt_path = work_dir / "elevator_prompt_wiggum.txt"
            prompt_path.write_text("build it", encoding="utf-8")
            runner = PiWiggumRunner(
                "pi-wiggum",
                "test-model",
                prompt_path,
                headless=True,
                non_local=True,
            )
            runner.work_dir = work_dir
            for filename in ("static_check.json", "runtime_check.json"):
                (work_dir / filename).write_text("{\"stale\": true}", encoding="utf-8")

            with (
                mock.patch.object(
                    runner,
                    "_run_checker",
                    return_value={"returncode": 1, "output": "failed"},
                ),
                mock.patch.object(runner, "_append_checker_summary_to_chat"),
            ):
                runner._run_wiggum_checkers()

            self.assertFalse((work_dir / "static_check.json").exists())
            self.assertFalse((work_dir / "runtime_check.json").exists())

    def test_attempt_uses_configured_wall_limit_instead_of_900_seconds(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            prompt_path = work_dir / "elevator_prompt_wiggum.txt"
            prompt_path.write_text("build it", encoding="utf-8")
            runner = PiWiggumRunner(
                "pi-wiggum",
                "test-model",
                prompt_path,
                headless=True,
                non_local=True,
            )
            runner.work_dir = work_dir
            attempt_result = {
                "input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
                "cache_read_tokens": 0,
                "cache_write_tokens": 0,
                "cost_usd": 0.0,
                "num_turns": 0,
                "returncode": 0,
            }

            with (
                contextlib.redirect_stdout(io.StringIO()),
                mock.patch.object(
                    runner,
                    "_run_pi_attempt",
                    return_value=attempt_result,
                ) as run_attempt,
                mock.patch.object(
                    runner,
                    "_run_wiggum_checkers",
                    return_value={"passed": True},
                ),
            ):
                runner._execute_wiggum_loop()

            self.assertEqual(
                round(run_attempt.call_args.kwargs["timeout_seconds"]),
                round(DEFAULT_MAX_SECONDS),
            )

    def test_local_ten_hour_limit_governs_entire_wiggum_loop(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            prompt_path = work_dir / "office_prompt_wiggum.txt"
            prompt_path.write_text("build it", encoding="utf-8")
            runner = PiWiggumRunner(
                "pi-wiggum",
                "test-model",
                prompt_path,
                headless=True,
                non_local=False,
                safety_limits=RunSafetyLimits(max_seconds=10 * 60 * 60),
            )
            runner.work_dir = work_dir
            attempt_result = {
                "input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
                "cache_read_tokens": 0,
                "cache_write_tokens": 0,
                "cost_usd": 0.0,
                "num_turns": 0,
                "returncode": 0,
            }

            with (
                contextlib.redirect_stdout(io.StringIO()),
                mock.patch.object(
                    runner,
                    "_run_pi_attempt",
                    return_value=attempt_result,
                ) as run_attempt,
                mock.patch.object(
                    runner,
                    "_run_wiggum_checkers",
                    return_value={"passed": True},
                ),
            ):
                runner._execute_wiggum_loop()

            self.assertEqual(
                round(run_attempt.call_args.kwargs["timeout_seconds"]),
                10 * 60 * 60,
            )

    def test_disabled_wall_limit_is_forwarded_to_wiggum_attempt(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            prompt_path = work_dir / "elevator_prompt_wiggum.txt"
            prompt_path.write_text("build it", encoding="utf-8")
            runner = PiWiggumRunner(
                "pi-wiggum",
                "test-model",
                prompt_path,
                headless=True,
                non_local=False,
                safety_limits=RunSafetyLimits(max_seconds=0),
            )
            runner.work_dir = work_dir
            attempt_result = {
                "input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
                "cache_read_tokens": 0,
                "cache_write_tokens": 0,
                "cost_usd": 0.0,
                "num_turns": 0,
                "returncode": 0,
            }

            with (
                contextlib.redirect_stdout(io.StringIO()),
                mock.patch.object(
                    runner,
                    "_run_pi_attempt",
                    return_value=attempt_result,
                ) as run_attempt,
                mock.patch.object(
                    runner,
                    "_run_wiggum_checkers",
                    return_value={"passed": True},
                ),
            ):
                runner._execute_wiggum_loop()

            self.assertIsNone(
                run_attempt.call_args.kwargs["timeout_seconds"]
            )


if __name__ == "__main__":
    unittest.main()

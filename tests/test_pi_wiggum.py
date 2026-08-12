import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from run_safety import DEFAULT_MAX_SECONDS, RunSafetyLimits
from runners import PiRunner, PiWiggumRunner


class PiRunnerTests(unittest.TestCase):
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
                run_attempt.call_args.kwargs["timeout_seconds"],
                DEFAULT_MAX_SECONDS,
            )


if __name__ == "__main__":
    unittest.main()

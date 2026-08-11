import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from evaluation_core import ProcessResult
from evaluation_metrics import OPENCODE_RESULT_FILENAME
from run_safety import RunSafetyTermination
from runners import OpenCodeRunner


CYCLE_FIXTURE = (
    Path(__file__).parent
    / "fixtures"
    / "doom_loops"
    / "opencode_solar_cycle.jsonl"
)


class OpenCodeRunnerTests(unittest.TestCase):
    def test_runner_stops_repeating_tool_cycle_and_persists_evidence(self):
        events = CYCLE_FIXTURE.read_text(encoding="utf-8").splitlines()

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            work_dir = root / "eval"
            work_dir.mkdir()
            prompt_path = root / "prompt.txt"
            prompt_path.write_text("Build an elevator", encoding="utf-8")
            (work_dir / "elevator.js").write_text("// partial", encoding="utf-8")
            runner = OpenCodeRunner(
                "opencode",
                "solar-pro4",
                prompt_path,
                headless=True,
                non_local=True,
                custom_provider="upstage",
            )
            runner.work_dir = work_dir

            def fake_stream(**kwargs):
                with open(kwargs["chat_log_path"], "w", encoding="utf-8") as log:
                    kwargs["on_stderr_line"](
                        "INFO service=default version=1.2.3\n", log
                    )
                    kwargs["on_stderr_line"](
                        "INFO service=llm providerID=upstage "
                        "modelID=solar-pro4 small=false\n",
                        log,
                    )
                    try:
                        for line in events * 12:
                            kwargs["on_line"](line + "\n", log)
                    except RunSafetyTermination as exc:
                        log.write(f"\n[TERMINATED] {exc.termination.message}\n")
                        return ProcessResult(
                            returncode=-9,
                            termination=exc.termination,
                        )
                self.fail("The repeated cycle did not trigger the guardrail")

            with (
                mock.patch(
                    "runners.opencode.run_streaming_process",
                    side_effect=fake_stream,
                ),
                contextlib.redirect_stdout(io.StringIO()),
                contextlib.redirect_stderr(io.StringIO()),
            ):
                runner.execute_agent()

            result = json.loads(
                (work_dir / OPENCODE_RESULT_FILENAME).read_text(encoding="utf-8")
            )
            self.assertEqual(result["terminal_reason"], "doom_loop")
            self.assertEqual(result["termination"]["evidence"]["cycle_length"], 2)
            self.assertEqual(result["tool_calls"], 24)
            self.assertTrue(result["is_error"])
            self.assertIn("elevator.js", result["artifacts_produced"])
            self.assertNotIn("no tool calls", " ".join(result["warnings"]).lower())


if __name__ == "__main__":
    unittest.main()

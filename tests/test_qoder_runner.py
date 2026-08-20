import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from evaluation_metrics import QODER_EVENTS_FILENAME, QODER_RESULT_FILENAME
from runners import QoderRunner


FIXTURE_PATH = (
    Path(__file__).parent / "fixtures" / "runner_events" / "qoder_stream.jsonl"
)


class FakeQoderProcess:
    def __init__(self, lines=None, returncode=0):
        if lines is None:
            lines = FIXTURE_PATH.read_text(encoding="utf-8").splitlines()
        self.stdout = [f"{line}\n" for line in lines]
        self.stdin = object()
        self.returncode = returncode
        self.finished = False

    def poll(self):
        return self.returncode if self.finished else None

    def wait(self, timeout=None):
        self.finished = True
        return self.returncode

    def kill(self):
        self.returncode = -9
        self.finished = True


class QoderRunnerTests(unittest.TestCase):
    def test_runner_preserves_events_and_writes_normalized_result(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            prompt_path = work_dir / "prompt.txt"
            prompt_path.write_text("Build it", encoding="utf-8")
            runner = QoderRunner(
                "qoder",
                "Qwen3.8-Max-Preview",
                prompt_path,
                headless=True,
                non_local=True,
            )
            runner.work_dir = work_dir

            with (
                mock.patch(
                    "evaluation_core.subprocess.Popen",
                    return_value=FakeQoderProcess(),
                ) as popen,
                mock.patch("evaluation_core.send_stdin"),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                runner.execute_agent()

            command = popen.call_args.args[0]
            self.assertEqual(command[0], "qodercli")
            self.assertIn("--no-session-persistence", command)

            events = (work_dir / QODER_EVENTS_FILENAME).read_text(encoding="utf-8")
            self.assertEqual(len(events.splitlines()), 5)

            result = json.loads(
                (work_dir / QODER_RESULT_FILENAME).read_text(encoding="utf-8")
            )
            self.assertEqual(result["input_tokens"], 6)
            self.assertEqual(result["output_tokens"], 3)
            self.assertTrue(result["token_counts_estimated"])
            self.assertFalse(result["cost_available"])
            self.assertEqual(result["qodercli_version"], "1.1.5")

    def test_runner_preserves_failed_exit_when_result_event_is_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            prompt_path = work_dir / "prompt.txt"
            prompt_path.write_text("Build it", encoding="utf-8")
            runner = QoderRunner(
                "qoder",
                "Qwen3.8-Max-Preview",
                prompt_path,
                headless=True,
                non_local=True,
            )
            runner.work_dir = work_dir
            lines = FIXTURE_PATH.read_text(encoding="utf-8").splitlines()[:-1]

            with (
                mock.patch(
                    "evaluation_core.subprocess.Popen",
                    return_value=FakeQoderProcess(lines=lines, returncode=2),
                ),
                mock.patch("evaluation_core.send_stdin"),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                runner.execute_agent()

            result = json.loads(
                (work_dir / QODER_RESULT_FILENAME).read_text(encoding="utf-8")
            )
            self.assertEqual(result["subtype"], "error_during_execution")
            self.assertTrue(result["is_error"])
            self.assertEqual(result["errors"], ["Exit code 2"])


if __name__ == "__main__":
    unittest.main()

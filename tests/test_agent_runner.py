import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from evaluate_agent import AgentRunner


class RecordingRunner(AgentRunner):
    def __init__(self, work_dir: Path, fail_execution: bool = False):
        super().__init__(
            "test-agent",
            "test-model",
            Path("test_prompt.txt"),
            headless=True,
            non_local=True,
        )
        self.work_dir = work_dir
        self.fail_execution = fail_execution
        self.events = []

    def setup_workspace(self):
        self.events.append("setup")

    def configure_agent(self):
        self.events.append("configure")

    def start_server_logger(self):
        self.events.append("start_logger")

    def execute_agent(self):
        self.events.append("execute")
        if self.fail_execution:
            raise RuntimeError("runner failed")

    def stop_server_logger(self):
        self.events.append("stop_logger")

    def _execute_generated_python_artifacts(self):
        self.events.append("execute_artifacts")

    def _generate_report(self, duration_seconds: float) -> Path:
        self.events.append("generate_report")
        return self.work_dir / "summary.html"

    def _open_report(self, report_path: Path):
        self.events.append("open_report")


class AgentRunnerLifecycleTests(unittest.TestCase):
    def test_run_keeps_orchestration_steps_in_order(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            runner = RecordingRunner(Path(temp_dir))

            with contextlib.redirect_stdout(io.StringIO()):
                runner.run()

            self.assertEqual(
                runner.events,
                [
                    "setup",
                    "configure",
                    "start_logger",
                    "execute",
                    "stop_logger",
                    "execute_artifacts",
                    "generate_report",
                    "open_report",
                ],
            )

    def test_run_stops_logger_when_execution_fails(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            runner = RecordingRunner(Path(temp_dir), fail_execution=True)

            with contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaisesRegex(RuntimeError, "runner failed"):
                    runner.run()

            self.assertEqual(
                runner.events,
                [
                    "setup",
                    "configure",
                    "start_logger",
                    "execute",
                    "stop_logger",
                ],
            )


if __name__ == "__main__":
    unittest.main()

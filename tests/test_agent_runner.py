import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from evaluate_agent import AGENT_RUNNERS, AgentRunner


class RecordingRunner(AgentRunner):
    def __init__(
        self,
        work_dir: Path,
        fail_execution: bool = False,
        headless: bool = True,
        execute_generated_python: bool = False,
    ):
        super().__init__(
            "test-agent",
            "test-model",
            Path("test_prompt.txt"),
            headless=headless,
            non_local=True,
            execute_generated_python=execute_generated_python,
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
    def test_each_adapter_lives_in_the_runners_package(self):
        expected_modules = {
            "claude": "runners.claude",
            "codex": "runners.codex",
            "crush": "runners.crush",
            "dsh": "runners.dsh",
            "gemini": "runners.gemini",
            "opencode": "runners.opencode",
            "pi": "runners.pi",
            "pi-wiggum": "runners.pi_wiggum",
            "qoder": "runners.qoder",
            "vibe": "runners.vibe",
        }

        for agent, module_name in expected_modules.items():
            with self.subTest(agent=agent):
                self.assertEqual(AGENT_RUNNERS[agent].__module__, module_name)

    def test_qoder_uses_cli_executable_without_changing_workspace_prefix(self):
        runner = AGENT_RUNNERS["qoder"](
            "qoder",
            "test-model",
            Path("test_prompt.txt"),
            headless=True,
            non_local=True,
        )

        self.assertEqual(runner.agent_binary, "qodercli")
        self.assertEqual(
            runner.work_dir.name,
            "qoder_test-model_test_prompt",
        )

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
                    "generate_report",
                ],
            )

    def test_optional_post_processing_requires_explicit_flags(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            runner = RecordingRunner(
                Path(temp_dir),
                headless=False,
                execute_generated_python=True,
            )

            with contextlib.redirect_stdout(io.StringIO()):
                runner.run()

            self.assertEqual(
                runner.events[-3:],
                ["execute_artifacts", "generate_report", "open_report"],
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

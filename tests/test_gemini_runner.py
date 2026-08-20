import tempfile
import unittest
from pathlib import Path
from unittest import mock

from evaluate_agent import (
    CHAT_SESSION_FILENAME,
    GEMINI_RESULT_FILENAME,
    GeminiRunner,
)
from evaluation_core import ProcessResult


class GeminiRunnerTests(unittest.TestCase):
    def make_runner(self, work_dir: Path) -> GeminiRunner:
        runner = GeminiRunner(
            "agy",
            "gemini-test",
            Path("test_prompt.txt"),
            headless=True,
            non_local=True,
        )
        runner.work_dir = work_dir
        return runner

    def test_command_creates_project_for_evaluation_workspace(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            runner = self.make_runner(work_dir)

            command = runner._build_agy_command("/usr/bin/agy", "build it")

            self.assertEqual(command[0], "/usr/bin/agy")
            self.assertIn("--new-project", command)
            add_dir_index = command.index("--add-dir")
            self.assertEqual(command[add_dir_index + 1], str(work_dir.resolve()))
            self.assertEqual(command[command.index("--print") + 1], "build it")
            self.assertEqual(
                command[command.index("--model") + 1],
                "gemini-test",
            )
            self.assertNotIn("--effort", command)

    def test_gemini_slug_uses_agy_effort_qualified_model_name(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            runner = self.make_runner(Path(temp_dir))
            runner.model_name = "gemini-3.7-flash"

            command = runner._build_agy_command("agy", "build it")

            self.assertEqual(
                command[command.index("--model") + 1],
                "Gemini 3.7 Flash (High)",
            )
            self.assertNotIn("--effort", command)

    def test_gemini_model_name_can_select_a_non_default_effort(self):
        model_names = {
            "gemini-3.7-flash-medium": "Gemini 3.7 Flash (Medium)",
            "Gemini 3.7 Flash (Low)": "Gemini 3.7 Flash (Low)",
            "Gemini 3_7 Flash High": "Gemini 3.7 Flash (High)",
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            runner = self.make_runner(Path(temp_dir))
            for model_name, expected in model_names.items():
                with self.subTest(model_name=model_name):
                    runner.model_name = model_name
                    command = runner._build_agy_command("agy", "build it")
                    self.assertEqual(
                        command[command.index("--model") + 1], expected
                    )
                    self.assertNotIn("--effort", command)

    def test_base_runner_stores_custom_provider(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            runner = GeminiRunner(
                "agy",
                "gemini-test",
                Path("test_prompt.txt"),
                headless=True,
                non_local=True,
                custom_provider="google",
            )
            runner.work_dir = work_dir

            self.assertTrue(runner.supports_custom_provider)
            self.assertEqual(runner.custom_provider, "google")

    def test_generated_artifacts_ignore_runner_bookkeeping(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            runner = self.make_runner(work_dir)
            (work_dir / CHAT_SESSION_FILENAME).write_text("", encoding="utf-8")
            (work_dir / GEMINI_RESULT_FILENAME).write_text("{}", encoding="utf-8")

            self.assertEqual(runner._generated_artifacts(), [])

            (work_dir / "index.html").write_text("<canvas></canvas>", encoding="utf-8")
            self.assertEqual(runner._generated_artifacts(), ["index.html"])

    def test_clean_exit_without_artifacts_logs_only_failure(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            runner = self.make_runner(work_dir)

            with (
                mock.patch("runners.gemini.read_prompt_file", return_value="Build it"),
                mock.patch("runners.gemini.shutil.which", return_value="agy"),
                mock.patch(
                    "runners.gemini.run_streaming_process",
                    return_value=ProcessResult(returncode=0),
                ),
                mock.patch.object(
                    runner,
                    "_get_agy_transcript_stats",
                    return_value={
                        "input_tokens": 0,
                        "output_tokens": 0,
                        "total_tokens": 0,
                        "cached": 0,
                        "tool_calls": 0,
                        "num_turns": 0,
                    },
                ),
                mock.patch(
                    "runners.gemini.subprocess.check_output",
                    return_value="1.0",
                ),
            ):
                runner.execute_agent()

            transcript = (work_dir / CHAT_SESSION_FILENAME).read_text(encoding="utf-8")
            self.assertIn(
                "[ERROR] AGY exited cleanly but produced no root-level artifacts",
                transcript,
            )
            self.assertNotIn("[SUCCESS]", transcript)


if __name__ == "__main__":
    unittest.main()

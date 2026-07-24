import tempfile
import unittest
from pathlib import Path

from evaluate_agent import (
    CHAT_SESSION_FILENAME,
    GEMINI_RESULT_FILENAME,
    GeminiRunner,
)


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

    def test_generated_artifacts_ignore_runner_bookkeeping(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            runner = self.make_runner(work_dir)
            (work_dir / CHAT_SESSION_FILENAME).write_text("", encoding="utf-8")
            (work_dir / GEMINI_RESULT_FILENAME).write_text("{}", encoding="utf-8")

            self.assertEqual(runner._generated_artifacts(), [])

            (work_dir / "index.html").write_text("<canvas></canvas>", encoding="utf-8")
            self.assertEqual(runner._generated_artifacts(), ["index.html"])


if __name__ == "__main__":
    unittest.main()

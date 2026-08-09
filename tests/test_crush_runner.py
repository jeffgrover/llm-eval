import json
import sys
import tempfile
import unittest
from pathlib import Path

from evaluation_core import LLAMA_SERVER_PROVIDER, LM_STUDIO_PROVIDER
from runners import CrushRunner


class CrushRunnerTests(unittest.TestCase):
    def make_runner(self, root: Path, provider=LM_STUDIO_PROVIDER) -> CrushRunner:
        prompt_path = root / "prompt.txt"
        prompt_path.write_text("build it", encoding="utf-8")
        runner = CrushRunner(
            "crush",
            "org/test-model",
            prompt_path,
            headless=True,
            local_provider=provider,
        )
        runner.work_dir = root
        runner.local_context_limit = 24576
        return runner

    def test_local_config_selects_requested_model_and_allows_tools(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            runner = self.make_runner(Path(temp_dir))

            runner.configure_agent()

            config = json.loads(
                (runner.work_dir / "crush.json").read_text(encoding="utf-8")
            )
            self.assertEqual(
                config["models"]["large"],
                {"provider": "lmstudio", "model": "org/test-model"},
            )
            model = config["providers"]["lmstudio"]["models"][0]
            self.assertEqual(model["context_window"], 24576)
            self.assertEqual(model["id"], "org/test-model")
            self.assertIn("write", config["permissions"]["allowed_tools"])
            self.assertTrue(config["options"]["disable_default_providers"])

    def test_llama_server_uses_crush_llamacpp_provider_type(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            runner = self.make_runner(Path(temp_dir), LLAMA_SERVER_PROVIDER)

            runner.configure_agent()

            config = json.loads(
                (runner.work_dir / "crush.json").read_text(encoding="utf-8")
            )
            self.assertEqual(
                config["providers"]["llama-server"]["type"], "llamacpp"
            )
            self.assertEqual(
                runner._model_ref(), "llama-server/org/test-model"
            )

    def test_non_local_model_reference_is_passed_through(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            prompt_path = Path(temp_dir) / "prompt.txt"
            prompt_path.write_text("build it", encoding="utf-8")
            runner = CrushRunner(
                "crush",
                "openrouter/model-name",
                prompt_path,
                headless=True,
                non_local=True,
            )

            self.assertEqual(runner._model_ref(), "openrouter/model-name")

    def test_windows_uses_an_executable_or_npm_shim(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            runner = self.make_runner(Path(temp_dir))

            if sys.platform == "win32":
                self.assertIn(
                    Path(runner.agent_binary).name.lower(),
                    ("crush.exe", "crush.cmd"),
                )
            else:
                self.assertEqual(runner.agent_binary, "crush")


if __name__ == "__main__":
    unittest.main()

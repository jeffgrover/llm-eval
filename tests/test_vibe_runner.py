import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from evaluation_core import ProcessResult
from runners import VibeRunner


MODEL = "mistralai/mistral-large-4-0"
MODEL_CONFIG = (
    '[[models]]\n'
    f'name = "{MODEL}"\n'
    'provider = "openrouter"\n'
    'alias = "large-4-openrouter"\n'
)


class VibeRunnerTests(unittest.TestCase):
    def make_runner(self, root):
        prompt_path = root / "prompt.txt"
        prompt_path.write_text("build it", encoding="utf-8")
        runner = VibeRunner(
            "vibe", MODEL, prompt_path, headless=True, non_local=True,
            custom_provider="openrouter", restore_agent_config=True,
        )
        runner.work_dir = root
        return runner

    def test_cloud_provider_selects_model_and_restores_after_failure(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / ".vibe" / "config.toml"
            config_path.parent.mkdir()
            original = 'active_model = "original"\n' + MODEL_CONFIG
            config_path.write_text(original, encoding="utf-8")
            runner = self.make_runner(root)

            with (
                mock.patch("runners.vibe.Path.home", return_value=root),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                with self.assertRaisesRegex(RuntimeError, "agent failed"):
                    with runner.agent_configuration():
                        self.assertIn(
                            'active_model = "large-4-openrouter"',
                            config_path.read_text(encoding="utf-8"),
                        )
                        raise RuntimeError("agent failed")

            self.assertEqual(config_path.read_text(encoding="utf-8"), original)

    def test_explicit_cloud_provider_rejects_missing_configuration(self):
        for config in (None, 'active_model = "original"\n', MODEL_CONFIG,
                       'active_model = "original"\n' + MODEL_CONFIG.replace(
                           'provider = "openrouter"', 'provider = "other"')):
            with self.subTest(config=config), tempfile.TemporaryDirectory() as temp_dir:
                root = Path(temp_dir)
                config_path = root / ".vibe" / "config.toml"
                config_path.parent.mkdir()
                if config is not None:
                    config_path.write_text(config, encoding="utf-8")
                runner = self.make_runner(root)

                with mock.patch("runners.vibe.Path.home", return_value=root):
                    with self.assertRaises(ValueError):
                        runner.configure_agent()

                if config is not None:
                    self.assertEqual(config_path.read_text(encoding="utf-8"), config)
                else:
                    self.assertFalse(config_path.exists())

    def test_cloud_without_provider_preserves_existing_selection(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            runner = self.make_runner(Path(temp_dir))
            runner.custom_provider = None
            with mock.patch("runners.vibe.Path.home") as home:
                runner.configure_agent()
            home.assert_not_called()

    def test_cloud_result_preserves_provider_and_namespaced_model_id(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            runner = self.make_runner(root)
            with (
                mock.patch("runners.vibe.run_streaming_process", return_value=ProcessResult(0)),
                mock.patch("runners.vibe.subprocess.check_output", return_value="vibe 2.26.1"),
                mock.patch.object(runner, "_get_vibe_session_token_usage", return_value={
                    "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0,
                }),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                runner.execute_agent()

            result = json.loads((root / "VIBE_RESULT.JSON").read_text(encoding="utf-8"))
            self.assertEqual(result["provider"], "openrouter")
            self.assertEqual(result["model_id"], MODEL)
            self.assertEqual(runner.get_model_extra_info()["Provider"], "openrouter")

    def test_streaming_blocks_are_printed_logged_and_counted(self):
        fixture = Path(__file__).parent / "fixtures/runner_events/vibe_stream.jsonl"
        stream = fixture.read_text(encoding="utf-8")

        def emit_stream(**kwargs):
            with kwargs["chat_log_path"].open("w", encoding="utf-8") as log:
                for line in stream.splitlines(keepends=True):
                    kwargs["on_line"](line, log)
            return ProcessResult(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            runner = self.make_runner(root)
            stdout = io.StringIO()
            with (
                mock.patch("runners.vibe.run_streaming_process", side_effect=emit_stream),
                mock.patch("runners.vibe.subprocess.check_output", return_value="vibe 2.26.1"),
                mock.patch.object(runner, "_get_vibe_session_token_usage", return_value={
                    "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0,
                }),
                contextlib.redirect_stdout(stdout),
            ):
                runner.execute_agent()

            self.assertIn("Creating the scene.\n\nThen adding people.", stdout.getvalue())
            self.assertNotIn("hidden", stdout.getvalue())
            self.assertEqual((root / "CHAT_SESSION.TXT").read_text(encoding="utf-8"), stream)
            result = json.loads((root / "VIBE_RESULT.JSON").read_text(encoding="utf-8"))
            self.assertEqual(result["num_turns"], 3)
            self.assertEqual(result["status"], "success")


if __name__ == "__main__":
    unittest.main()

import contextlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from runners import PiRunner, VibeRunner


class AgentConfigRestorationTests(unittest.TestCase):
    def test_vibe_active_model_is_restored_after_failure(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            home = Path(temp_dir)
            config_path = home / ".vibe" / "config.toml"
            config_path.parent.mkdir(parents=True)
            config_path.write_text(
                'active_model = "original"\n'
                "\n"
                "[[models]]\n"
                'name = "target-model"\n'
                'provider = "test-provider"\n'
                'alias = "target"\n',
                encoding="utf-8",
            )
            runner = VibeRunner(
                "vibe",
                "target-model",
                Path("prompt.txt"),
                headless=True,
                non_local=False,
                restore_agent_config=True,
                custom_provider="test-provider",
            )

            with (
                mock.patch("runners.vibe.Path.home", return_value=home),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                with self.assertRaisesRegex(RuntimeError, "agent failed"):
                    with runner.agent_configuration():
                        self.assertIn(
                            'active_model = "target"',
                            config_path.read_text(encoding="utf-8"),
                        )
                        raise RuntimeError("agent failed")

            self.assertIn(
                'active_model = "original"',
                config_path.read_text(encoding="utf-8"),
            )

    def test_pi_models_file_is_restored_after_failure(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            home = Path(temp_dir)
            models_path = home / ".pi" / "agent" / "models.json"
            models_path.parent.mkdir(parents=True)
            original = '{"providers":{"existing":{}}}\n'
            models_path.write_text(original, encoding="utf-8")
            runner = PiRunner(
                "pi",
                "target-model",
                Path("prompt.txt"),
                headless=True,
                non_local=False,
            )

            with (
                mock.patch("runners.pi.Path.home", return_value=home),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                with self.assertRaisesRegex(RuntimeError, "agent failed"):
                    with runner.agent_configuration():
                        self.assertNotEqual(
                            models_path.read_text(encoding="utf-8"),
                            original,
                        )
                        raise RuntimeError("agent failed")

            self.assertEqual(models_path.read_text(encoding="utf-8"), original)

    def test_pi_removes_temporary_models_file_when_none_existed(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            home = Path(temp_dir)
            models_path = home / ".pi" / "agent" / "models.json"
            runner = PiRunner(
                "pi",
                "target-model",
                Path("prompt.txt"),
                headless=True,
                non_local=False,
            )

            with (
                mock.patch("runners.pi.Path.home", return_value=home),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                with runner.agent_configuration():
                    self.assertTrue(models_path.exists())

            self.assertFalse(models_path.exists())


if __name__ == "__main__":
    unittest.main()

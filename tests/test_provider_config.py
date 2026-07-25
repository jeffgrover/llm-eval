import contextlib
import io
import json
import tempfile
import unittest
from dataclasses import FrozenInstanceError
from pathlib import Path

from evaluation_core import (
    AgentRunner,
    LLAMA_SERVER_PROVIDER,
    LM_STUDIO_PROVIDER,
    OMLX_PROVIDER,
    get_local_provider,
)
from runners import OpenCodeRunner


class LocalProviderConfigTests(unittest.TestCase):
    def test_provider_selection_returns_immutable_configs(self):
        self.assertIs(get_local_provider(None), LM_STUDIO_PROVIDER)
        self.assertIs(get_local_provider("llama-server"), LLAMA_SERVER_PROVIDER)
        self.assertIs(get_local_provider(" OMLX "), OMLX_PROVIDER)

        with self.assertRaises(FrozenInstanceError):
            OMLX_PROVIDER.api_url = "http://changed.invalid"

    def test_runner_environment_uses_injected_provider(self):
        runner = AgentRunner(
            "test",
            "model",
            Path("prompt.txt"),
            headless=True,
            non_local=False,
            local_provider=OMLX_PROVIDER,
        )

        env = runner.get_env_vars()

        self.assertEqual(env["OPENAI_API_BASE"], OMLX_PROVIDER.api_url)
        self.assertEqual(env["OPENAI_BASE_URL"], OMLX_PROVIDER.api_url)
        self.assertEqual(env["OPENAI_API_KEY"], OMLX_PROVIDER.api_key)
        self.assertFalse(runner.lms_cli_available)

    def test_opencode_config_uses_injected_provider(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            runner = OpenCodeRunner(
                "opencode",
                "test-model",
                Path("prompt.txt"),
                headless=True,
                non_local=False,
                custom_provider="llama-server",
                local_provider=LLAMA_SERVER_PROVIDER,
            )
            runner.work_dir = Path(temp_dir)

            with contextlib.redirect_stdout(io.StringIO()):
                runner.configure_agent()

            config = json.loads(
                (runner.work_dir / "opencode.json").read_text(encoding="utf-8")
            )
            provider = config["provider"]["llama-server"]
            self.assertEqual(
                provider["options"]["baseURL"],
                LLAMA_SERVER_PROVIDER.api_url,
            )
            self.assertEqual(provider["name"], LLAMA_SERVER_PROVIDER.display_name)


if __name__ == "__main__":
    unittest.main()

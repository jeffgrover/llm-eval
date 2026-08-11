import contextlib
import io
import json
import tempfile
import unittest
from unittest.mock import MagicMock, patch
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
    def test_opencode_parses_current_log_metadata(self):
        version, provider, model = OpenCodeRunner._parse_log_metadata(
            "message=created id=session version=1.18.10 projectID=project"
        )
        self.assertEqual(version, "1.18.10")
        self.assertIsNone(provider)
        self.assertIsNone(model)

        version, provider, model = OpenCodeRunner._parse_log_metadata(
            "message=stream providerID=openrouter modelID=upstage/solar-pro4 "
            "session.id=session small=false agent=build"
        )
        self.assertIsNone(version)
        self.assertEqual(provider, "openrouter")
        self.assertEqual(model, "upstage/solar-pro4")

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
            self.assertTrue(config["agent"]["title"]["disable"])
            self.assertEqual(
                provider["options"]["baseURL"],
                LLAMA_SERVER_PROVIDER.api_url,
            )
            self.assertEqual(provider["name"], LLAMA_SERVER_PROVIDER.display_name)

    def test_opencode_uses_explicit_lm_studio_context_limit(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            runner = OpenCodeRunner(
                "opencode",
                "deepseek-v4",
                Path("prompt.txt"),
                headless=True,
                non_local=False,
                local_provider=LM_STUDIO_PROVIDER,
            )
            runner.local_context_limit = 16384
            runner.work_dir = Path(temp_dir)

            with contextlib.redirect_stdout(io.StringIO()):
                runner.configure_agent()

            config = json.loads(
                (runner.work_dir / "opencode.json").read_text(encoding="utf-8")
            )
            self.assertEqual(
                config["provider"]["lmstudio"]["models"]["deepseek-v4"]["limit"]["context"],
                16384,
            )

    @patch("runners.opencode.urllib.request.urlopen")
    def test_opencode_discovers_models_from_local_endpoint(self, urlopen):
        response = MagicMock()
        response.__enter__.return_value = response
        response.__exit__.return_value = False
        response.read.return_value = json.dumps(
            {"data": [{"id": "deepseek-v4"}, {"id": "another-model"}]}
        ).encode("utf-8")
        urlopen.return_value = response

        with tempfile.TemporaryDirectory() as temp_dir:
            runner = OpenCodeRunner(
                "opencode",
                "deepseek-v4",
                Path("prompt.txt"),
                headless=True,
                non_local=False,
                local_provider=LM_STUDIO_PROVIDER,
            )
            runner.work_dir = Path(temp_dir)

            with contextlib.redirect_stdout(io.StringIO()):
                runner.configure_agent()

            config = json.loads(
                (runner.work_dir / "opencode.json").read_text(encoding="utf-8")
            )
            self.assertEqual(
                set(config["provider"]["lmstudio"]["models"]),
                {"deepseek-v4", "another-model"},
            )
            request = urlopen.call_args.args[0]
            self.assertEqual(request.full_url, "http://localhost:1234/v1/models")


if __name__ == "__main__":
    unittest.main()

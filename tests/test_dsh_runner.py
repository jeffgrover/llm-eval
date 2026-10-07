import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from evaluation_core import (
    LLAMA_SERVER_PROVIDER,
    LM_STUDIO_PROVIDER,
)
from evaluation_metrics import DSH_RESULT_FILENAME
from runners import DshRunner
from runners.dsh import DSH_PATCH_FILENAME, render_patch_yaml


class DshRunnerTests(unittest.TestCase):
    def _make_runner(self, work_dir: Path, **kwargs) -> DshRunner:
        prompt = work_dir / "prompt.txt"
        prompt.write_text("Build an elevator", encoding="utf-8")
        runner = DshRunner(
            "dsh",
            kwargs.pop("model", "deepseek-v4-pro-0813"),
            prompt,
            headless=True,
            **kwargs,
        )
        # Pin the evaluation workspace to the test's temp dir, mirroring the
        # other runner tests that bypass EVALS_DIR for isolation.
        runner.work_dir = work_dir
        runner.dsh_home = work_dir / ".dsh"
        return runner

    def test_runner_lives_in_runners_package(self):
        from evaluate_agent import AGENT_RUNNERS

        self.assertEqual(AGENT_RUNNERS["dsh"].__module__, "runners.dsh")

    def test_workspace_prefix_uses_dsh(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            prompt = Path(temp_dir) / "prompt.txt"
            prompt.write_text("Build an elevator", encoding="utf-8")
            runner = DshRunner(
                "dsh", "deepseek-v4-pro-0813", prompt, headless=True, non_local=True
            )
            self.assertEqual(runner.agent_binary, "dsh")
            self.assertEqual(
                runner.work_dir.name,
                "dsh_deepseek-v4-pro-0813_prompt",
            )

    def test_model_id_passes_through_with_provider_prefix(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            runner = self._make_runner(
                Path(temp_dir),
                model="deepseek/deepseek-v4-pro-0813",
                non_local=True,
            )
            self.assertEqual(runner._model_id(), "deepseek/deepseek-v4-pro-0813")

    def test_provider_route_prefers_custom_provider(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            runner = self._make_runner(
                Path(temp_dir), non_local=True, custom_provider="openrouter"
            )
            self.assertEqual(runner._provider_route(), "openrouter")

    def test_provider_route_defaults_local_to_provider_id(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            runner = self._make_runner(
                Path(temp_dir),
                non_local=False,
                local_provider=LLAMA_SERVER_PROVIDER,
            )
            self.assertEqual(runner._provider_route(), "llama-server")

    def test_patch_pins_acp_and_declares_openrouter_route(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            runner = self._make_runner(
                Path(temp_dir),
                non_local=True,
                custom_provider="openrouter",
            )
            runner.work_dir.mkdir(parents=True, exist_ok=True)
            overlay = runner._build_patch()
            self.assertTrue(overlay.exists())
            text = overlay.read_text(encoding="utf-8")
            self.assertIn("id: acp", text)
            self.assertIn("agent-default-model", text)
            self.assertIn("openrouter", text)
            # The openrouter route is registered with its credential ref.
            self.assertIn("llm-pi-ai", text)
            self.assertIn("apiKeyEnv: OPENROUTER_API_KEY", text)

    def test_local_run_declares_openai_compatible_route(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            runner = self._make_runner(
                Path(temp_dir),
                non_local=False,
                local_provider=LM_STUDIO_PROVIDER,
            )
            runner.work_dir.mkdir(parents=True, exist_ok=True)
            overlay = runner._build_patch()
            text = overlay.read_text(encoding="utf-8")
            self.assertIn("llm-pi-ai", text)
            self.assertIn("openai-completions", text)
            self.assertIn("DSH_EVAL_API_KEY", text)
            self.assertIn("http", text)

    def test_get_env_vars_isolates_dsh_home_and_export_key(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            runner = self._make_runner(
                Path(temp_dir), non_local=False, local_provider=LM_STUDIO_PROVIDER
            )
            env = runner.get_env_vars()
            self.assertIn("DSH_HOME", env)
            self.assertTrue(env["DSH_HOME"].endswith(".dsh"))
            self.assertEqual(env.get("DSH_EVAL_API_KEY"), "lm-studio")
            self.assertEqual(env.get("DSH_PERMISSION_MODE"), "danger-full-access")

    def test_render_patch_yaml_produces_valid_list_entry(self):
        yaml = render_patch_yaml(
            [
                {
                    "id": "acp",
                    "config": {"provider": "openrouter", "model": "m-x"},
                }
            ]
        )
        self.assertIn("- id: acp", yaml)
        self.assertIn("provider: openrouter", yaml)

    def _run_execute(self, runner, client_result):
        """Exercise execute_agent with a mocked ACP client."""
        result_json_path = runner.work_dir / DSH_RESULT_FILENAME

        fake_client = mock.MagicMock()
        fake_client.run.return_value = client_result
        fake_client.stderr_lines = []

        with (
            mock.patch.object(runner, "_build_patch") as build_patch,
            mock.patch(
                "runners.dsh.resolve_dsh_command", return_value=["dsh"]
            ),
            mock.patch(
                "runners.dsh._AcpClient", return_value=fake_client
            ) as client_cls,
            contextlib.redirect_stdout(io.StringIO()),
            contextlib.redirect_stderr(io.StringIO()),
        ):
            build_patch.return_value = runner.work_dir / DSH_PATCH_FILENAME
            runner.execute_agent()

        # The client was constructed with the ACP command and prompt piped in.
        self.assertTrue(client_cls.called)
        return json.loads(result_json_path.read_text(encoding="utf-8"))

    def test_execute_agent_writes_result_json_on_success(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            work_dir = root / "eval"
            work_dir.mkdir()
            runner = self._make_runner(work_dir, non_local=True)

            result = self._run_execute(
                runner, ("The elevator is done.", "end_turn", 3, None)
            )
            self.assertEqual(result["status"], "success")
            self.assertFalse(result["is_error"])
            self.assertEqual(result["model_id"], "deepseek-v4-pro-0813")
            self.assertEqual(result["tool_calls"], 3)
            self.assertEqual(result["stop_reason"], "end_turn")

    def test_execute_agent_records_error_message_as_error(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            work_dir = root / "eval"
            work_dir.mkdir()
            runner = self._make_runner(work_dir, non_local=True)

            result = self._run_execute(
                runner, ("", "error", 0, "turn failed: boom")
            )
            self.assertEqual(result["status"], "error")
            self.assertTrue(result["is_error"])
            self.assertIn("boom", result["error"])


if __name__ == "__main__":
    unittest.main()

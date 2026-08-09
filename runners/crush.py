"""Charmbracelet Crush CLI adapter."""

import json
import shutil
import subprocess
import sys
import tempfile
from typing import Dict, Optional

from evaluation_core import (
    AgentRunner,
    CHAT_SESSION_FILENAME,
    DEFAULT_LOCAL_CONTEXT_LIMIT,
    DEFAULT_LOCAL_OUTPUT_LIMIT,
    SERVER_LOG_FILENAME,
    get_env_int,
    read_prompt_file,
)
from evaluation_metrics import CRUSH_RESULT_FILENAME, CRUSH_SESSION_FILENAME
from runner_events import normalize_crush_session


class CrushRunner(AgentRunner):
    """Run Crush non-interactively and normalize its persisted session usage."""

    supports_custom_provider = True

    # Crush 0.87.0 exposes --yolo only as a root-command flag, so it is not
    # inherited by `crush run`. Explicitly allowing every current built-in tool
    # in the isolated evaluation config provides the intended unattended mode.
    ALLOWED_TOOLS = (
        "agent",
        "bash",
        "crush_info",
        "crush_logs",
        "job_output",
        "job_kill",
        "download",
        "edit",
        "multiedit",
        "lsp_diagnostics",
        "lsp_references",
        "lsp_restart",
        "lsp_symbols",
        "lsp_definition",
        "lsp_call_hierarchy",
        "lsp_rename",
        "lsp_replace_symbol",
        "fetch",
        "agentic_fetch",
        "glob",
        "grep",
        "ls",
        "question",
        "sourcegraph",
        "todos",
        "view",
        "write",
        "list_mcp_resources",
        "read_mcp_resource",
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if sys.platform == "win32":
            # Native/Scoop installs expose crush.exe; npm exposes crush.cmd.
            # Resolve an absolute path because CreateProcess does not perform
            # PowerShell's command-shim lookup when the evaluator uses Popen.
            self.agent_binary = (
                shutil.which("crush.exe")
                or shutil.which("crush.cmd")
                or "crush.cmd"
            )

    def _provider_id(self) -> str:
        return self.local_provider.provider_id

    def _provider_type(self) -> str:
        return {
            "llama-server": "llamacpp",
            "lmstudio": "lmstudio",
            "omlx": "omlx",
        }.get(self._provider_id(), "openai-compat")

    def _model_ref(self) -> str:
        if not self.non_local:
            return f"{self._provider_id()}/{self.model_name}"
        if self.custom_provider:
            if self.model_name.startswith(f"{self.custom_provider}/"):
                return self.model_name
            return f"{self.custom_provider}/{self.model_name}"
        return self.model_name

    def configure_agent(self) -> None:
        """Create a deterministic local-provider config for this run."""
        if self.non_local:
            return

        context_limit = getattr(self, "local_context_limit", None) or get_env_int(
            "LLM_EVAL_LOCAL_CONTEXT_LIMIT", DEFAULT_LOCAL_CONTEXT_LIMIT
        )
        output_limit = get_env_int(
            "LLM_EVAL_LOCAL_OUTPUT_LIMIT", DEFAULT_LOCAL_OUTPUT_LIMIT
        )
        provider_id = self._provider_id()
        selected_model = {"provider": provider_id, "model": self.model_name}
        config = {
            "$schema": "https://charm.land/crush.json",
            "models": {
                "large": selected_model,
                "small": selected_model,
            },
            "providers": {
                provider_id: {
                    "id": provider_id,
                    "name": self.local_provider.display_name,
                    "type": self._provider_type(),
                    "base_url": self.local_provider.api_url,
                    "api_key": self.local_provider.api_key,
                    "discover_models": False,
                    "models": [
                        {
                            "id": self.model_name,
                            "name": self.model_name,
                            "context_window": context_limit,
                            "default_max_tokens": output_limit,
                        }
                    ],
                }
            },
            "permissions": {"allowed_tools": list(self.ALLOWED_TOOLS)},
            "options": {
                "disable_default_providers": True,
                "disable_provider_auto_update": True,
                "disable_metrics": True,
                "notifications": "disabled",
            },
        }
        config_path = self.work_dir / "crush.json"
        with open(config_path, "w", encoding="utf-8") as config_file:
            json.dump(config, config_file, indent=2)
        print(
            f"[*] Crush local limits: context={context_limit}, "
            f"output={output_limit} tokens."
        )

    def get_env_vars(self) -> Dict[str, str]:
        env = super().get_env_vars()
        env["CRUSH_DISABLE_METRICS"] = "1"
        env["CRUSH_DISABLE_PROVIDER_AUTO_UPDATE"] = "1"
        return env

    def _crush_version(self, env: Dict[str, str]) -> Optional[str]:
        try:
            completed = subprocess.run(
                [self.agent_binary, "--version"],
                cwd=self.work_dir,
                env=env,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=10,
                check=False,
            )
        except (OSError, subprocess.SubprocessError):
            return None
        output = (completed.stdout or completed.stderr).strip()
        return output.removeprefix("crush version ") or None

    def _read_last_session(
        self, data_dir: str, env: Dict[str, str]
    ) -> Optional[Dict]:
        try:
            completed = subprocess.run(
                [
                    self.agent_binary,
                    "session",
                    "last",
                    "--json",
                    "--data-dir",
                    data_dir,
                ],
                cwd=self.work_dir,
                env=env,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=30,
                check=False,
            )
            if completed.returncode != 0:
                return None
            data = json.loads(completed.stdout)
            return data if isinstance(data, dict) else None
        except (OSError, subprocess.SubprocessError, ValueError):
            return None

    def _artifact_names(self) -> list[str]:
        bookkeeping_files = {
            CHAT_SESSION_FILENAME,
            CRUSH_RESULT_FILENAME,
            CRUSH_SESSION_FILENAME,
            SERVER_LOG_FILENAME,
            "crush.json",
            "summary.html",
        }
        return sorted(
            path.name
            for path in self.work_dir.iterdir()
            if path.is_file() and path.name not in bookkeeping_files
        )

    def get_model_extra_info(self) -> Dict[str, str]:
        result_path = self.work_dir / CRUSH_RESULT_FILENAME
        if not result_path.exists():
            return {}
        try:
            data = json.loads(result_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
        extra = {}
        if data.get("provider_id"):
            extra["Provider"] = str(data["provider_id"]).title()
        if data.get("model_id"):
            extra["Model ID"] = data["model_id"]
        if data.get("crush_version"):
            extra["Crush Version"] = data["crush_version"]
        return extra

    def execute_agent(self) -> None:
        prompt_content = read_prompt_file(self.prompt_file)
        model_ref = self._model_ref()
        env = self.get_env_vars()

        with tempfile.TemporaryDirectory(prefix="llm-eval-crush-") as data_dir:
            cmd = [
                self.agent_binary,
                "run",
                "--quiet",
                "--model",
                model_ref,
                "--data-dir",
                data_dir,
            ]
            returncode = self._run_process(
                cmd,
                env=env,
                input_text=prompt_content,
                display_cmd=(
                    f"crush run --quiet --model {model_ref} "
                    "--data-dir <isolated> < prompt"
                ),
            )
            session_data = self._read_last_session(data_dir, env)

        version = self._crush_version(env)
        if session_data is not None:
            (self.work_dir / CRUSH_SESSION_FILENAME).write_text(
                json.dumps(session_data, indent=2), encoding="utf-8"
            )

        result = normalize_crush_session(
            session_data or {},
            process_returncode=returncode,
            crush_version=version,
        )
        result["artifacts_produced"] = self._artifact_names()
        warnings = []
        if result.get("tool_calls", 0) == 0:
            warnings.append("The model emitted no tool calls.")
        if not result["artifacts_produced"]:
            warnings.append("The run produced no generated artifact files.")
        if session_data is None:
            warnings.append("Crush session JSON was unavailable; usage could not be read.")
        result["warnings"] = warnings

        result_path = self.work_dir / CRUSH_RESULT_FILENAME
        result_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(f"[+] Crush usage data saved to: {result_path}")

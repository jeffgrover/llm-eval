"""DeepSeek Harness (dsh) adapter.

Drives ``dsh --profile acp`` — the Agent Client Protocol (ACP) server over
stdio — so a single evaluation prompt is answered headlessly and any model may
be selected. ACP is the harness's designed automation surface: it accepts the
prompt as a JSON-RPC ``session/prompt`` request (no command-line length limit,
so multi-KB ``*.md`` prompts work) and streams the assistant's text, tool calls,
and context usage back as ``session/update`` notifications.

Model selection for the ACP profile is the ``acp`` composition entry (``provider``
and ``model``), which this runner pins with a ``--patch`` overlay together with
the ``llm-pi-ai`` provider route for local/custom OpenAI-compatible endpoints.
``DSH_HOME`` is redirected to a per-run directory under the evaluation workspace
so the harness never touches the user's live ``~/.dsh`` session state.
"""

import json
import os
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from evaluation_core import (
    AgentRunner,
    CHAT_SESSION_FILENAME,
    PROJECT_ROOT,
    read_prompt_file,
    safe_stdout_write,
)
from evaluation_metrics import DSH_RESULT_FILENAME

#: Profile patch overlay filename written into the run workspace.
DSH_PATCH_FILENAME = "dsh.patch.yml"
#: ACP protocol version negotiated in ``initialize``.
ACP_PROTOCOL_VERSION = 1
#: ACP JSON-RPC method names spoken by the dsh ACP server.
M_INITIALIZE = "initialize"
M_SESSION_NEW = "session/new"
M_SESSION_PROMPT = "session/prompt"
M_SESSION_CLOSE = "session/close"
M_SESSION_UPDATE = "session/update"  # server -> client notification


def resolve_dsh_command() -> List[str]:
    """Return the command prefix that launches the ``dsh`` CLI.

    Resolution order:

    1. A ``dsh`` on ``PATH`` (a globally-installed package).
    2. The real ``@deepseek-ai/dsh/lib/bin.js`` entry script run under ``node``,
       found from a global install, the npx cache, or the repo's own
       ``node_modules``.
    3. As a last resort, ``npx --yes @deepseek-ai/dsh`` — which auto-installs to
       the npx cache and runs it, exactly like ``npx @deepseek-ai/dsh web``.

    On Windows, ``dsh``/``npx`` are npm-installed ``.cmd`` shims that Python's
    ``subprocess.Popen`` cannot spawn directly, so we prefer the ``node bin.js``
    form and, failing that, wrap the npx shim in ``cmd.exe /c``.
    """
    direct = shutil.which("dsh")
    if direct:
        # A POSIX shebang executable or a native binary can be spawned directly;
        # a Windows .cmd/.bat wrapper cannot.
        if os.name != "nt" or not direct.lower().endswith((".cmd", ".bat")):
            return [direct]

    # Prefer the real Node entry script (identical across platforms and
    # sidesteps cmd.exe shim resolution entirely).
    bin_js = _locate_dsh_bin_js()
    if bin_js is not None:
        node = shutil.which("node") or "node"
        return [node, str(bin_js)]

    # Last resort: delegate to npx, which installs to the cache on demand.
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if npx:
        if os.name == "nt":
            return ["cmd.exe", "/c", npx, "--yes", "@deepseek-ai/dsh"]
        return [npx, "--yes", "@deepseek-ai/dsh"]

    if direct:
        return [direct]
    return ["dsh"]


def _locate_dsh_bin_js() -> Optional[Path]:
    """Resolve ``@deepseek-ai/dsh/lib/bin.js`` from a known install root."""
    candidates = []

    # From a Windows shim at ``<pkg>/node_modules/.bin/dsh.cmd`` the entry lives
    # at ``<pkg>/node_modules/@deepseek-ai/dsh/lib/bin.js``.
    for shim_name in ("dsh.cmd", "dsh", "dsh.ps1"):
        shim = shutil.which(shim_name)
        if not shim:
            continue
        bin_dir = Path(shim).resolve().parent  # .../node_modules/.bin
        candidates.append(
            bin_dir.parent / "@deepseek-ai" / "dsh" / "lib" / "bin.js"
        )

    # Global npm root (where ``npm install -g @deepseek-ai/dsh`` lands).
    for base in (
        Path.home() / "AppData" / "Roaming" / "npm" / "node_modules",
        Path.home() / "node_modules",
    ):
        candidates.append(base / "@deepseek-ai" / "dsh" / "lib" / "bin.js")

    # The evaluation repo's own node_modules (local install).
    repo_root = Path(__file__).resolve().parent.parent
    candidates.append(repo_root / "node_modules" / "@deepseek-ai" / "dsh" / "lib" / "bin.js")

    # Any npx cache copy (``npx @deepseek-ai/dsh`` downloads it here).
    npm_cache = Path.home() / "AppData" / "Local" / "npm-cache"
    if npm_cache.exists():
        candidates.extend(
            p / "@deepseek-ai" / "dsh" / "lib" / "bin.js"
            for p in (npm_cache / "_npx").glob("*")
            if p.is_dir()
        )

    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


# ---------------------------------------------------------------------------
# Minimal dependency-free YAML rendering for the patch overlay. The structure
# is small and fixed, so we avoid pulling PyYAML into a stdlib-only harness.
# ---------------------------------------------------------------------------


def _yaml_scalar(value) -> str:
    """Render one scalar as a YAML plain or quoted value."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value)
    if (
        text == ""
        or text != text.strip()
        or any(ch in text for ch in ":#{}[],&*!|>'\"\n")
        or text[0] in "-? "
    ):
        return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return text


def _render_mapping(lines: List[str], mapping: Dict, indent: str) -> None:
    """Append a YAML mapping to ``lines`` at ``indent``."""
    for key, value in mapping.items():
        if isinstance(value, dict):
            lines.append(f"{indent}{key}:")
            _render_mapping(lines, value, indent + "  ")
        elif isinstance(value, list):
            if not value:
                lines.append(f"{indent}{key}: []")
                continue
            lines.append(f"{indent}{key}:")
            for item in value:
                if isinstance(item, dict):
                    lines.append(f"{indent}-")
                    _render_mapping(lines, item, indent + "  ")
                else:
                    lines.append(f"{indent}- {_yaml_scalar(item)}")
        else:
            lines.append(f"{indent}{key}: {_yaml_scalar(value)}")


def render_patch_yaml(entries: List[Dict]) -> str:
    """Render loader patch entries as a YAML document."""
    lines = []
    for entry in entries:
        lines.append("- id: " + _yaml_scalar(entry["id"]))
        config = entry.get("config")
        if isinstance(config, dict) and config:
            lines.append("  config:")
            _render_mapping(lines, config, "    ")
    return "\n".join(lines) + "\n"


class DshRunner(AgentRunner):
    """Evaluates DeepSeek Harness through its ACP automation server."""

    # ``--provider`` names the harness provider route (pi-ai or a hand-declared
    # local endpoint), so it is meaningful in both local and non-local modes.
    supports_custom_provider = True
    executable_name = "dsh"

    #: pi-ai provider -> the environment variable that carries its API key.
    #: Mirrors ``@earendil-works/pi-ai``'s ``env-api-keys`` map, so a non-local
    #: catalog route authenticates from the ambient environment.
    PROVIDER_ENV_KEYS = {
        "openai": "OPENAI_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
        "deepseek": "DEEPSEEK_API_KEY",
        "deepseek-official": "DEEPSEEK_API_KEY",
        "google": "GEMINI_API_KEY",
        "gemini": "GEMINI_API_KEY",
        "groq": "GROQ_API_KEY",
        "xai": "XAI_API_KEY",
        "x-ai": "XAI_API_KEY",
        "mistral": "MISTRAL_API_KEY",
        "together": "TOGETHER_API_KEY",
        "togetherai": "TOGETHER_API_KEY",
        "ollama": None,
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Per-run harness home: the ACP profile lives here so it never touches
        # the user's live ``~/.dsh``. Created lazily by the harness.
        self.dsh_home = self.work_dir / ".dsh"

    def _provider_route(self) -> str:
        """Resolve the pi-ai provider route for this run."""
        if self.custom_provider:
            return self.custom_provider.strip()
        if self.non_local:
            return "openrouter"
        return self.local_provider.provider_id

    def _model_id(self) -> str:
        """Return the model id handed to the harness.

        Passed through verbatim: for OpenRouter the model id includes the
        upstream-provider prefix (``deepseek/deepseek-v4-pro-0813``), which the
        harness/pi-ai needs to resolve the route.
        """
        return self.model_name

    def _build_patch(self) -> Path:
        """Write the ``--patch`` overlay pinning provider and model."""
        provider = self._provider_route()
        model = self._model_id()

        # The ACP profile selects its model through the ``acp`` entry; the
        # ``agent-default-model`` entry is pinned too as a shared fallback.
        entries: List[Dict] = [
            {
                "id": "acp",
                "config": {"provider": provider, "model": model},
            },
            {
                "id": "agent-default-model",
                "config": {"provider": provider, "model": model},
            },
        ]

        # Register the provider route. ``llm-pi-ai`` mounts dormant with no
        # routes until a profile is declared, so every provider — catalog route
        # or not — must be registered here, otherwise session creation fails
        # with "no adapter registered for provider".
        api_key_env = self.PROVIDER_ENV_KEYS.get(provider, "DSH_EVAL_API_KEY")
        if self.non_local and api_key_env is not None:
            # Catalog route: pi-ai supplies baseURL/models; only the credential
            # reference is needed (or pi-ai discovers the env var itself).
            provider_config: Dict = {"apiKeyEnv": api_key_env}
        else:
            # Hand-declared route (local OpenAI-compatible endpoints, custom
            # gateways, or providers pi-ai ships no catalog for).
            provider_config = {
                "displayName": (
                    self.local_provider.display_name
                    if not self.non_local
                    else provider
                ),
                "api": "openai-completions",
                "models": [
                    {
                        "id": model,
                        "name": model,
                        "contextWindow": 131072,
                        "maxTokens": 32768,
                    }
                ],
            }
            if not self.non_local:
                provider_config["baseURL"] = self.local_provider.api_url
                provider_config["apiKeyEnv"] = "DSH_EVAL_API_KEY"
            elif api_key_env is not None:
                provider_config["apiKeyEnv"] = api_key_env

        entries.append(
            {
                "id": "llm-pi-ai",
                "config": {"providers": {provider: provider_config}},
            }
        )

        overlay = self.work_dir / DSH_PATCH_FILENAME
        overlay.write_text(render_patch_yaml(entries), encoding="utf-8")
        return overlay

    def get_env_vars(self) -> Dict[str, str]:
        env = super().get_env_vars()
        # Isolate state; the harness reads this home for profiles/settings.
        env["DSH_HOME"] = str(self.dsh_home.resolve())
        # The patch overlay's local route authenticates from this env ref.
        env.setdefault("DSH_EVAL_API_KEY", self.local_provider.api_key)
        # Grant full sandbox access so unattended evaluations never block on
        # interactive approval prompts (mirrors other runners' auto-approve).
        env.setdefault("DSH_PERMISSION_MODE", "danger-full-access")
        # Cloud credentials (OPENROUTER_API_KEY, etc.) must be exported in the
        # launching shell; DSH reads them straight from the environment.
        return env

    def get_model_extra_info(self) -> Dict[str, str]:
        result_path = self.work_dir / DSH_RESULT_FILENAME
        if not result_path.exists():
            return {}
        try:
            data = json.loads(result_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
        extra: Dict[str, str] = {}
        for key, label in (
            ("provider_id", "Provider"),
            ("model_id", "Model ID"),
            ("dsh_version", "DeepSeek Harness Version"),
        ):
            value = data.get(key)
            if isinstance(value, str) and value:
                extra[label] = value
        return extra

    def configure_agent(self):
        """Materialize the per-run patch overlay before the harness boots."""
        self._build_patch()

    def execute_agent(self):
        """Run one prompt through the ACP server and record the outcome."""
        dsh_cmd = resolve_dsh_command()
        prompt_content = read_prompt_file(self.prompt_file)

        cmd = [
            *dsh_cmd,
            "--profile",
            "acp",
            "--patch",
            str(self._build_patch().resolve()),
        ]

        env = self.get_env_vars()
        chat_log_path = self.work_dir / CHAT_SESSION_FILENAME
        result_json_path = self.work_dir / DSH_RESULT_FILENAME

        client = _AcpClient(
            cmd,
            cwd=PROJECT_ROOT,
            env=env,
            timeout=self.safety_limits.process_timeout,
        )
        try:
            text, stop_reason, tool_calls, error_message = client.run(prompt_content)
        finally:
            client.stop()

        with open(chat_log_path, "w", encoding="utf-8") as log_file:
            if client.stderr_lines:
                log_file.write("".join(client.stderr_lines))
                if not client.stderr_lines[-1].endswith("\n"):
                    log_file.write("\n")
                log_file.write("\n")
            log_file.write(text)
            if error_message:
                log_file.write(f"\n[ERROR] {error_message}\n")
            elif stop_reason == "end_turn":
                log_file.write("\n[SUCCESS] Turn completed.\n")
            else:
                log_file.write(f"\n[STOP] {stop_reason}\n")

        if text.strip():
            safe_stdout_write(text + "\n")

        success = error_message is None
        result_data: Dict = {
            "provider_id": self._provider_route(),
            "model_id": self._model_id(),
            "num_turns": 1 if text or tool_calls else 0,
            "tool_calls": tool_calls,
            "finish_reasons": [stop_reason] if stop_reason else [],
            "status": "success" if success else "error",
            "is_error": not success,
            # ACP relays context occupancy, not per-token or per-run USD cost.
            "token_counts_estimated": True,
            "cost_available": False,
            "cost_note": (
                "DeepSeek Harness ACP does not expose per-run token usage."
            ),
        }
        if stop_reason:
            result_data["stop_reason"] = stop_reason
            if stop_reason != "end_turn":
                result_data["terminal_reason"] = stop_reason
        if error_message:
            result_data["error"] = error_message

        with open(result_json_path, "w", encoding="utf-8") as f:
            json.dump(result_data, f, indent=2)
        if success:
            print("[+] DeepSeek Harness finished successfully.")
        else:
            print(
                f"[-] DeepSeek Harness finished with error: {error_message}"
            )
        print(f"[+] DeepSeek Harness result saved to: {result_json_path}")


# ---------------------------------------------------------------------------
# ACP stdio JSON-RPC client.
# ---------------------------------------------------------------------------


class _AcpClient:
    """A minimal ACP (Agent Client Protocol) JSON-RPC client over stdio.

    Speaks the dsh ACP server's dialect: NDJSON (newline-delimited JSON) over
    the child's stdin/stdout, standard JSON-RPC 2.0 envelopes, and the ACP
    ``initialize`` / ``session/new`` / ``session/prompt`` / ``session/update``
    method family.
    """

    def __init__(
        self, cmd: List[str], cwd: Path, env: Dict[str, str], timeout: Optional[float]
    ):
        self.cmd = cmd
        self.cwd = cwd
        self.env = env
        self.timeout = timeout
        self.proc: Optional[subprocess.Popen] = None
        self.stderr_lines: List[str] = []

        # Reader state (shared between the reader thread and request helpers).
        self._lock = threading.Lock()
        self._responses: Dict[int, Dict] = {}
        self._next_id = 1

        # Accumulated assistant state from session/update notifications.
        self._final_text = ""
        self._tool_calls = 0
        self._usage: Dict = {}

    def stop(self) -> None:
        """Terminate the child process, if any."""
        proc = self.proc
        if proc is None or proc.poll() is not None:
            return
        try:
            if os.name == "nt":
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                    check=False,
                    capture_output=True,
                    timeout=10,
                )
            else:
                proc.terminate()
        except (OSError, subprocess.TimeoutExpired):
            try:
                proc.kill()
            except OSError:
                pass

    def run(self, prompt: str) -> Tuple[str, str, int, Optional[str]]:
        """Run one prompt and return (text, stop_reason, tool_calls, error)."""
        self.proc = subprocess.Popen(
            self.cmd,
            cwd=self.cwd,
            env=self.env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )

        reader = threading.Thread(target=self._read_loop, daemon=True)
        reader.start()
        stderr_thread = threading.Thread(target=self._stderr_loop, daemon=True)
        stderr_thread.start()

        try:
            init = self._request(
                M_INITIALIZE,
                {
                    "protocolVersion": ACP_PROTOCOL_VERSION,
                    "clientCapabilities": {
                        "fs": {"readTextFile": False, "writeTextFile": False},
                        "terminal": False,
                        "auth": {"terminal": False},
                    },
                },
            )
            init_error = self._extract_rpc_error(init)
            if init_error is not None:
                return "", "", 0, f"ACP initialize failed: {init_error}"

            new_session = self._request(
                M_SESSION_NEW,
                {"cwd": str(self.cwd.resolve()), "mcpServers": []},
            )
            session_error = self._extract_rpc_error(new_session)
            if session_error is not None:
                return "", "", 0, f"ACP session/new failed: {session_error}"
            if not isinstance(new_session, dict) or not new_session.get("sessionId"):
                return "", "", 0, "ACP session/new returned no sessionId"
            session_id = new_session["sessionId"]

            prompt_response = self._request(
                M_SESSION_PROMPT,
                {
                    "sessionId": session_id,
                    "prompt": [{"type": "text", "text": prompt}],
                },
            )

            error_message: Optional[str] = None
            stop_reason = "cancelled"
            if prompt_response is None:
                error_message = "ACP session/prompt failed (no response)"
            elif isinstance(prompt_response, dict) and "error" in prompt_response:
                error_message = (
                    "ACP session/prompt failed: "
                    + self._format_rpc_error(prompt_response["error"])
                )
            else:
                stop_reason = prompt_response.get("stopReason", "cancelled")

            # Best-effort close.
            if session_id:
                try:
                    self._request(M_SESSION_CLOSE, {"sessionId": session_id})
                except Exception:
                    pass

            with self._lock:
                text = self._final_text
                tool_calls = self._tool_calls

            return text, stop_reason, tool_calls, error_message
        finally:
            stdin = self.proc.stdin
            if stdin is not None:
                try:
                    stdin.close()
                except OSError:
                    pass

    # --- request/response plumbing ---

    @staticmethod
    def _format_rpc_error(error) -> str:
        """Render a JSON-RPC error object as a readable one-line string."""
        if not isinstance(error, dict):
            return str(error)
        message = error.get("message") or "error"
        data = error.get("data")
        if isinstance(data, dict):
            details = data.get("details")
            if details:
                return f"{message}: {details}"
        return str(message)

    @staticmethod
    def _extract_rpc_error(response) -> Optional[str]:
        """Return the error text if ``response`` is a JSON-RPC error, else None."""
        if response is None:
            return "no response"
        if isinstance(response, dict) and "error" in response:
            return _AcpClient._format_rpc_error(response["error"])
        return None

    def _request(
        self, method: str, params: Dict, timeout: Optional[float] = None
    ) -> Optional[Dict]:
        """Send a JSON-RPC request and block for its response."""
        proc = self.proc
        if proc is None or proc.stdin is None:
            return None
        with self._lock:
            req_id = self._next_id
            self._next_id += 1
        message = {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method,
            "params": params,
        }
        try:
            proc.stdin.write(json.dumps(message) + "\n")
            proc.stdin.flush()
        except (OSError, ValueError):
            return None

        deadline = time.monotonic() + (timeout or self.timeout or 3600.0)
        while True:
            with self._lock:
                if req_id in self._responses:
                    return self._responses.pop(req_id)
            if proc.poll() is not None:
                return None
            if time.monotonic() >= deadline:
                return None
            time.sleep(0.01)

    def _read_loop(self) -> None:
        """Read NDJSON from the child and route responses/notifications."""
        if self.proc is None or self.proc.stdout is None:
            return
        for line in self.proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                message = json.loads(line)
            except ValueError:
                continue

            if not isinstance(message, dict):
                continue

            if "method" in message and "id" not in message:
                self._handle_notification(message)
            elif "id" in message and ("result" in message or "error" in message):
                req_id = message.get("id")
                if isinstance(req_id, int):
                    with self._lock:
                        if "error" in message:
                            self._responses[req_id] = {"error": message["error"]}
                        else:
                            self._responses[req_id] = message.get("result")

    def _stderr_loop(self) -> None:
        if self.proc is None or self.proc.stderr is None:
            return
        for line in self.proc.stderr:
            self.stderr_lines.append(line)

    def _handle_notification(self, message: Dict) -> None:
        method = message.get("method")
        if method != M_SESSION_UPDATE:
            return
        params = message.get("params") or {}
        update = params.get("update") or {}
        kind = update.get("sessionUpdate")

        with self._lock:
            if kind == "agent_message_chunk":
                content = update.get("content") or {}
                if content.get("type") == "text":
                    self._final_text += content.get("text", "")
            elif kind == "tool_call":
                self._tool_calls += 1
            elif kind == "usage_update":
                self._usage["used"] = update.get("used")
                self._usage["size"] = update.get("size")

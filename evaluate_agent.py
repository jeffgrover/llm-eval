#!/usr/bin/env python3
"""Command-line entry point for the LLM agent evaluation suite."""

import argparse
import sys
from pathlib import Path
from typing import List, Optional

import evaluation_core as core
from evaluation_core import (
    AgentRunner,
    CHAT_SESSION_FILENAME,
    MetadataCollector,
    SERVER_LOG_FILENAME,
    get_local_provider,
    is_llama_server_provider,
    is_omlx_provider,
    load_lms_model,
)
from evaluation_metrics import (
    CLAUDE_RESULT_FILENAME,
    CODEX_RESULT_FILENAME,
    GEMINI_RESULT_FILENAME,
    OPENCODE_RESULT_FILENAME,
    PI_RESULT_FILENAME,
    PI_WIGGUM_RESULT_FILENAME,
    VIBE_RESULT_FILENAME,
    TokenUsageCollector,
)
from evaluation_report import format_duration_human, generate_html_report
from runners import (
    ClaudeRunner,
    CodexRunner,
    CrushRunner,
    GeminiRunner,
    OpenCodeRunner,
    PiRunner,
    PiWiggumRunner,
    VibeRunner,
)


def __getattr__(name: str):
    """Preserve access to shared names that historically lived in this module."""
    try:
        return getattr(core, name)
    except AttributeError as exc:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}") from exc


# --- Factory ---


AGENT_RUNNERS = {
    "gemini": GeminiRunner,
    "agy": GeminiRunner,
    "antigravity": GeminiRunner,
    "claude": ClaudeRunner,
    "codex": CodexRunner,
    "vibe": VibeRunner,
    "mistral": VibeRunner,  # Backward compatibility alias
    "opencode": OpenCodeRunner,
    "crush": CrushRunner,
    "pi": PiRunner,
    "pi-wiggum": PiWiggumRunner,
}
CLI_AGENT_CHOICES = tuple(name for name in AGENT_RUNNERS if name != "mistral")


def get_runner(agent: str) -> Optional[type[AgentRunner]]:
    return AGENT_RUNNERS.get(agent.lower())


# --- Main ---


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Evaluate local LLM agents.")
    parser.add_argument("--model", required=True, help="LM Studio model key/identifier")
    parser.add_argument(
        "--agent",
        required=True,
        choices=CLI_AGENT_CHOICES,
        help="Agent to evaluate (vibe = Mistral Vibe, gemini/agy = Antigravity CLI)",
    )
    parser.add_argument(
        "--prompt-file",
        required=True,
        type=Path,
        help="Path to the initial prompt file",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        default=True,
        help="Run in headless mode (default: True)",
    )
    parser.add_argument(
        "--non-local",
        action="store_true",
        help="Disable LM Studio-related functionality and use default inference providers",
    )
    parser.add_argument(
        "--provider",
        help="Local provider (e.g., omlx or llama-server) or custom OpenCode/Vibe/Gemini provider",
    )
    parser.add_argument(
        "--restore-agent-config",
        action="store_true",
        help="Restore agent config (e.g. vibe active_model) to its original value after the run",
    )
    return parser


def main(argv: Optional[List[str]] = None):
    args = build_argument_parser().parse_args(argv)
    local_provider = get_local_provider(args.provider)

    runner_cls = get_runner(args.agent)
    if not runner_cls:
        print(f"[-] Unknown agent: {args.agent}")
        sys.exit(1)

    # Warn if --provider is used with --non-local for runners that do not use it.
    if args.provider and args.non_local and not runner_cls.supports_custom_provider:
        print("[!] Warning: --provider flag is ignored when using --non-local mode")
    elif is_llama_server_provider(args.provider):
        print(f"[*] Using llama-server provider at {local_provider.api_url}")
    elif is_omlx_provider(args.provider):
        print(f"[*] Using oMLX provider at {local_provider.api_url}")

    if not args.prompt_file.exists():
        print(f"[-] Prompt file not found: {args.prompt_file}")
        sys.exit(1)

    runner = runner_cls(
        args.agent,
        args.model,
        args.prompt_file,
        args.headless,
        args.non_local,
        args.restore_agent_config,
        custom_provider=args.provider if runner_cls.supports_custom_provider else None,
        local_provider=local_provider,
    )

    runner.confirm_workspace_overwrite()

    skip_local_model_load = False
    if args.agent == "opencode" and not args.non_local and not args.provider:
        provider_name = OpenCodeRunner._resolve_global_provider_for_model(args.model)
        skip_local_model_load = provider_name not in (None, "lmstudio", "lm-studio")

    if not args.non_local and not args.provider and not skip_local_model_load:
        runner.lms_cli_available = load_lms_model(args.model)

    runner.run()


if __name__ == "__main__":
    main()

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
    CRUSH_RESULT_FILENAME,
    CRUSH_SESSION_FILENAME,
    GEMINI_RESULT_FILENAME,
    OPENCODE_RESULT_FILENAME,
    PI_RESULT_FILENAME,
    PI_WIGGUM_RESULT_FILENAME,
    QODER_RESULT_FILENAME,
    VIBE_RESULT_FILENAME,
    TokenUsageCollector,
)
from evaluation_report import format_duration_human, generate_html_report
from run_safety import (
    DEFAULT_DOOM_LOOP_MAX_CYCLE_LENGTH,
    DEFAULT_DOOM_LOOP_MIN_CALLS,
    DEFAULT_DOOM_LOOP_REPEATS,
    DEFAULT_MAX_IDLE_SECONDS,
    DEFAULT_MAX_COST_USD,
    DEFAULT_MAX_SECONDS,
    DEFAULT_MAX_TOTAL_TOKENS,
    DEFAULT_MAX_TURNS,
    RunSafetyLimits,
)
from runners import (
    ClaudeRunner,
    CodexRunner,
    CrushRunner,
    GeminiRunner,
    OpenCodeRunner,
    PiRunner,
    PiWiggumRunner,
    QoderRunner,
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
    "qoder": QoderRunner,
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
    report_group = parser.add_mutually_exclusive_group()
    report_group.add_argument(
        "--headless",
        dest="headless",
        action="store_true",
        default=True,
        help="Do not open the generated report (default)",
    )
    report_group.add_argument(
        "--open-report",
        dest="headless",
        action="store_false",
        help="Open the generated report in the default browser",
    )
    parser.add_argument(
        "--execute-generated-python",
        action="store_true",
        help="Execute root-level Python artifacts after the agent finishes",
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
    parser.add_argument(
        "--lms-context-length",
        type=int,
        help="Force LM Studio to load the model with this context length",
    )
    parser.add_argument(
        "--lms-eval-batch-size",
        type=int,
        help="Force LM Studio llama.cpp prompt-evaluation batch size",
    )
    parser.add_argument(
        "--lms-flash-attention",
        action="store_true",
        help="Enable Flash Attention when loading the model in LM Studio",
    )
    parser.add_argument(
        "--lms-cpu-kv-cache",
        action="store_true",
        help="Keep LM Studio's KV cache in system memory instead of GPU memory",
    )
    safety_group = parser.add_argument_group("runaway-agent safeguards")
    safety_group.add_argument(
        "--max-seconds",
        type=float,
        default=DEFAULT_MAX_SECONDS,
        help=f"Stop after this wall time; 0 disables (default: {DEFAULT_MAX_SECONDS:g})",
    )
    safety_group.add_argument(
        "--max-idle-seconds",
        type=float,
        default=DEFAULT_MAX_IDLE_SECONDS,
        help=(
            "Stop after this many seconds without agent process output; "
            f"0 disables (default: {DEFAULT_MAX_IDLE_SECONDS:g})"
        ),
    )
    safety_group.add_argument(
        "--max-turns",
        type=int,
        default=DEFAULT_MAX_TURNS,
        help=f"Stop after this many turns; 0 disables (default: {DEFAULT_MAX_TURNS})",
    )
    safety_group.add_argument(
        "--max-total-tokens",
        type=int,
        default=DEFAULT_MAX_TOTAL_TOKENS,
        help=(
            "Stop after this many accumulated input/output tokens; 0 disables "
            f"(default: {DEFAULT_MAX_TOTAL_TOKENS})"
        ),
    )
    safety_group.add_argument(
        "--max-cost-usd",
        type=float,
        default=DEFAULT_MAX_COST_USD,
        help=f"Stop at this reported cost; 0 disables (default: {DEFAULT_MAX_COST_USD:g})",
    )
    safety_group.add_argument(
        "--doom-loop-repeats",
        type=int,
        default=DEFAULT_DOOM_LOOP_REPEATS,
        help=(
            "Stop after a short tool cycle repeats this many times; 0 disables "
            f"(default: {DEFAULT_DOOM_LOOP_REPEATS})"
        ),
    )
    safety_group.add_argument(
        "--doom-loop-max-cycle-length",
        type=int,
        default=DEFAULT_DOOM_LOOP_MAX_CYCLE_LENGTH,
        help=(
            "Longest repeating tool cycle to detect "
            f"(default: {DEFAULT_DOOM_LOOP_MAX_CYCLE_LENGTH})"
        ),
    )
    safety_group.add_argument(
        "--doom-loop-min-calls",
        type=int,
        default=DEFAULT_DOOM_LOOP_MIN_CALLS,
        help=(
            "Minimum consecutive calls before cycle detection "
            f"(default: {DEFAULT_DOOM_LOOP_MIN_CALLS})"
        ),
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
        execute_generated_python=args.execute_generated_python,
        safety_limits=RunSafetyLimits(
            max_seconds=args.max_seconds,
            max_idle_seconds=args.max_idle_seconds,
            max_turns=args.max_turns,
            max_total_tokens=args.max_total_tokens,
            max_cost_usd=args.max_cost_usd,
            doom_loop_repeats=args.doom_loop_repeats,
            doom_loop_max_cycle_length=args.doom_loop_max_cycle_length,
            doom_loop_min_calls=args.doom_loop_min_calls,
        ),
    )
    runner.local_context_limit = args.lms_context_length

    runner.confirm_workspace_overwrite()

    skip_local_model_load = False
    if args.agent == "opencode" and not args.non_local and not args.provider:
        provider_name = OpenCodeRunner._resolve_global_provider_for_model(args.model)
        skip_local_model_load = provider_name not in (None, "lmstudio", "lm-studio")

    if not args.non_local and not args.provider and not skip_local_model_load:
        runner.lms_cli_available = load_lms_model(
            args.model,
            context_length=args.lms_context_length,
            eval_batch_size=args.lms_eval_batch_size,
            flash_attention=args.lms_flash_attention,
            cpu_kv_cache=args.lms_cpu_kv_cache,
        )

    runner.run()


if __name__ == "__main__":
    main()

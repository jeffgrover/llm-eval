"""Token-usage collection for evaluation reports."""

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional


CLAUDE_RESULT_FILENAME = "CLAUDE_RESULT.JSON"
GEMINI_RESULT_FILENAME = "GEMINI_RESULT.JSON"
OPENCODE_RESULT_FILENAME = "OPENCODE_RESULT.JSON"
CRUSH_RESULT_FILENAME = "CRUSH_RESULT.JSON"
CRUSH_SESSION_FILENAME = "CRUSH_SESSION.JSON"
CODEX_RESULT_FILENAME = "CODEX_RESULT.JSON"
VIBE_RESULT_FILENAME = "VIBE_RESULT.JSON"
PI_RESULT_FILENAME = "PI_RESULT.JSON"
PI_WIGGUM_RESULT_FILENAME = "PI_WIGGUM_RESULT.JSON"
QODER_RESULT_FILENAME = "QODER_RESULT.JSON"
QODER_EVENTS_FILENAME = "QODER_EVENTS.JSONL"

#: Ordered result filenames to scan, matching the dashboard priority.
RESULT_FILES = (
    CLAUDE_RESULT_FILENAME,
    GEMINI_RESULT_FILENAME,
    OPENCODE_RESULT_FILENAME,
    CRUSH_RESULT_FILENAME,
    PI_WIGGUM_RESULT_FILENAME,
    PI_RESULT_FILENAME,
    CODEX_RESULT_FILENAME,
    VIBE_RESULT_FILENAME,
    QODER_RESULT_FILENAME,
)

TokenUsage = Dict[str, Any]


@dataclass
class RunMetrics:
    """Unified metrics extracted from any runner result JSON.

    This is the single source of truth for reading run metrics. Both the
    per-run report and the dashboard use :func:`load_run_metrics` to parse
    result files, ensuring consistent token counts, costs, and status flags
    across all consumers.
    """

    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    reasoning_tokens: int = 0
    cost_usd: float = 0.0
    num_turns: int = 0
    tool_calls: int = 0
    duration_ms: int = 0
    success: Optional[bool] = None
    error: bool = False
    token_counts_estimated: bool = False
    cost_available: Optional[bool] = None
    cost_note: str = ""
    wiggum_attempts: int = 0
    finish_reasons: List[str] = field(default_factory=list)
    artifacts_produced: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    terminal_reason: str = ""
    termination: Dict[str, Any] = field(default_factory=dict)
    result_file: str = ""
    parse_error: bool = False


def load_run_metrics(work_dir: Path) -> RunMetrics:
    """Scan ``work_dir`` for a result JSON and return unified metrics.

    Tries each known result filename in priority order and returns metrics
    from the first one found. Returns an empty :class:`RunMetrics` if no
    result file exists.
    """
    for filename in RESULT_FILES:
        path = work_dir / filename
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                return RunMetrics(result_file=filename, parse_error=True)
            if not isinstance(data, dict):
                return RunMetrics(result_file=filename, parse_error=True)
            return _parse_result_data(data, filename)
    return RunMetrics()


def _parse_result_data(result: Dict, filename: str = "") -> RunMetrics:
    """Normalize a parsed result JSON dict into :class:`RunMetrics`.

    Handles all known result formats: standard (input/output tokens),
    Gemini stats, Claude/Qoder modelUsage, and Pi Wiggum aggregates.
    """
    m = RunMetrics(result_file=filename)

    # Gemini nests metrics under "stats".
    stats = result.get("stats", {})
    if stats:
        m.input_tokens = stats.get("input_tokens", stats.get("input", 0)) or 0
        m.output_tokens = stats.get("output_tokens", 0) or 0
        m.total_tokens = (
            stats.get("total_tokens") or m.input_tokens + m.output_tokens
        )
        m.cache_read_tokens = stats.get("cached", 0) or 0
        m.duration_ms = (
            stats.get("duration_ms", 0)
            or result.get("duration_ms", 0)
            or 0
        )
        m.tool_calls = stats.get("tool_calls", 0) or 0
        m.num_turns = result.get("num_turns", 0) or m.tool_calls
        m.success = result.get("status") == "success"
        m.error = (
            result.get("status") not in (None, "success")
            or bool(result.get("error"))
        )

    # Estimated tokens (Qoder fallback)
    elif result.get("token_counts_estimated"):
        m.input_tokens = result.get("input_tokens", 0) or 0
        m.output_tokens = result.get("output_tokens", 0) or 0
        m.total_tokens = (
            result.get("total_tokens")
            or m.input_tokens + m.output_tokens
        )

    # Claude/Qoder modelUsage
    elif "modelUsage" in result:
        for model_data in result.get("modelUsage", {}).values():
            m.input_tokens += (
                model_data.get("inputTokens", 0)
                + model_data.get("cacheCreationInputTokens", 0)
                + model_data.get("cacheReadInputTokens", 0)
            )
            m.output_tokens += model_data.get("outputTokens", 0)
            m.cache_read_tokens += model_data.get("cacheReadInputTokens", 0)
            m.cost_usd += model_data.get("costUSD", 0) or 0
        m.total_tokens = m.input_tokens + m.output_tokens

    # Standard flat format (OpenCode, Codex, Pi, Vibe, Crush)
    else:
        usage = result.get("usage", {})
        m.input_tokens = (
            result.get("input_tokens")
            or result.get("prompt_tokens")
            or usage.get("input_tokens", 0)
            + usage.get("cache_creation_input_tokens", 0)
            + usage.get("cache_read_input_tokens", 0)
            or 0
        )
        m.output_tokens = (
            result.get("output_tokens")
            or result.get("completion_tokens")
            or usage.get("output_tokens", 0)
            or 0
        )
        m.total_tokens = result.get("total_tokens") or m.input_tokens + m.output_tokens
        m.cache_read_tokens = (
            result.get("cache_read_tokens")
            or usage.get("cache_read_input_tokens", 0)
            or 0
        )
        m.cost_usd = result.get("cost_usd") or result.get("total_cost_usd") or 0.0

    explicit_cost = result.get("cost_usd") or result.get("total_cost_usd")
    if explicit_cost:
        m.cost_usd = explicit_cost
    if "cost_available" in result:
        m.cost_available = bool(result["cost_available"])
    m.cost_note = result.get("cost_note") or ""
    m.token_counts_estimated = bool(result.get("token_counts_estimated"))
    m.wiggum_attempts = result.get("attempts", 0) or 0
    m.duration_ms = (
        m.duration_ms
        or result.get("duration_ms", 0)
        or result.get("duration_api_ms", 0)
        or 0
    )
    m.num_turns = m.num_turns or result.get("num_turns", 0) or 0
    if not stats:
        m.success = (
            result.get("subtype") == "success"
            or result.get("status") == "success"
            or result.get("terminal_reason") == "completed"
        )
        m.error = (
            bool(result.get("is_error"))
            or bool(result.get("error"))
            or bool(result.get("_parse_error"))
        )

    # Optional metadata
    m.finish_reasons = result.get("finish_reasons") or []
    m.artifacts_produced = (
        result.get("artifacts_produced") or result.get("artifacts") or []
    )
    m.warnings = result.get("warnings") or []
    m.terminal_reason = result.get("terminal_reason") or ""
    m.termination = result.get("termination") or {}
    m.reasoning_tokens = (
        result.get("reasoning_tokens", 0)
        or stats.get("reasoning_tokens", 0)
        or 0
    )
    m.cache_write_tokens = result.get("cache_write_tokens", 0) or 0
    m.tool_calls = m.tool_calls or result.get("tool_calls", 0) or 0

    return m


class TokenUsageCollector:
    """Collect token metrics from runner results, server logs, and chat logs."""

    @staticmethod
    def _empty_usage() -> TokenUsage:
        return {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    @classmethod
    def _run_metrics_usage(cls, metrics: RunMetrics) -> TokenUsage:
        """Convert normalized metrics to the report's legacy token-key names."""
        usage = {
            "prompt_tokens": metrics.input_tokens,
            "completion_tokens": metrics.output_tokens,
            "total_tokens": metrics.total_tokens,
        }
        for key, value in (
            ("cache_read_tokens", metrics.cache_read_tokens),
            ("cache_write_tokens", metrics.cache_write_tokens),
            ("reasoning_tokens", metrics.reasoning_tokens),
            ("cost_usd", metrics.cost_usd),
            ("num_turns", metrics.num_turns),
            ("tool_calls", metrics.tool_calls),
            ("wiggum_attempts", metrics.wiggum_attempts),
        ):
            if value:
                usage[key] = value
        if metrics.token_counts_estimated or metrics.cost_available is not None:
            usage["token_counts_estimated"] = metrics.token_counts_estimated
        if metrics.cost_available is not None:
            usage["cost_available"] = metrics.cost_available
        if metrics.cost_note:
            usage["cost_note"] = metrics.cost_note
        for key, value in (
            ("finish_reasons", metrics.finish_reasons),
            ("artifacts_produced", metrics.artifacts_produced),
            ("warnings", metrics.warnings),
            ("terminal_reason", metrics.terminal_reason),
            ("termination", metrics.termination),
        ):
            if value:
                usage[key] = value
        return usage

    @classmethod
    def _server_log_usage(cls, log_path: Path) -> TokenUsage:
        usage = cls._empty_usage()
        if not log_path or not log_path.exists():
            return usage

        try:
            content = log_path.read_text(encoding="utf-8", errors="ignore")
            json_matches = re.findall(
                r'"usage":\s*({[^}]+})', content, flags=re.DOTALL
            )

            if json_matches:
                for match in json_matches:
                    try:
                        raw_usage = json.loads(match)
                        usage["prompt_tokens"] += raw_usage.get("prompt_tokens", 0)
                        usage["completion_tokens"] += raw_usage.get(
                            "completion_tokens", 0
                        )
                        usage["total_tokens"] += raw_usage.get("total_tokens", 0)
                    except json.JSONDecodeError:
                        for key in usage:
                            token_match = re.search(rf'"{key}":\s*(\d+)', match)
                            if token_match:
                                usage[key] += int(token_match.group(1))
            else:
                prompt_match = re.search(
                    r"prompt eval time =.* (\d+) tokens", content
                )
                completion_match = re.search(
                    r"^\s*eval time =.* (\d+) tokens", content, re.MULTILINE
                )
                if prompt_match:
                    usage["prompt_tokens"] = int(prompt_match.group(1))
                if completion_match:
                    usage["completion_tokens"] = int(completion_match.group(1))
                usage["total_tokens"] = (
                    usage["prompt_tokens"] + usage["completion_tokens"]
                )
        except OSError as exc:
            print(f"[-] Error parsing server log token usage: {exc}")
        return usage

    @classmethod
    def _chat_log_usage(cls, chat_log_path: Optional[Path]) -> TokenUsage:
        usage = cls._empty_usage()
        if not chat_log_path or not chat_log_path.exists():
            return usage

        try:
            content = chat_log_path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return usage

        patterns = (
            (
                r'prompt_tokens["\']?\s*[:=]\s*(\d+)',
                r'completion_tokens["\']?\s*[:=]\s*(\d+)',
            ),
            (r"(\d+)\s+prompt tokens", r"(\d+)\s+completion tokens"),
            (r"Tokens used:\s*(\d+)\s*input,\s*(\d+)\s*output", None),
        )
        for prompt_pattern, completion_pattern in patterns:
            prompt_match = re.search(prompt_pattern, content, re.IGNORECASE)
            if not prompt_match:
                continue
            usage["prompt_tokens"] = int(prompt_match.group(1))
            if completion_pattern:
                completion_match = re.search(
                    completion_pattern, content, re.IGNORECASE
                )
                if completion_match:
                    usage["completion_tokens"] = int(completion_match.group(1))
            elif prompt_match.lastindex and prompt_match.lastindex >= 2:
                usage["completion_tokens"] = int(prompt_match.group(2))
            usage["total_tokens"] = (
                usage["prompt_tokens"] + usage["completion_tokens"]
            )
            break
        return usage

    @classmethod
    def collect(
        cls, log_path: Path, chat_log_path: Optional[Path] = None
    ) -> TokenUsage:
        normalized_usage = None
        if chat_log_path:
            metrics = load_run_metrics(chat_log_path.parent)
            if metrics.result_file and not metrics.parse_error:
                normalized_usage = cls._run_metrics_usage(metrics)
                if metrics.total_tokens > 0 or metrics.wiggum_attempts:
                    return normalized_usage

        usage = cls._server_log_usage(log_path)
        if usage["total_tokens"] == 0:
            usage = cls._chat_log_usage(chat_log_path)
        if normalized_usage:
            for key, value in normalized_usage.items():
                if key not in ("prompt_tokens", "completion_tokens", "total_tokens"):
                    usage[key] = value
        return usage

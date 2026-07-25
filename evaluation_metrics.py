"""Token-usage collection for evaluation reports."""

import json
import re
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Union


CLAUDE_RESULT_FILENAME = "CLAUDE_RESULT.JSON"
GEMINI_RESULT_FILENAME = "GEMINI_RESULT.JSON"
OPENCODE_RESULT_FILENAME = "OPENCODE_RESULT.JSON"
CODEX_RESULT_FILENAME = "CODEX_RESULT.JSON"
VIBE_RESULT_FILENAME = "VIBE_RESULT.JSON"
PI_RESULT_FILENAME = "PI_RESULT.JSON"
PI_WIGGUM_RESULT_FILENAME = "PI_WIGGUM_RESULT.JSON"
QODER_RESULT_FILENAME = "QODER_RESULT.JSON"
QODER_EVENTS_FILENAME = "QODER_EVENTS.JSONL"

JsonObject = Dict[str, Any]
MetricValue = Union[int, float, bool, str]
TokenUsage = Dict[str, MetricValue]


class TokenUsageCollector:
    """Collect token metrics from runner results, server logs, and chat logs."""

    _STANDARD_RESULT_FILES = (
        ("OpenCode", OPENCODE_RESULT_FILENAME, None),
        ("Codex", CODEX_RESULT_FILENAME, None),
        ("Pi Wiggum", PI_WIGGUM_RESULT_FILENAME, ("attempts", "wiggum_attempts")),
        ("Pi", PI_RESULT_FILENAME, None),
        ("Vibe", VIBE_RESULT_FILENAME, None),
    )

    @staticmethod
    def _empty_usage() -> TokenUsage:
        return {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    @staticmethod
    def _read_result(path: Path, label: str) -> Optional[JsonObject]:
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
            raise ValueError("expected a JSON object")
        except (OSError, ValueError) as exc:
            print(f"[-] Error parsing {label} result JSON: {exc}")
            return None

    @classmethod
    def _standard_result_usage(
        cls,
        data: JsonObject,
        extra_metric: Optional[Tuple[str, str]] = None,
    ) -> TokenUsage:
        usage = cls._empty_usage()
        usage["prompt_tokens"] = data.get("input_tokens", 0)
        usage["completion_tokens"] = data.get("output_tokens", 0)
        usage["total_tokens"] = data.get("total_tokens", 0)

        for source_key, usage_key in (
            ("cache_read_tokens", "cache_read_tokens"),
            ("cost_usd", "cost_usd"),
            ("num_turns", "num_turns"),
        ):
            value = data.get(source_key, 0)
            if value:
                usage[usage_key] = value

        cls._copy_result_metadata(data, usage)
        if extra_metric:
            source_key, usage_key = extra_metric
            value = data.get(source_key, 0)
            if value:
                usage[usage_key] = value
        return usage

    @staticmethod
    def _copy_result_metadata(data: JsonObject, usage: TokenUsage) -> None:
        for key in ("token_counts_estimated", "cost_available", "cost_note"):
            if key in data:
                usage[key] = data[key]

    @classmethod
    def _parse_model_usage_result(cls, data: JsonObject) -> TokenUsage:
        usage = cls._empty_usage()
        model_usage = data.get("modelUsage", {})
        model_cost = 0.0
        if model_usage:
            for model_data in model_usage.values():
                usage["prompt_tokens"] += (
                    model_data.get("inputTokens", 0)
                    + model_data.get("cacheCreationInputTokens", 0)
                    + model_data.get("cacheReadInputTokens", 0)
                )
                usage["completion_tokens"] += model_data.get("outputTokens", 0)
                cache_read = model_data.get("cacheReadInputTokens", 0)
                if cache_read:
                    usage["cache_read_tokens"] = (
                        usage.get("cache_read_tokens", 0) + cache_read
                    )
                model_cost += model_data.get("costUSD", 0) or 0
        else:
            raw_usage = data.get("usage", {})
            usage["prompt_tokens"] = (
                raw_usage.get("input_tokens", 0)
                + raw_usage.get("cache_creation_input_tokens", 0)
                + raw_usage.get("cache_read_input_tokens", 0)
            )
            usage["completion_tokens"] = raw_usage.get("output_tokens", 0)
            cache_read = raw_usage.get("cache_read_input_tokens", 0)
            if cache_read:
                usage["cache_read_tokens"] = cache_read

        usage["total_tokens"] = usage["prompt_tokens"] + usage["completion_tokens"]
        cost = data.get("cost_usd") or data.get("total_cost_usd") or model_cost
        if cost:
            usage["cost_usd"] = cost
        if data.get("num_turns"):
            usage["num_turns"] = data["num_turns"]
        cls._copy_result_metadata(data, usage)
        return usage

    @classmethod
    def _claude_result_usage(cls, result_dir: Path) -> Optional[TokenUsage]:
        data = cls._read_result(result_dir / CLAUDE_RESULT_FILENAME, "Claude")
        if data is None:
            return None
        return cls._parse_model_usage_result(data)

    @classmethod
    def _qoder_result_usage(cls, result_dir: Path) -> Optional[TokenUsage]:
        data = cls._read_result(result_dir / QODER_RESULT_FILENAME, "Qoder")
        if data is None:
            return None
        if data.get("token_counts_estimated"):
            return cls._standard_result_usage(data)
        return cls._parse_model_usage_result(data)

    @classmethod
    def _gemini_result_usage(cls, result_dir: Path) -> Optional[TokenUsage]:
        data = cls._read_result(result_dir / GEMINI_RESULT_FILENAME, "Gemini")
        if data is None:
            return None

        stats = data.get("stats", {})
        if not stats:
            return cls._standard_result_usage(data)

        usage = cls._empty_usage()
        usage["prompt_tokens"] = stats.get("input_tokens", 0)
        usage["completion_tokens"] = stats.get("output_tokens", 0)
        usage["total_tokens"] = stats.get("total_tokens", 0)
        if stats.get("cached"):
            usage["cache_read_tokens"] = stats["cached"]
        num_turns = data.get("num_turns") or stats.get("tool_calls")
        if num_turns:
            usage["num_turns"] = num_turns
        return usage

    @classmethod
    def _runner_result_usage(cls, result_dir: Path) -> Optional[TokenUsage]:
        for parser in (
            cls._claude_result_usage,
            cls._qoder_result_usage,
            cls._gemini_result_usage,
        ):
            usage = parser(result_dir)
            if usage and (usage["total_tokens"] > 0 or usage.get("num_turns")):
                return usage

        for label, filename, extra_metric in cls._STANDARD_RESULT_FILES:
            data = cls._read_result(result_dir / filename, label)
            if data is None:
                continue
            usage = cls._standard_result_usage(data, extra_metric)
            has_extra_metric = bool(extra_metric and usage.get(extra_metric[1]))
            if usage["total_tokens"] > 0 or has_extra_metric:
                return usage
        return None

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
        if chat_log_path:
            result_usage = cls._runner_result_usage(chat_log_path.parent)
            if result_usage:
                return result_usage

        usage = cls._server_log_usage(log_path)
        if usage["total_tokens"] == 0:
            usage = cls._chat_log_usage(chat_log_path)
        return usage

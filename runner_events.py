"""Pure normalization helpers for agent CLI event streams."""

import json
import math
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional


@dataclass
class ParsedEvent:
    """The runner-relevant subset of one vendor-specific event."""

    text: str = ""
    usage: Dict[str, float] = field(default_factory=dict)
    provider_id: Optional[str] = None
    model_id: Optional[str] = None
    turn_completed: bool = False
    error: Optional[str] = None
    result: Optional[Dict] = None
    log_raw: bool = False
    tool_calls: int = 0
    finish_reason: Optional[str] = None


def parse_gemini_transcript(records: Iterable[Dict]) -> Dict[str, int]:
    """Estimate Antigravity token counts from its transcript records."""
    turns = 0
    tool_calls = 0
    input_chars = 0
    output_chars = 0

    for record in records:
        record_type = record.get("type", "")
        if record_type == "USER_INPUT":
            input_chars += len(record.get("content", ""))
        elif record_type == "PLANNER_RESPONSE":
            turns += 1
            output_chars += len(record.get("content", ""))
            output_chars += len(record.get("thinking", ""))
            calls = record.get("tool_calls", [])
            if isinstance(calls, list):
                tool_calls += len(calls)
                for call in calls:
                    if isinstance(call, dict):
                        output_chars += len(json.dumps(call.get("args", {})))

    input_tokens = math.ceil(input_chars / 4.0) if input_chars else 0
    output_tokens = math.ceil(output_chars / 4.0) if output_chars else 0
    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": input_tokens + output_tokens,
        "cached": 0,
        "tool_calls": tool_calls,
        "num_turns": max(turns, 1),
    }


def parse_claude_event(event: Dict) -> ParsedEvent:
    event_type = event.get("type", "")
    if event_type == "assistant":
        pieces = []
        for block in event.get("message", {}).get("content", []):
            if block.get("type") == "text":
                pieces.append(block.get("text", ""))
            elif block.get("type") == "tool_use":
                name = block.get("name", "unknown")
                path = block.get("input", {}).get("file_path", "")
                suffix = f" {path}" if name in ("Write", "Edit") and path else ""
                pieces.append(f"\n[Tool: {name}]{suffix}\n")
        return ParsedEvent(text="".join(pieces))
    if event_type == "result":
        result_text = event.get("result", "")
        text = f"\n{result_text}\n" if result_text else ""
        return ParsedEvent(text=text, result=event)
    return ParsedEvent()


def parse_qoder_event(event: Dict) -> ParsedEvent:
    """Qoder CLI uses the same stream-json schema as Claude Code."""
    return parse_claude_event(event)


def _qoder_content_chars(content) -> int:
    """Count model-visible characters in a Qoder message content value."""
    if isinstance(content, str):
        return len(content)
    if isinstance(content, list):
        return sum(_qoder_content_chars(item) for item in content)
    if not isinstance(content, dict):
        return 0

    block_type = content.get("type")
    if block_type in ("text", "thinking"):
        value = content.get("text") or content.get("thinking") or ""
        return len(value)
    if block_type == "tool_use":
        tool_input = json.dumps(
            content.get("input", {}),
            ensure_ascii=False,
            separators=(",", ":"),
        )
        return len(content.get("name", "")) + len(tool_input)
    if block_type == "tool_result":
        return _qoder_content_chars(content.get("content", ""))

    return len(json.dumps(content, ensure_ascii=False, separators=(",", ":")))


@dataclass
class QoderUsageEstimator:
    """Estimate Qoder tokens when its hosted models report zero usage.

    Qoder's stream exposes the model-visible transcript but currently returns
    zero for all token counters. The estimate uses the same four-characters per
    token convention as the Antigravity fallback. Input counts are cumulative
    across model requests so multi-turn tool loops are represented.
    """

    context_chars: int
    input_tokens: int = 0
    output_tokens: int = 0
    turns: int = 0

    @classmethod
    def from_prompt(cls, prompt: str) -> "QoderUsageEstimator":
        return cls(context_chars=len(prompt))

    def observe(self, event: Dict) -> None:
        event_type = event.get("type")
        message = event.get("message", {})
        content_chars = _qoder_content_chars(message.get("content", []))

        if event_type == "assistant":
            self.input_tokens += math.ceil(self.context_chars / 4.0)
            self.output_tokens += math.ceil(content_chars / 4.0)
            self.context_chars += content_chars
            self.turns += 1
        elif event_type == "user" and self.turns:
            # The initial prompt is supplied separately. User events after the
            # first assistant message are tool results fed into the next turn.
            self.context_chars += content_chars

    def result(self) -> Dict[str, int]:
        return {
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "total_tokens": self.input_tokens + self.output_tokens,
            "num_turns": self.turns,
        }


def normalize_qoder_result(
    result: Dict,
    estimate: Dict[str, int],
    qodercli_version: Optional[str] = None,
) -> Dict:
    """Add an explicit estimate only when Qoder supplied no real token usage."""
    normalized = dict(result)
    model_usage = normalized.get("modelUsage", {})
    raw_usage = normalized.get("usage", {})
    if not isinstance(model_usage, dict):
        model_usage = {}
    reported_tokens = sum(
        model.get("inputTokens", 0)
        + model.get("outputTokens", 0)
        + model.get("cacheReadInputTokens", 0)
        + model.get("cacheCreationInputTokens", 0)
        for model in model_usage.values()
        if isinstance(model, dict)
    )
    reported_tokens += (
        raw_usage.get("input_tokens", 0)
        + raw_usage.get("output_tokens", 0)
        + raw_usage.get("cache_read_input_tokens", 0)
        + raw_usage.get("cache_creation_input_tokens", 0)
        if isinstance(raw_usage, dict)
        else 0
    )

    if not reported_tokens:
        for key in ("input_tokens", "output_tokens", "total_tokens"):
            normalized[key] = estimate.get(key, 0)
        normalized.setdefault("num_turns", estimate.get("num_turns", 0))
        normalized["token_counts_estimated"] = True
    else:
        normalized["token_counts_estimated"] = False

    reported_cost = (
        normalized.get("cost_usd", 0)
        or normalized.get("total_cost_usd", 0)
        or sum(
            model.get("costUSD", 0)
            for model in model_usage.values()
            if isinstance(model, dict)
        )
    )
    normalized["cost_available"] = bool(reported_cost)
    if not reported_cost:
        normalized["cost_note"] = (
            "Qoder uses Credits and the CLI does not report per-run USD cost"
        )
    if qodercli_version:
        normalized["qodercli_version"] = qodercli_version
    return normalized


def parse_vibe_event(event: Dict) -> ParsedEvent:
    role = event.get("role", "")
    content = event.get("content", "")
    return ParsedEvent(
        text=content if content and role != "system" else "",
        turn_completed=role == "assistant",
        log_raw=bool(content),
    )


def parse_opencode_event(event: Dict) -> ParsedEvent:
    event_type = event.get("type", "")
    if event_type == "text":
        return ParsedEvent(text=event.get("content", event.get("text", "")))
    if event_type == "tool_call":
        name = event.get("name", event.get("tool", "unknown"))
        return ParsedEvent(text=f"\n[Tool: {name}]\n", tool_calls=1)
    if event_type == "step_finish":
        part = event.get("part", {})
        tokens = part.get("tokens", {})
        cache = tokens.get("cache", {})
        return ParsedEvent(
            usage={
                "input_tokens": tokens.get("input", 0),
                "output_tokens": tokens.get("output", 0),
                "reasoning_tokens": tokens.get("reasoning", 0),
                "cache_read_tokens": cache.get("read", 0),
                "cache_write_tokens": cache.get("write", 0),
                "cost_usd": part.get("cost", 0),
            },
            turn_completed=True,
            log_raw=True,
            finish_reason=part.get("reason"),
        )
    if event_type == "error":
        error = event.get("error", {})
        if isinstance(error, dict):
            data = error.get("data", {})
            message = data.get("message") or error.get("message")
        else:
            message = str(error) if error else None
        message = message or json.dumps(event)
        return ParsedEvent(error=str(message), log_raw=True)
    return ParsedEvent(log_raw=True)


def parse_pi_event(event: Dict) -> ParsedEvent:
    event_type = event.get("type", "")
    if event_type == "message_end":
        message = event.get("message", {})
        if message.get("role") != "assistant":
            return ParsedEvent()
        usage = message.get("usage", {})
        cost = usage.get("cost", {})
        total_cost = cost.get("total", 0) if isinstance(cost, dict) else cost
        return ParsedEvent(
            usage={
                "input_tokens": usage.get("input", 0),
                "output_tokens": usage.get("output", 0),
                "cache_read_tokens": usage.get("cacheRead", 0),
                "cache_write_tokens": usage.get("cacheWrite", 0),
                "cost_usd": total_cost or 0,
            },
            provider_id=message.get("provider"),
            model_id=message.get("model"),
            turn_completed=True,
        )
    if event_type == "message_update":
        update = event.get("assistantMessageEvent", {})
        if update.get("type") == "text_delta":
            return ParsedEvent(text=update.get("delta", ""))
        if update.get("type") == "tool_call_start":
            return ParsedEvent(text=f"\n[Tool: {update.get('name', 'unknown')}]\n")
    return ParsedEvent(log_raw=event_type == "agent_end")


def codex_usage_from_obj(obj: Dict) -> Dict[str, int]:
    if not isinstance(obj, dict):
        return {}
    input_tokens = (
        obj.get("input_tokens")
        or obj.get("prompt_tokens")
        or obj.get("input")
        or obj.get("prompt")
        or 0
    )
    output_tokens = (
        obj.get("output_tokens")
        or obj.get("completion_tokens")
        or obj.get("output")
        or obj.get("completion")
        or 0
    )
    reasoning_tokens = (
        obj.get("reasoning_output_tokens")
        or obj.get("reasoning_tokens")
        or obj.get("reasoning")
        or 0
    )
    cache_read = (
        obj.get("cached_input_tokens")
        or obj.get("cache_read_input_tokens")
        or obj.get("cache_read_tokens")
        or obj.get("cached")
        or 0
    )
    total_tokens = obj.get("total_tokens") or obj.get("total") or (
        input_tokens + output_tokens
    )
    return {
        "input_tokens": int(input_tokens or 0),
        "output_tokens": int(output_tokens or 0),
        "total_tokens": int(total_tokens or 0),
        "reasoning_tokens": int(reasoning_tokens or 0),
        "cache_read_tokens": int(cache_read or 0),
    }


def find_codex_usage_objects(event: Dict) -> List[Dict]:
    found = []

    def visit(value):
        if isinstance(value, dict):
            if isinstance(value.get("usage"), dict):
                found.append(value["usage"])
            if any(
                key in value
                for key in (
                    "input_tokens",
                    "prompt_tokens",
                    "output_tokens",
                    "completion_tokens",
                    "total_tokens",
                )
            ):
                found.append(value)
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(event)
    return found


def extract_codex_session_id(event: Dict) -> Optional[str]:
    for key in ("session_id", "thread_id", "conversation_id", "id"):
        value = event.get(key)
        if isinstance(value, str) and value:
            return value
    for key in ("session", "thread", "conversation"):
        value = event.get(key)
        if isinstance(value, dict):
            nested = extract_codex_session_id(value)
            if nested:
                return nested
    return None


def extract_codex_readable_event(event: Dict) -> Optional[str]:
    event_type = str(event.get("type", event.get("event", "")))

    def text_from_item(item):
        if not isinstance(item, dict):
            return None
        item_type = str(item.get("type", item.get("kind", ""))).lower()
        if str(item.get("role", "")).lower() == "user":
            return None
        if any(name in item_type for name in ("tool", "command")):
            name = item.get("name") or item.get("command") or item_type
            return f"\n[Tool: {name}]\n"
        if any(name in item_type for name in ("assistant", "agent", "message")):
            for key in ("text", "content", "message", "delta"):
                value = item.get(key)
                if isinstance(value, str) and value:
                    return value
                if isinstance(value, list):
                    pieces = [
                        part.get("text") or part.get("content")
                        for part in value
                        if isinstance(part, dict)
                    ]
                    if any(pieces):
                        return "".join(piece for piece in pieces if piece)
        return None

    item_text = text_from_item(event.get("item"))
    if item_text:
        return item_text
    if "message" in event_type or "agent" in event_type or "assistant" in event_type:
        for key in ("text", "content", "message", "delta"):
            value = event.get(key)
            if isinstance(value, str) and value:
                return value
    return None

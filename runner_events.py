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
        return ParsedEvent(text=f"\n[Tool: {name}]\n")
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

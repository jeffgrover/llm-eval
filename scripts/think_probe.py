"""One-off probe: which request-level switch disables Qwen 3.8 thinking in LM Studio?"""

import json
import urllib.request

URL = "http://localhost:1234/v1/chat/completions"
PROMPT = (
    "A farmer has 3 fields. Field A yields 127 kg of wheat per acre, "
    "B yields 94, C yields 143. He has 58 acres, must use at least 10 in each, "
    "and has 6100 kg of storage. How should he allocate acres to maximize yield? "
    "Show brief reasoning."
)


def probe(label: str, content: str, extra: dict) -> None:
    body = {
        "model": "qwen3.8-27b",
        "messages": [{"role": "user", "content": content}],
        "max_tokens": 1500,
        "stream": False,
        **extra,
    }
    req = urllib.request.Request(
        URL,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.load(resp)
    except Exception as exc:
        print(f"{label}: REQUEST FAILED: {exc}")
        return
    choice = data["choices"][0]
    message = choice["message"]
    reasoning = message.get("reasoning_content") or message.get("reasoning") or ""
    usage = data.get("usage", {})
    print(
        f"{label}: finish={choice.get('finish_reason')} "
        f"completion_tokens={usage.get('completion_tokens')} "
        f"reasoning_chars={len(reasoning)} "
        f"reasoning_preview={reasoning[:60]!r} "
        f"content_preview={(message.get('content') or '')[:60]!r}"
    )


probe("baseline (xhigh)    ", PROMPT, {})
probe("budget=0            ", PROMPT, {"thinking_budget_tokens": 0})
probe("budget=256          ", PROMPT, {"thinking_budget_tokens": 256})
probe("budget=1024         ", PROMPT, {"thinking_budget_tokens": 1024})

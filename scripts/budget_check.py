"""One-off: baseline-only probe to tell 1024 vs 8192 reasoning budget apart."""
import json
import sys
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PROMPT = (
    "A farmer has 3 fields. Field A yields 127 kg of wheat per acre, "
    "B yields 94, C yields 143. He has 58 acres, must use at least 10 in each, "
    "and has 6100 kg of storage. How should he allocate acres to maximize yield? "
    "Show brief reasoning."
)
body = {
    "model": "qwen3.8-27b",
    "messages": [{"role": "user", "content": PROMPT}],
    "max_tokens": 1500,
    "stream": False,
}
req = urllib.request.Request(
    "http://localhost:1234/v1/chat/completions",
    data=json.dumps(body).encode("utf-8"),
    headers={"Content-Type": "application/json"},
)
with urllib.request.urlopen(req, timeout=280) as resp:
    data = json.load(resp)
choice = data["choices"][0]
message = choice["message"]
reasoning = message.get("reasoning_content") or message.get("reasoning") or ""
usage = data.get("usage", {})
print("finish:", choice.get("finish_reason"))
print("completion_tokens:", usage.get("completion_tokens"))
print("reasoning_chars:", len(reasoning))
print("verdict:", "BUDGET > 1500 (8192 active)" if len(reasoning) > 3200 else "STILL CAPPED ~1024")

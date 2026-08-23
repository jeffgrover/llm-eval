"""One-off: single fast probe of the live server; prints reasoning + content head."""
import json
import sys
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

body = {
    "model": "qwen3.8-27b",
    "messages": [{"role": "user", "content": "What is 3+4? Answer in one word."}],
    "max_tokens": 300,
}
req = urllib.request.Request(
    "http://localhost:1234/v1/chat/completions",
    data=json.dumps(body).encode(),
    headers={"Content-Type": "application/json"},
)
with urllib.request.urlopen(req, timeout=280) as r:
    data = json.load(r)
msg = data["choices"][0]["message"]
print("finish:", data["choices"][0].get("finish_reason"))
print("REASONING:", (msg.get("reasoning_content") or "")[:600])
print("CONTENT:", (msg.get("content") or "")[:300])

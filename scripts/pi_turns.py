"""One-off: pi attempt — turn timings, reasoning usage, ALL text snippets."""
import json
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

path = sys.argv[1]
turns = []
texts = []
with open(path, encoding="utf-8", errors="replace") as fh:
    for ln in fh:
        ln = ln.strip()
        if not ln.startswith("{"):
            continue
        try:
            ev = json.loads(ln)
        except Exception:
            continue
        etype = ev.get("type")
        if etype == "turn_end":
            usage = ev.get("usage") or {}
            turns.append((ev.get("timestamp"), usage))
        elif etype == "message_end":
            msg = ev.get("message") or {}
            role = msg.get("role")
            content = msg.get("content")
            parts = content if isinstance(content, list) else [{"type": "text", "text": content if isinstance(content, str) else ""}]
            for part in parts:
                if not isinstance(part, dict):
                    continue
                if part.get("type") == "text" and role == "assistant":
                    texts.append((part.get("text") or "").strip())

print(f"turns completed: {len(turns)}")
tot_in = tot_out = tot_reason = 0
for ts, usage in turns:
    i, o, r = usage.get("input", 0), usage.get("output", 0), usage.get("reasoning", 0)
    tot_in += i; tot_out += o; tot_reason += r
    print(f"  turn_end ts={ts} in={i} out={o} reasoning={r}")
print(f"TOTALS in={tot_in} out={tot_out} reasoning={tot_reason}")
print(f"\nassistant text messages: {len(texts)}")
for i, t in enumerate(texts):
    print(f"--- [{i}] {t[:300].replace(chr(10), ' | ')}")

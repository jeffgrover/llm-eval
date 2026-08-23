"""One-off: summarize pi-wiggum attempt JSONL (tools + text snippets)."""
import json
import sys
from collections import Counter

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

path = sys.argv[1]
tools = Counter()
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
        if etype == "tool_execution_start":
            name = ev.get("toolName") or ev.get("name") or (ev.get("tool") or {}).get("name") or "?"
            arg = json.dumps(ev.get("args") or ev.get("input") or {})[:120]
            tools[name] += 1
            print(f"TOOL {name} args={arg}")
        elif etype == "message_end":
            msg = ev.get("message") or {}
            content = msg.get("content")
            if isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "text":
                        texts.append((part.get("text") or "")[:200].replace("\n", " "))
            elif isinstance(content, str):
                texts.append(content[:200].replace("\n", " "))

print("\ntool counts:", dict(tools))
print("\nlast 3 text outputs:")
for t in texts[-3:]:
    print("  -", t)

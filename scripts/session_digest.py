"""One-off: summarize an opencode CHAT_SESSION.TXT event stream."""
import json
import sys

path = sys.argv[1] if len(sys.argv) > 1 else r"evals/opencode_qwen3_8-27b_office_prompt_v3/CHAT_SESSION.TXT"
limit = int(sys.argv[2]) if len(sys.argv) > 2 else 200

with open(path, encoding="utf-8", errors="replace") as fh:
    lines = fh.read().splitlines()

count = 0
for ln in lines:
    ln = ln.strip()
    if not ln.startswith("{"):
        continue
    try:
        event = json.loads(ln)
    except Exception:
        continue
    part = event.get("part", {})
    ptype = part.get("type")
    if ptype == "tool":
        state = part.get("state", {})
        inp = state.get("input") or part.get("input") or {}
        snippet = json.dumps(inp)[:160]
        print(f"TOOL {part.get('tool')} status={state.get('status')} input={snippet}")
    elif ptype == "text":
        text = (part.get("text") or "").replace("\n", " ")
        print(f"TEXT: {text[:220]}")
    elif ptype == "step-finish":
        tokens = part.get("tokens", {})
        print(f"  step-finish reason={part.get('reason')} out={tokens.get('output')} reasoning={tokens.get('reasoning')}")
    count += 1
    if count >= limit:
        break

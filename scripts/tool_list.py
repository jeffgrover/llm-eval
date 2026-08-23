"""One-off: list tool-call events from an opencode CHAT_SESSION.TXT."""
import json
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

path = sys.argv[1] if len(sys.argv) > 1 else r"evals\opencode_qwen3_8-27b_office_prompt_v3\CHAT_SESSION.TXT"
with open(path, encoding="utf-8", errors="replace") as fh:
    lines = fh.read().splitlines()

for ln in lines:
    ln = ln.strip()
    if not ln.startswith("{") or '"tool"' not in ln:
        continue
    try:
        event = json.loads(ln)
    except Exception:
        continue
    part = event.get("part", {})
    if part.get("type") != "tool":
        continue
    state = part.get("state", {})
    inp = json.dumps(state.get("input") or {})[:150]
    print(f"TOOL {part.get('tool')} status={state.get('status')} input={inp}")

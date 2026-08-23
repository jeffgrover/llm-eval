"""One-off: dump actual tool commands in suspect runs that mention sibling/reference paths."""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO_ROOT = Path(__file__).resolve().parents[1]

TARGETS = [
    (r"evals\opencode_moonshotai_kimi-k3_office_prompt_v3\CHAT_SESSION.TXT", "tool_use"),
    (r"evals\qoder_MiniMax-M3_office_prompt_v3\QODER_EVENTS.JSONL", "jsonl"),
    (r"evals\qoder_Qwen3_8-Max_office_prompt_v3\QODER_EVENTS.JSONL", "jsonl"),
    (r"evals\pi_deepreinforce-ai_ornith-1_0-35b_elevator_prompt_v3\PI_EVENTS.JSONL", "jsonl"),
    (r"evals\opencode_nemotron-3_5-lightning_elevator_prompt_v3\CHAT_SESSION.TXT", "tool_use"),
]

PATTERN = re.compile(r"(reference[/\\]|evals[/\\])")

for path, kind in TARGETS:
    print(f"\n########## {path}")
    try:
        data = (REPO_ROOT / path).read_text(encoding="utf-8", errors="replace")
    except Exception as exc:
        print("  unreadable:", exc)
        continue
    if kind == "jsonl":
        for ln in data.splitlines():
            if not ln.startswith("{") or not PATTERN.search(ln):
                continue
            try:
                ev = json.loads(ln)
            except Exception:
                continue
            if ev.get("type") != "assistant":
                continue
            content = (ev.get("message") or {}).get("content") or []
            for part in content:
                if isinstance(part, dict) and part.get("type") == "tool_use":
                    inp = json.dumps(part.get("input") or {})
                    if PATTERN.search(inp):
                        print(f"  CMD {part.get('name')}: {inp[:220]}")
    else:
        for ln in data.splitlines():
            if '"tool_use"' in ln and '"bash"' in ln and PATTERN.search(ln):
                m = re.search(r'"command":"((?:[^"\\]|\\.)*)"', ln)
                if m and PATTERN.search(m.group(1)):
                    print("  CMD bash:", m.group(1)[:220])
            elif '"tool_use"' in ln and '"read"' in ln and PATTERN.search(ln):
                m = re.search(r'"filePath":"((?:[^"\\]|\\.)*)"', ln)
                if m and PATTERN.search(m.group(1)):
                    print("  CMD read:", m.group(1)[:220])

"""One-off: strict peek check — qoder runs, excluding own-dir paths."""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO_ROOT = Path(__file__).resolve().parents[1]

TARGETS = [
    (r"evals\qoder_MiniMax-M3_office_prompt_v3\QODER_EVENTS.JSONL", "qoder_MiniMax-M3_office_prompt_v3"),
    (r"evals\qoder_Qwen3_8-Max_office_prompt_v3\QODER_EVENTS.JSONL", "qoder_Qwen3_8-Max_office_prompt_v3"),
    (r"evals\qoder_GLM-5_2_office_prompt_v3\QODER_EVENTS.JSONL", "qoder_GLM-5_2_office_prompt_v3"),
]

for path, own in TARGETS:
    print(f"\n##### {own}")
    found = 0
    for ln in (REPO_ROOT / path).open(encoding="utf-8", errors="replace"):
        if not ln.startswith("{"):
            continue
        try:
            ev = json.loads(ln)
        except Exception:
            continue
        if ev.get("type") != "assistant":
            continue
        for part in (ev.get("message") or {}).get("content") or []:
            if not isinstance(part, dict) or part.get("type") != "tool_use":
                continue
            inp = json.dumps(part.get("input") or {})
            if "reference" not in inp and "evals" not in inp:
                continue
            clean = inp.replace(own, "<OWN>")
            if "reference/" in clean or "reference\\" in clean or ("evals/" in clean and "<OWN>" not in clean.split("evals/")[1][:80]):
                print(f"  {part.get('name')}: {clean[:260]}")
                found += 1
    if not found:
        print("  no foreign reads found")

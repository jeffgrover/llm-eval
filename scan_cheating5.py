"""One-off: strict foreign-path extraction from tool-call args (pi + opencode JSON lines)."""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CMD_RE = re.compile(r'"command"\s*:\s*"((?:[^"\\]|\\.)*)"')
PATH_RE = re.compile(r'"(?:path|filePath|file_path)"\s*:\s*"((?:[^"\\]|\\.)*)"')

TARGETS = {
    "pi-wiggum_qwen3_8-27b_office_prompt_wiggum": ["PI_WIGGUM_ATTEMPT_001.JSONL"],
    "pi_deepreinforce-ai_ornith-1_0-35b_elevator_prompt_v3": ["PI_EVENTS.JSONL"],
    "pi_qwen3_6-35b-a3b_elevator_prompt_v3": ["PI_EVENTS.JSONL", "CHAT_SESSION.TXT"],
    "pi-wiggum_agents-a1_elevator_prompt_v3": ["PI_WIGGUM_ATTEMPT_001.JSONL"],
    "pi-wiggum_Agents-A1-MTPLX-Q4_office_prompt_wiggum": ["PI_WIGGUM_ATTEMPT_001.JSONL", "PI_WIGGUM_ATTEMPT_002.JSONL"],
    "pi-wiggum_qwen3_6-35b-a3b_elevator_prompt_wiggum": ["PI_WIGGUM_ATTEMPT_001.JSONL"],
    "pi-wiggum_gemma-4-e4b_elevator_prompt_wiggum": ["PI_WIGGUM_ATTEMPT_001.JSONL"],
    "pi-wiggum_muse-glimmer-30b_elevator_prompt_wiggum": ["PI_WIGGUM_ATTEMPT_001.JSONL"],
    "pi-wiggum_agents-a1_office_prompt_wiggum": ["PI_WIGGUM_ATTEMPT_001.JSONL", "PI_WIGGUM_ATTEMPT_002.JSONL"],
}

for own, fnames in TARGETS.items():
    print(f"\n##### {own}")
    hits = []
    for fname in fnames:
        p = Path("evals") / own / fname
        if not p.exists():
            continue
        data = p.read_text(encoding="utf-8", errors="replace")
        frags = CMD_RE.findall(data) + PATH_RE.findall(data)
        for frag in frags:
            try:
                frag = json.loads(f'"{frag}"')
            except Exception:
                frag = frag.replace('\\"', '"')
            low = frag.replace("\\", "/")
            if "reference/" in low or "reference\\" in frag:
                hits.append((fname, "REFERENCE", frag[:160]))
            for m in re.finditer(r"evals/([A-Za-z0-9_\-\.]+)/?", low):
                if m.group(1) != own:
                    hits.append((fname, "SIBLING", frag[:160]))
                    break
    seen = set()
    if not hits:
        print("  CLEAN (no foreign tool-call paths)")
    for fname, kind, frag in hits:
        key = (kind, frag[:80])
        if key in seen:
            continue
        seen.add(key)
        print(f"  {kind} [{fname}] {frag}")

"""One-off: scan all eval transcripts for evidence of peeking at sibling runs or reference/."""
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path("evals")
TRANSCRIPT_SUFFIXES = (".TXT", ".JSONL")

eval_dirs = sorted(d for d in ROOT.iterdir() if d.is_dir())
all_names = [d.name for d in eval_dirs]

for d in eval_dirs:
    own = d.name
    ref_hits = []
    sib_hits = []
    files = [f for f in d.iterdir() if f.suffix.upper() in TRANSCRIPT_SUFFIXES]
    if not files:
        print(f"{own}: (no transcripts)")
        continue
    for f in files:
        try:
            data = f.read_text(encoding="utf-8", errors="replace")
        except Exception as exc:
            print(f"  !! unreadable {f.name}: {exc}")
            continue
        for m in re.finditer(r"reference[/\\][A-Za-z0-9_\-\./\\]{0,60}", data):
            ref_hits.append((f.name, m.group(0)[:90]))
        for name in all_names:
            if name == own:
                continue
            for m in re.finditer(re.escape(name), data):
                sib_hits.append((f.name, name))
    if not ref_hits and not sib_hits:
        print(f"{own}: CLEAN")
        continue
    print(f"{own}: REFERENCE={len(ref_hits)} SIBLING={len(sib_hits)}")
    seen = set()
    for fname, frag in ref_hits[:5]:
        key = frag[:40]
        if key in seen:
            continue
        seen.add(key)
        print(f"    ref  [{fname}] {frag}")
    seen = set()
    for fname, name in sib_hits[:8]:
        if name in seen:
            continue
        seen.add(name)
        print(f"    sib  [{fname}] -> {name}")

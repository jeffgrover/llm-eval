"""One-off: classify sibling/reference mentions in eval transcripts as access vs listing.

ACCESS = cat/head/sed/less/tail/diff/cp/mv/rm of, or read/edit/write/glob tool on,
         a file under a sibling eval dir or reference/.
LIST   = mere ls/dir/find mentions.
"""
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1] / "evals"
TRANSCRIPT_SUFFIXES = (".TXT", ".JSONL")
ACCESS_RE = re.compile(
    r"(\bcat\b|\bhead\b|\btail\b|\bsed\b|\bless\b|\bmore\b|\bgrep\b|\bdiff\b|\bcp\b|\bmv\b|\brm\b|read_file|\"read\"|\"edit\"|\"write\"|\"glob\"|Get-Content|Select-String)",
    re.IGNORECASE,
)

eval_dirs = sorted(d for d in ROOT.iterdir() if d.is_dir())
all_names = [d.name for d in eval_dirs]

for d in eval_dirs:
    own = d.name
    files = [f for f in d.iterdir() if f.suffix.upper() in TRANSCRIPT_SUFFIXES]
    if not files:
        continue
    access = []
    listing = []
    for f in files:
        try:
            lines = f.read_text(encoding="utf-8", errors="replace").splitlines()
        except Exception:
            continue
        for i, line in enumerate(lines):
            targets = []
            for m in re.finditer(r"reference[/\\][A-Za-z0-9_\-]+", line):
                targets.append(m.group(0))
            for name in all_names:
                if name != own and name in line:
                    targets.append(name)
            if not targets:
                continue
            window = " ".join(lines[max(0, i - 1): i + 2])[:2000]
            kind = "ACCESS" if ACCESS_RE.search(window) else "LIST"
            entry = (f.name, kind, targets[0], line.strip()[:160])
            (access if kind == "ACCESS" else listing).append(entry)
    if not access and not listing:
        continue
    print(f"\n=== {own}: ACCESS={len(access)} LIST={len(listing)}")
    seen = set()
    for fname, kind, tgt, frag in access[:6]:
        key = (kind, tgt, frag[:60])
        if key in seen:
            continue
        seen.add(key)
        print(f"    {kind} [{fname}] {tgt}: {frag}")
    for fname, kind, tgt, frag in listing[:3]:
        key = (kind, tgt, frag[:60])
        if key in seen:
            continue
        seen.add(key)
        print(f"    {kind} [{fname}] {tgt}: {frag}")

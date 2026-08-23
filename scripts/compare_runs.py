"""One-off: compare runtime/static check outcomes across eval runs."""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

root = Path(r"c:\Users\Jeff\Code\llm-eval\evals")
prefixes = tuple(sys.argv[1:]) if len(sys.argv) > 1 else ("pi",)

rows = []
for d in sorted(root.iterdir()):
    if not d.is_dir() or not d.name.startswith(prefixes):
        continue
    rt = d / "runtime_check.json"
    st = d / "static_check.json"
    rdata = json.loads(rt.read_text(encoding="utf-8")) if rt.exists() else {}
    sdata = json.loads(st.read_text(encoding="utf-8")) if st.exists() else {}
    result = None
    for cand in d.iterdir():
        if cand.name.endswith("_RESULT.JSON"):
            result = json.loads(cand.read_text(encoding="utf-8"))
            break
    rows.append((d.name, rdata, sdata, result))

for name, rdata, sdata, result in rows:
    turns = result.get("num_turns") if result else "?"
    total = result.get("total_tokens") if result else "?"
    print(f"\n== {name}")
    if rdata:
        print(
            f"   runtime: frames={rdata.get('animation_frames')} "
            f"objects={rdata.get('scene_object_count')} changes={rdata.get('dynamic_changes')} "
            f"nonblank={rdata.get('nonblank_canvas')} pageerr={len(rdata.get('page_errors', []))} "
            f"consoleerr={len(rdata.get('console_errors', []))} staticerr={len(rdata.get('static_errors', []))}"
        )
        if rdata.get("page_errors"):
            print("   page_errors:", rdata["page_errors"][:3])
    else:
        print("   runtime: NO runtime_check.json")
    if sdata:
        errs = sdata.get("errors") or sdata.get("static_errors") or []
        print(f"   static: {len(errs)} errors")
    print(f"   result: turns={turns} total_tokens={total}")

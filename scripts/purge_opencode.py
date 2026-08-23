"""One-off: inspect then purge opencode state for the llm-eval office project."""
import json
import sqlite3
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DB = r"C:\Users\Jeff\.local\share\opencode\opencode.db"
DIRECTORY = r"C:\Users\Jeff\Code\llm-eval\evals\opencode_qwen3_8-27b_office_prompt_v3"
PURGE = "--purge" in sys.argv
LIST = "--list" in sys.argv

con = sqlite3.connect(DB)
cur = con.cursor()

tables = [r[0] for r in cur.execute("select name from sqlite_master where type='table'")]
session_tables = [
    t
    for t in tables
    if "session_id" in [c[1] for c in cur.execute(f"pragma table_info({t})")]
]

pids = [
    r[0]
    for r in cur.execute(
        "select project_id from project_directory where directory like ?",
        ("%llm-eval%",),
    )
]
print("project ids for directory:", pids)

if LIST:
    print("\nall project_directory rows:")
    for pid, d, t in cur.execute(
        "select project_id, directory, type from project_directory"
    ):
        print(" ", pid, t, d)
    print("\nsessions matching %qwen3%:")
    for sid, pid, d, title in cur.execute(
        "select id, project_id, directory, title from session where directory like '%qwen3%'"
    ):
        print(" ", sid, pid, d, (title or "")[:40])

for pid in pids:
    sessions = cur.execute(
        "select id, title, tokens_input, tokens_output, tokens_reasoning,"
        " time_compacting, time_archived, metadata, parent_id from session where project_id=?"
        " and directory=? order by time_created",
        (pid, DIRECTORY.replace('\\', '/')),
    ).fetchall()
    print(f"\nproject {pid}: {len(sessions)} sessions")
    for sid, title, tin, tout, treason, tcomp, tarch, meta, parent in sessions:
        print(
            f"  {sid} parent={parent} title={(title or '')[:30]!r} in={tin}"
            f" out={tout} reason={treason} compacting={tcomp} archived={tarch}"
        )
        if meta:
            print("     metadata:", json.dumps(json.loads(meta))[:300])
    if LIST:
        for sid, *_ in sessions:
            print(f"\n  events for {sid}:")
            try:
                for (edata,) in cur.execute(
                    "select data from event where session_id=? order by rowid", (sid,)
                ):
                    e = json.loads(edata)
                    etype = e.get("type") or e.get("name")
                    if etype and ('error' in str(etype).lower() or 'compact' in str(etype).lower() or 'summar' in str(etype).lower() or 'overflow' in str(etype).lower() or 'exceed' in str(edata).lower()[:2000]):
                        print("   ", json.dumps(e)[:500])
            except Exception as exc:
                print("    event query failed:", exc)
    if PURGE:
        sids = [s[0] for s in sessions]
        for table in session_tables:
            for sid in sids:
                cur.execute(f"delete from {table} where session_id=?", (sid,))
        for sid in sids:
            cur.execute("delete from session where id=?", (sid,))
        con.commit()
        print("PURGED", len(sids), "sessions (project row kept)")

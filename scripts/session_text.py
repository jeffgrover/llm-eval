"""One-off: dump the assistant text parts of an opencode session from its sqlite DB."""
import json
import sqlite3
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DB = r"C:\Users\Jeff\.local\share\opencode\opencode.db"
SESSION = sys.argv[1] if len(sys.argv) > 1 else "ses_fd4f348f0ffe5YyvURi7nTb1lA"

con = sqlite3.connect(DB)
cur = con.cursor()
tables = [r[0] for r in cur.execute("select name from sqlite_master where type='table'")]
print("tables:", tables)

for table in ("part", "message"):
    if table not in tables:
        continue
    cols = [r[1] for r in cur.execute(f"pragma table_info({table})")]
    print(f"{table} cols:", cols)

rows = cur.execute(
    "select data from part where session_id=? order by rowid", (SESSION,)
).fetchall() if "part" in tables else []
for (data,) in rows:
    d = json.loads(data)
    ptype = d.get("type")
    if ptype == "text":
        print("=== TEXT PART ===")
        print(d.get("text", "")[:3000])
    elif ptype == "reasoning":
        print("=== REASONING (first 400) ===")
        print(d.get("text", "")[:400])
    else:
        print("--- part:", ptype, json.dumps(d)[:200])

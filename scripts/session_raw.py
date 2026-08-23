"""One-off: dump raw message/part rows for an opencode session."""
import json
import sqlite3
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DB = r"C:\Users\Jeff\.local\share\opencode\opencode.db"
SESSION = sys.argv[1] if len(sys.argv) > 1 else "ses_fd4f348f0ffe5YyvURi7nTb1lA"

con = sqlite3.connect(DB)
cur = con.cursor()

print("== messages ==")
for mid, data in cur.execute(
    "select id, data from message where session_id=? order by time_created", (SESSION,)
):
    d = json.loads(data)
    print("---", mid, "role:", d.get("role"), "mode:", d.get("mode"), "agent:", d.get("agent"))
    print(json.dumps(d)[:1800])

print("== parts (type + head) ==")
for pid, data in cur.execute(
    "select id, data from part where session_id=? order by time_created", (SESSION,)
):
    d = json.loads(data)
    print("---", pid, d.get("type"), "|", json.dumps(d)[:400])

print("== context epochs for session ==")
try:
    for row in cur.execute(
        "select * from session_context_epoch where session_id=? order by rowid", (SESSION,)
    ):
        print(row[0] if not isinstance(row[0], (bytes,)) else row[0][:80], str(row)[:600])
except Exception as e:
    print("epoch query failed:", e)

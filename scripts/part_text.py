"""One-off: print the full reasoning text of one part id."""
import json
import sqlite3
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PART = sys.argv[1] if len(sys.argv) > 1 else "prt_02b0d874a001IMbwJpORft68DP"
con = sqlite3.connect(r"C:\Users\Jeff\.local\share\opencode\opencode.db")
for (data,) in con.execute("select data from part where id=?", (PART,)):
    print(json.loads(data)["text"])

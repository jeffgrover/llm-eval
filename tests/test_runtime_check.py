import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent


class RuntimeCheckTests(unittest.TestCase):
    def test_blocked_page_hits_runtime_probe_deadline(self):
        with tempfile.TemporaryDirectory(dir=PROJECT_ROOT) as temp_dir:
            work_dir = Path(temp_dir)
            (work_dir / "index.html").write_text(
                "<html><script>while (true) {}</script></html>",
                encoding="utf-8",
            )
            env = os.environ.copy()
            env["LLM_EVAL_RUNTIME_TIMEOUT_MS"] = "50"

            result = subprocess.run(
                [
                    "node",
                    "-e",
                    (
                        "const { probeWithDeadline } = require('./runtime_check');"
                        "probeWithDeadline(null, 0, process.argv[1], {"
                        "probe: () => new Promise(() => {}),"
                        "exit: code => { process.exitCode = code; }"
                        "});"
                    ),
                    str(work_dir),
                ],
                cwd=PROJECT_ROOT,
                env=env,
                capture_output=True,
                text=True,
                timeout=5,
            )

            self.assertEqual(result.returncode, 124, result.stderr)
            self.assertIn("runtime probe timed out", result.stderr)
            runtime = json.loads(
                (work_dir / "runtime_check.json").read_text(encoding="utf-8")
            )
            self.assertTrue(runtime["timed_out"])
            self.assertIn("hard deadline", runtime["page_errors"][0])


if __name__ == "__main__":
    unittest.main()

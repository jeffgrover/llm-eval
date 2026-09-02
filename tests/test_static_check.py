import json
import subprocess
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent


class StaticCheckTests(unittest.TestCase):
    def run_static_check(self, html: str):
        with tempfile.TemporaryDirectory(dir=PROJECT_ROOT) as temp_dir:
            work_dir = Path(temp_dir)
            (work_dir / "index.html").write_text(html, encoding="utf-8")
            result = subprocess.run(
                ["node", "static_check.js", str(work_dir)],
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True,
            )
            report = json.loads(
                (work_dir / "static_check.json").read_text(encoding="utf-8")
            )
            return result, report

    def test_checks_classic_inline_scripts_in_index_html(self):
        result, report = self.run_static_check(
            "<canvas></canvas><script>const floor = 1; console.log(floor);</script>"
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(report["static_errors"], [])
        self.assertTrue(
            any(item.endswith("index.html:inline-script-1") for item in report["files_checked"])
        )

    def test_reports_inline_script_syntax_errors(self):
        result, report = self.run_static_check(
            "<script>const floor = ;</script>"
        )

        self.assertEqual(result.returncode, 2)
        self.assertTrue(report["static_errors"])
        self.assertIn("index.html:inline-script-1", report["static_errors"][0])


if __name__ == "__main__":
    unittest.main()

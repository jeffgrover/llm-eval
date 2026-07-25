import base64
import re
import tempfile
import unittest
from pathlib import Path

from evaluation_report import format_duration_human, generate_html_report


class EvaluationReportTests(unittest.TestCase):
    def metadata(self):
        return {
            "Hardware": {"Machine": "test-machine"},
            "Software": {"agent": "1.0"},
            "Model": {"Full Name": "test-model", "Provider": "Test"},
            "Tokens": {
                "prompt_tokens": 100,
                "completion_tokens": 50,
                "total_tokens": 150,
                "num_turns": 2,
            },
            "PromptTime": 2.0,
        }

    def test_duration_formatting(self):
        self.assertEqual(format_duration_human(-1), "0.00 sec")
        self.assertEqual(format_duration_human(12.345), "12.35 sec")
        self.assertEqual(format_duration_human(3661), "1h 1m 1.0s")

    def test_report_escapes_prompt_and_renders_metrics(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            (work_dir / "notes.txt").write_text("artifact", encoding="utf-8")

            report_path = generate_html_report(
                work_dir,
                self.metadata(),
                "<script>alert('prompt')</script>",
                duration_seconds=10.0,
                agent_name="codex",
            )
            report = report_path.read_text(encoding="utf-8")

            self.assertIn("Codex CLI", report)
            self.assertIn("&lt;script&gt;alert", report)
            self.assertNotIn("<script>alert('prompt')</script>", report)
            self.assertIn("~5.0 tokens/sec", report)
            self.assertIn("notes.txt", report)

    def test_html_preview_inlines_local_javascript(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            (work_dir / "app.js").write_text(
                "window.previewLoaded = true;",
                encoding="utf-8",
            )
            (work_dir / "index.html").write_text(
                '<html><script src="app.js"></script></html>',
                encoding="utf-8",
            )

            report_path = generate_html_report(
                work_dir,
                self.metadata(),
                "build it",
                duration_seconds=10.0,
                agent_name="codex",
            )
            report = report_path.read_text(encoding="utf-8")
            encoded_match = re.search(
                r"loadHTMLPreview\('index\.html', '([^']+)'\)",
                report,
            )

            self.assertIsNotNone(encoded_match)
            preview = base64.b64decode(encoded_match.group(1)).decode("utf-8")
            self.assertIn("window.previewLoaded = true;", preview)
            self.assertNotIn('src="app.js"', preview)

    def test_estimated_tokens_and_unavailable_cost_are_labeled(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            metadata = self.metadata()
            metadata["Tokens"].update(
                {
                    "token_counts_estimated": True,
                    "cost_available": False,
                    "cost_note": (
                        "Qoder uses Credits and the CLI does not report per-run USD cost"
                    ),
                }
            )

            report_path = generate_html_report(
                Path(temp_dir),
                metadata,
                "build it",
                duration_seconds=10.0,
                agent_name="qoder",
            )
            report = report_path.read_text(encoding="utf-8")

            self.assertIn("Qoder CLI", report)
            self.assertIn("Input (est.):", report)
            self.assertIn("tokens/sec (estimated)", report)
            self.assertIn(">Not reported</span>", report)


if __name__ == "__main__":
    unittest.main()

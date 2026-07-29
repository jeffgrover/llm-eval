import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import generate_index


class ArtifactRetentionTests(unittest.TestCase):
    def test_wiggum_attempt_logs_keep_five_lines_from_each_edge(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            evals_dir = Path(tmpdir) / "evals"
            run_dir = evals_dir / "pi-wiggum_test_elevator_prompt_wiggum"
            run_dir.mkdir(parents=True)
            attempt_path = run_dir / "PI_WIGGUM_ATTEMPT_001.JSONL"
            records = [{"line": number} for number in range(20)]
            attempt_path.write_text(
                "".join(json.dumps(record) + "\n" for record in records),
                encoding="utf-8",
            )

            with patch.object(generate_index, "EVALS_DIR", evals_dir):
                shortened = generate_index.shorten_oversized_artifacts()
                shortened_again = generate_index.shorten_oversized_artifacts()

            retained = [
                json.loads(line)
                for line in attempt_path.read_text(encoding="utf-8").splitlines()
            ]
            self.assertEqual([record["line"] for record in retained[:5]], list(range(5)))
            self.assertTrue(retained[5]["truncated"])
            self.assertIn(generate_index.TRUNCATION_MARKER_PREFIX, retained[5]["message"])
            self.assertEqual(
                [record["line"] for record in retained[6:]],
                list(range(15, 20)),
            )
            self.assertEqual(shortened[0][3], 10)
            self.assertEqual(shortened_again, [])

    def test_small_non_wiggum_artifacts_are_not_shortened(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            evals_dir = Path(tmpdir) / "evals"
            run_dir = evals_dir / "pi_test_elevator_prompt_v3"
            run_dir.mkdir(parents=True)
            events_path = run_dir / "PI_EVENTS.JSONL"
            original = "".join(
                json.dumps({"line": number}) + "\n"
                for number in range(20)
            )
            events_path.write_text(original, encoding="utf-8")

            with patch.object(generate_index, "EVALS_DIR", evals_dir):
                shortened = generate_index.shorten_oversized_artifacts()

            self.assertEqual(shortened, [])
            self.assertEqual(events_path.read_text(encoding="utf-8"), original)

    def test_wiggum_attempt_logs_recompact_an_existing_marker(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            evals_dir = Path(tmpdir) / "evals"
            run_dir = evals_dir / "pi-wiggum_test_elevator_prompt_wiggum"
            run_dir.mkdir(parents=True)
            attempt_path = run_dir / "PI_WIGGUM_ATTEMPT_001.JSONL"
            records = [
                (json.dumps({"line": number}) + "\n").encode("utf-8")
                for number in range(300)
            ]
            existing_marker = generate_index.truncation_marker(
                attempt_path,
                removed_lines=100,
                removed_bytes=1_000,
            )
            attempt_path.write_bytes(
                b"".join(records[:100])
                + existing_marker
                + b"".join(records[200:])
            )

            with patch.object(generate_index, "EVALS_DIR", evals_dir):
                shortened = generate_index.shorten_oversized_artifacts()
                shortened_again = generate_index.shorten_oversized_artifacts()

            retained = [
                json.loads(line)
                for line in attempt_path.read_text(encoding="utf-8").splitlines()
            ]
            self.assertEqual([record["line"] for record in retained[:5]], list(range(5)))
            self.assertIn("removed 290 lines", retained[5]["message"])
            self.assertEqual(
                [record["line"] for record in retained[6:]],
                list(range(295, 300)),
            )
            self.assertEqual(shortened[0][3], 290)
            self.assertEqual(shortened_again, [])


if __name__ == "__main__":
    unittest.main()

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import generate_index
import eval_scanner
from eval_scoring import deterministic_score


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


class EvaluationDiscoveryTests(unittest.TestCase):
    def test_scan_ignores_empty_and_server_log_only_directories(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            evals_dir = Path(tmpdir) / "evals"
            (evals_dir / "pi_empty_elevator_prompt").mkdir(parents=True)
            log_only = evals_dir / "vibe_log-only_elevator_prompt"
            log_only.mkdir()
            (log_only / "SERVER.LOG").write_text("server output", encoding="utf-8")

            with patch.object(eval_scanner, "EVALS_DIR", evals_dir):
                evaluations = generate_index.scan_evaluations()

            self.assertEqual(evaluations, [])

    def test_scan_keeps_partial_run_with_any_non_server_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            evals_dir = Path(tmpdir) / "evals"
            partial = evals_dir / "opencode_partial_elevator_prompt"
            nested = partial / "src"
            nested.mkdir(parents=True)
            (partial / "SERVER.LOG").write_text("server output", encoding="utf-8")
            (nested / "person.js").write_text("// partial", encoding="utf-8")

            with patch.object(eval_scanner, "EVALS_DIR", evals_dir):
                evaluations = generate_index.scan_evaluations()

            self.assertEqual(len(evaluations), 1)
            self.assertEqual(evaluations[0]["Path"], partial)


class SafetyScoringTests(unittest.TestCase):
    def test_doom_loop_result_is_flagged_and_capped(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            (work_dir / "index.html").write_text(
                '<canvas></canvas><script src="person.js"></script>'
                '<script src="elevator.js"></script>',
                encoding="utf-8",
            )
            (work_dir / "person.js").write_text(
                "class Person { walk() {} }", encoding="utf-8"
            )
            (work_dir / "elevator.js").write_text(
                "class Elevator { SCAN() { this.queue = []; } }",
                encoding="utf-8",
            )
            score = deterministic_score(
                {
                    "Path": work_dir,
                    "HasReport": True,
                    "Result": {"terminal_reason": "doom_loop"},
                    "Metrics": {
                        "success": False,
                        "error": True,
                        "terminal_reason": "doom_loop",
                        "total_tokens": 100,
                    },
                    "Runtime": {
                        "loaded": True,
                        "canvas_count": 1,
                        "nonblank_canvas": True,
                        "animation_frames": 3,
                        "scene_object_count": 3,
                        "dynamic_changes": 1,
                    },
                    "Prompt": "elevator_prompt_v3",
                }
            )

            self.assertLessEqual(score["total"], 35)
            self.assertIn("Doom loop detected", score["flags"])


if __name__ == "__main__":
    unittest.main()

import json
import tempfile
import unittest
from pathlib import Path

from evaluate_agent import CHAT_SESSION_FILENAME, SERVER_LOG_FILENAME
from evaluation_metrics import (
    CLAUDE_RESULT_FILENAME,
    CRUSH_RESULT_FILENAME,
    GEMINI_RESULT_FILENAME,
    OPENCODE_RESULT_FILENAME,
    PI_WIGGUM_RESULT_FILENAME,
    QODER_RESULT_FILENAME,
    TokenUsageCollector,
    load_run_metrics,
)
from generate_index import parse_metrics


class TokenUsageCollectorTests(unittest.TestCase):
    def collect(self, work_dir: Path):
        return TokenUsageCollector.collect(
            work_dir / SERVER_LOG_FILENAME,
            work_dir / CHAT_SESSION_FILENAME,
        )

    def test_standard_result_metrics_take_precedence_over_logs(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            (work_dir / OPENCODE_RESULT_FILENAME).write_text(
                json.dumps(
                    {
                        "input_tokens": 120,
                        "output_tokens": 30,
                        "total_tokens": 150,
                        "cache_read_tokens": 15,
                        "cost_usd": 0.25,
                        "num_turns": 3,
                    }
                ),
                encoding="utf-8",
            )
            (work_dir / SERVER_LOG_FILENAME).write_text(
                '{"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}',
                encoding="utf-8",
            )

            self.assertEqual(
                self.collect(work_dir),
                {
                    "prompt_tokens": 120,
                    "completion_tokens": 30,
                    "total_tokens": 150,
                    "cache_read_tokens": 15,
                    "cost_usd": 0.25,
                    "num_turns": 3,
                },
            )

    def test_crush_result_metrics_are_reported(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            (work_dir / CRUSH_RESULT_FILENAME).write_text(
                json.dumps(
                    {
                        "input_tokens": 200,
                        "output_tokens": 40,
                        "total_tokens": 240,
                        "cost_usd": 0.05,
                        "num_turns": 2,
                        "tool_calls": 3,
                        "finish_reasons": ["tool_use", "stop"],
                    }
                ),
                encoding="utf-8",
            )

            self.assertEqual(
                self.collect(work_dir),
                {
                    "prompt_tokens": 200,
                    "completion_tokens": 40,
                    "total_tokens": 240,
                    "cost_usd": 0.05,
                    "num_turns": 2,
                    "tool_calls": 3,
                    "finish_reasons": ["tool_use", "stop"],
                },
            )

    def test_gemini_turns_match_between_report_and_dashboard_paths(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            (work_dir / GEMINI_RESULT_FILENAME).write_text(
                json.dumps(
                    {
                        "status": "success",
                        "stats": {
                            "input_tokens": 100,
                            "output_tokens": 20,
                            "total_tokens": 120,
                            "tool_calls": 28,
                        },
                        "num_turns": 29,
                    }
                ),
                encoding="utf-8",
            )

            report_usage = self.collect(work_dir)
            dashboard_metrics = load_run_metrics(work_dir)

            self.assertEqual(report_usage["num_turns"], 29)
            self.assertEqual(dashboard_metrics.num_turns, 29)
            self.assertEqual(dashboard_metrics.tool_calls, 28)

    def test_wiggum_attempts_are_reported_without_token_metrics(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            (work_dir / PI_WIGGUM_RESULT_FILENAME).write_text(
                json.dumps({"attempts": 2}),
                encoding="utf-8",
            )

            self.assertEqual(
                self.collect(work_dir),
                {
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "total_tokens": 0,
                    "wiggum_attempts": 2,
                },
            )

    def test_claude_usage_aggregates_all_model_cache_reads(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            (work_dir / CLAUDE_RESULT_FILENAME).write_text(
                json.dumps(
                    {
                        "modelUsage": {
                            "primary": {
                                "inputTokens": 10,
                                "cacheCreationInputTokens": 5,
                                "cacheReadInputTokens": 3,
                                "outputTokens": 4,
                            },
                            "secondary": {
                                "inputTokens": 2,
                                "cacheCreationInputTokens": 0,
                                "cacheReadInputTokens": 7,
                                "outputTokens": 1,
                            },
                        }
                    }
                ),
                encoding="utf-8",
            )

            self.assertEqual(
                self.collect(work_dir),
                {
                    "prompt_tokens": 27,
                    "completion_tokens": 5,
                    "total_tokens": 32,
                    "cache_read_tokens": 10,
                },
            )

    def test_chat_log_is_used_when_structured_sources_are_empty(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            (work_dir / CHAT_SESSION_FILENAME).write_text(
                "Tokens used: 42 input, 8 output",
                encoding="utf-8",
            )

            self.assertEqual(
                self.collect(work_dir),
                {
                    "prompt_tokens": 42,
                    "completion_tokens": 8,
                    "total_tokens": 50,
                },
            )

    def test_qoder_estimates_and_unavailable_cost_are_preserved(self):
        result = {
            "modelUsage": {
                "qmodel": {
                    "inputTokens": 0,
                    "outputTokens": 0,
                    "cacheReadInputTokens": 0,
                    "cacheCreationInputTokens": 0,
                    "costUSD": 0,
                }
            },
            "input_tokens": 120,
            "output_tokens": 30,
            "total_tokens": 150,
            "num_turns": 3,
            "token_counts_estimated": True,
            "cost_available": False,
            "cost_note": (
                "Qoder uses Credits and the CLI does not report per-run USD cost"
            ),
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            (work_dir / QODER_RESULT_FILENAME).write_text(
                json.dumps(result),
                encoding="utf-8",
            )

            self.assertEqual(
                self.collect(work_dir),
                {
                    "prompt_tokens": 120,
                    "completion_tokens": 30,
                    "total_tokens": 150,
                    "num_turns": 3,
                    "token_counts_estimated": True,
                    "cost_available": False,
                    "cost_note": (
                        "Qoder uses Credits and the CLI does not report per-run USD cost"
                    ),
                },
            )
            dashboard_metrics = parse_metrics(result)
            self.assertEqual(dashboard_metrics["total_tokens"], 150)
            self.assertTrue(dashboard_metrics["token_counts_estimated"])
            self.assertFalse(dashboard_metrics["cost_available"])

    def test_qoder_real_model_usage_includes_model_cost(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            (work_dir / QODER_RESULT_FILENAME).write_text(
                json.dumps(
                    {
                        "modelUsage": {
                            "qmodel": {
                                "inputTokens": 10,
                                "outputTokens": 2,
                                "cacheReadInputTokens": 3,
                                "cacheCreationInputTokens": 1,
                                "costUSD": 0.04,
                            }
                        },
                        "token_counts_estimated": False,
                        "cost_available": True,
                    }
                ),
                encoding="utf-8",
            )

            self.assertEqual(
                self.collect(work_dir),
                {
                    "prompt_tokens": 14,
                    "completion_tokens": 2,
                    "total_tokens": 16,
                    "cache_read_tokens": 3,
                    "cost_usd": 0.04,
                    "token_counts_estimated": False,
                    "cost_available": True,
                },
            )

    def test_safety_termination_flows_to_report_and_dashboard_metrics(self):
        result = {
            "input_tokens": 100,
            "output_tokens": 20,
            "total_tokens": 120,
            "status": "error",
            "is_error": True,
            "terminal_reason": "doom_loop",
            "termination": {
                "reason": "doom_loop",
                "message": "Repeated read/edit cycle.",
                "evidence": {"cycle_length": 2},
            },
            "warnings": ["Run terminated by safety guardrail."],
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            (work_dir / OPENCODE_RESULT_FILENAME).write_text(
                json.dumps(result), encoding="utf-8"
            )

            report_usage = self.collect(work_dir)
            dashboard_metrics = parse_metrics(result)

            self.assertEqual(report_usage["terminal_reason"], "doom_loop")
            self.assertEqual(report_usage["termination"]["evidence"]["cycle_length"], 2)
            self.assertEqual(dashboard_metrics["terminal_reason"], "doom_loop")
            self.assertTrue(dashboard_metrics["error"])


if __name__ == "__main__":
    unittest.main()

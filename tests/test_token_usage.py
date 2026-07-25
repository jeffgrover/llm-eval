import json
import tempfile
import unittest
from pathlib import Path

from evaluate_agent import CHAT_SESSION_FILENAME, SERVER_LOG_FILENAME
from evaluation_metrics import (
    CLAUDE_RESULT_FILENAME,
    OPENCODE_RESULT_FILENAME,
    PI_WIGGUM_RESULT_FILENAME,
    TokenUsageCollector,
)


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


if __name__ == "__main__":
    unittest.main()

import contextlib
import io
import unittest

from evaluate_agent import build_argument_parser
from run_safety import (
    DEFAULT_DOOM_LOOP_REPEATS,
    DEFAULT_MAX_IDLE_SECONDS,
    DEFAULT_MAX_SECONDS,
    DEFAULT_MAX_TURNS,
)


class CliOptionTests(unittest.TestCase):
    def parse(self, *extra_args):
        return build_argument_parser().parse_args(
            [
                "--agent",
                "codex",
                "--model",
                "test-model",
                "--prompt-file",
                "prompt.txt",
                *extra_args,
            ]
        )

    def test_safe_post_processing_defaults(self):
        args = self.parse()

        self.assertTrue(args.headless)
        self.assertFalse(args.execute_generated_python)

    def test_report_opening_and_python_execution_are_opt_in(self):
        args = self.parse("--open-report", "--execute-generated-python")

        self.assertFalse(args.headless)
        self.assertTrue(args.execute_generated_python)

    def test_headless_and_open_report_are_mutually_exclusive(self):
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                self.parse("--headless", "--open-report")

    def test_lm_studio_load_tuning_options(self):
        args = self.parse(
            "--lms-context-length",
            "16384",
            "--lms-eval-batch-size",
            "128",
            "--lms-flash-attention",
            "--lms-cpu-kv-cache",
        )

        self.assertEqual(args.lms_context_length, 16384)
        self.assertEqual(args.lms_eval_batch_size, 128)
        self.assertTrue(args.lms_flash_attention)
        self.assertTrue(args.lms_cpu_kv_cache)

    def test_run_safety_defaults(self):
        args = self.parse()

        self.assertEqual(args.max_seconds, DEFAULT_MAX_SECONDS)
        self.assertEqual(args.max_idle_seconds, DEFAULT_MAX_IDLE_SECONDS)
        self.assertEqual(args.max_turns, DEFAULT_MAX_TURNS)
        self.assertEqual(args.doom_loop_repeats, DEFAULT_DOOM_LOOP_REPEATS)

    def test_run_safety_options_are_configurable(self):
        args = self.parse(
            "--max-seconds",
            "120",
            "--max-idle-seconds",
            "45",
            "--max-turns",
            "50",
            "--max-total-tokens",
            "100000",
            "--max-cost-usd",
            "2.5",
            "--doom-loop-repeats",
            "8",
            "--doom-loop-max-cycle-length",
            "3",
            "--doom-loop-min-calls",
            "16",
        )

        self.assertEqual(args.max_seconds, 120)
        self.assertEqual(args.max_idle_seconds, 45)
        self.assertEqual(args.max_turns, 50)
        self.assertEqual(args.max_total_tokens, 100000)
        self.assertEqual(args.max_cost_usd, 2.5)
        self.assertEqual(args.doom_loop_repeats, 8)
        self.assertEqual(args.doom_loop_max_cycle_length, 3)
        self.assertEqual(args.doom_loop_min_calls, 16)


if __name__ == "__main__":
    unittest.main()

import contextlib
import io
import unittest

from evaluate_agent import build_argument_parser


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


if __name__ == "__main__":
    unittest.main()

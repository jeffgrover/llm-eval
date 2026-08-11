import sys
import tempfile
import time
import unittest
from pathlib import Path

from evaluation_core import run_streaming_process
from run_safety import RunSafetyTermination, RunTermination


class StreamingProcessTests(unittest.TestCase):
    def test_timeout_is_enforced_while_stdout_remains_open(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            chat_log = work_dir / "CHAT_SESSION.TXT"
            started = time.monotonic()

            result = run_streaming_process(
                cmd=[
                    sys.executable,
                    "-c",
                    "import time; print('started', flush=True); time.sleep(5)",
                ],
                work_dir=work_dir,
                chat_log_path=chat_log,
                timeout=0.05,
            )

            elapsed = time.monotonic() - started
            self.assertTrue(result.timed_out)
            self.assertNotEqual(result.returncode, 0)
            self.assertLess(elapsed, 2)
            self.assertEqual(result.termination.reason, "time_limit")
            self.assertIn("time limit", chat_log.read_text(encoding="utf-8"))

    def test_callback_can_stop_process_with_structured_reason(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            chat_log = work_dir / "CHAT_SESSION.TXT"
            started = time.monotonic()

            def on_line(line, log_file):
                log_file.write(line)
                raise RunSafetyTermination(
                    RunTermination(
                        reason="doom_loop",
                        message="Repeated read/edit cycle detected.",
                        evidence={"cycle_length": 2},
                    )
                )

            result = run_streaming_process(
                cmd=[
                    sys.executable,
                    "-c",
                    "import time; print('tool', flush=True); time.sleep(5)",
                ],
                work_dir=work_dir,
                chat_log_path=chat_log,
                timeout=5,
                on_line=on_line,
            )

            self.assertLess(time.monotonic() - started, 2)
            self.assertEqual(result.termination.reason, "doom_loop")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Repeated read/edit", chat_log.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()

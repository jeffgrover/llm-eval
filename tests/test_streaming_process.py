import sys
import tempfile
import time
import unittest
from pathlib import Path

from evaluation_core import run_streaming_process
from run_safety import RunSafetyTermination, RunTermination


class StreamingProcessTests(unittest.TestCase):
    @unittest.skipUnless(sys.platform.startswith("linux"), "Linux /proc test")
    def test_timeout_kills_descendant_in_a_separate_session(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            chat_log = work_dir / "CHAT_SESSION.TXT"

            result = run_streaming_process(
                cmd=[
                    sys.executable,
                    "-c",
                    (
                        "import subprocess, sys, time; "
                        "child = subprocess.Popen([sys.executable, '-c', "
                        "'import time; time.sleep(5)'], start_new_session=True); "
                        "print(child.pid, flush=True); time.sleep(5)"
                    ),
                ],
                work_dir=work_dir,
                chat_log_path=chat_log,
                timeout=0.05,
                idle_timeout=5,
            )

            child_pid = int(chat_log.read_text(encoding="utf-8").splitlines()[0])
            child_stat = Path(f"/proc/{child_pid}/stat")
            for _ in range(20):
                if not child_stat.exists():
                    break
                try:
                    state = child_stat.read_text(encoding="ascii").split()[2]
                except OSError:
                    break
                if state == "Z":
                    break
                time.sleep(0.01)

            self.assertTrue(result.timed_out)
            if child_stat.exists():
                state = child_stat.read_text(encoding="ascii").split()[2]
                self.assertEqual(state, "Z")

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

    def test_inactivity_timeout_stops_silent_process(self):
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
                timeout=5,
                idle_timeout=0.05,
            )

            self.assertTrue(result.timed_out)
            self.assertLess(time.monotonic() - started, 2)
            self.assertEqual(result.termination.reason, "inactivity_limit")
            self.assertEqual(
                result.termination.evidence["detector"],
                "output_inactivity",
            )
            self.assertIn(
                "without agent process output",
                chat_log.read_text(encoding="utf-8"),
            )

    def test_output_resets_inactivity_timeout(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            chat_log = work_dir / "CHAT_SESSION.TXT"

            result = run_streaming_process(
                cmd=[
                    sys.executable,
                    "-c",
                    (
                        "import time; "
                        "[(print(i, flush=True), time.sleep(0.08)) "
                        "for i in range(5)]"
                    ),
                ],
                work_dir=work_dir,
                chat_log_path=chat_log,
                timeout=2,
                idle_timeout=0.15,
            )

            self.assertEqual(result.returncode, 0)
            self.assertFalse(result.timed_out)
            self.assertIsNone(result.termination)

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

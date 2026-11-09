import socket
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from pi_isolation import PiIsolation


class PiIsolationTests(unittest.TestCase):
    def test_missing_bubblewrap_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            with mock.patch("pi_isolation.shutil.which", return_value=None):
                with self.assertRaisesRegex(RuntimeError, "bubblewrap"):
                    with PiIsolation(Path(directory)):
                        self.fail("Must not launch without isolation")

    @unittest.skipUnless(
        sys.platform.startswith("linux")
        and all(shutil.which(name) for name in ("bwrap", "pi", "node")),
        "Requires Linux, Bubblewrap, Pi, and Node",
    )
    def test_real_boundary_and_pi_startup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            workspace = root / "output"
            workspace.mkdir()
            secret = root / "previous-solution.txt"
            secret.write_text("previous solution")
            (workspace / "outside-link").symlink_to(secret)
            records = ["CHAT_SESSION.TXT", "PI_WIGGUM_ATTEMPT_001.JSONL",
                       "static_check.json", "ISOLATION.JSON"]
            for name in records:
                (workspace / name).write_text("evaluator secret")
            try:
                sandbox = PiIsolation(workspace).__enter__()
            except RuntimeError as exc:
                if "cannot start" in str(exc) and (
                    "Operation not permitted" in str(exc)
                    or "No permissions to create a new namespace" in str(exc)
                ):
                    self.skipTest(str(exc))
                raise
            try:
                listener = socket.socket()
                self.addCleanup(listener.close)
                listener.bind(("127.0.0.1", 0))
                listener.listen(1)
                script = (
                    "import pathlib, socket, json; "
                    f"assert not pathlib.Path({str(secret)!r}).exists(); "
                    "assert not pathlib.Path('/workspace/outside-link').exists(); "
                    f"assert not pathlib.Path({str(Path.home() / 'Code')!r}).exists(); "
                    "assert not pathlib.Path('/workspace/../../static_check.js').exists(); "
                    f"assert all(pathlib.Path('/workspace', n).read_text() == '' for n in {records!r}); "
                    "assert not pathlib.Path('/proc/1/root' + "
                    f"{str(secret)!r}).exists(); "
                    "socket.getaddrinfo('localhost', 80); "
                    f"socket.create_connection({listener.getsockname()!r}, timeout=3).close(); "
                    "pathlib.Path('/workspace/index.html').write_text('created'); "
                    "pathlib.Path.home().joinpath('private.txt').write_text('private')"
                )
                result = subprocess.run(sandbox.command(["/usr/bin/python3", "-c", script]),
                                        capture_output=True, text=True, timeout=15)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual((workspace / "index.html").read_text(), "created")
                self.assertEqual((workspace / "CHAT_SESSION.TXT").read_text(), "evaluator secret")
                result = subprocess.run(sandbox.command(["pi", "--version"]),
                                        capture_output=True, text=True, timeout=20)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertTrue(result.stdout.strip())
            finally:
                sandbox.__exit__(None, None, None)


if __name__ == "__main__":
    unittest.main()

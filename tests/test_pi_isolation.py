import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import windows_sandbox
from pi_isolation import PiIsolation


class PiIsolationTests(unittest.TestCase):
    def test_missing_bubblewrap_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            with (
                mock.patch("pi_isolation.sys.platform", "linux"),
                mock.patch("pi_isolation.shutil.which", return_value=None),
            ):
                with self.assertRaisesRegex(RuntimeError, "bubblewrap"):
                    with PiIsolation(Path(directory)):
                        self.fail("Must not launch without isolation")

    def test_windows_unconfigured_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            missing_config = Path(directory) / "missing-sandbox.json"
            with (
                mock.patch("pi_isolation.sys.platform", "win32"),
                mock.patch.dict(
                    os.environ,
                    {windows_sandbox.CONFIG_ENV_VAR: str(missing_config)},
                    clear=False,
                ),
            ):
                with self.assertRaisesRegex(RuntimeError, "windows_sandbox.py.*setup"):
                    with PiIsolation(Path(directory)):
                        self.fail("Must not launch without Windows sandbox setup")

    def test_windows_validate_rejects_admin_and_same_user(self):
        cfg = windows_sandbox.WindowsSandboxConfig(
            username="llm-eval-sandbox",
            domain=".",
            sid="S-1-5-21-1-2-3-1005",
            password_dpapi_b64="ZmFrZQ==",
        )
        with (
            mock.patch("windows_sandbox.sys.platform", "win32"),
            mock.patch("windows_sandbox.get_current_user_sid", return_value=cfg.sid),
            mock.patch("windows_sandbox.lookup_account_sid", return_value=cfg.sid),
        ):
            with self.assertRaisesRegex(RuntimeError, "distinct account"):
                windows_sandbox.validate_sandbox_config(cfg)

        with (
            mock.patch("windows_sandbox.sys.platform", "win32"),
            mock.patch(
                "windows_sandbox.get_current_user_sid",
                return_value="S-1-5-21-1-2-3-1001",
            ),
            mock.patch("windows_sandbox.lookup_account_sid", return_value=cfg.sid),
            mock.patch("windows_sandbox.is_user_in_administrators", return_value=True),
        ):
            with self.assertRaisesRegex(RuntimeError, "Administrators"):
                windows_sandbox.validate_sandbox_config(cfg)

    def test_windows_npm_shim_resolution_and_runtime_layout(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            node_dir = root / "nodejs"
            node_dir.mkdir()
            node_exe = node_dir / "node.exe"
            node_exe.write_text("", encoding="utf-8")

            npm_dir = root / "npm"
            pkg_dir = npm_dir / "node_modules" / "@earendil-works" / "pi-coding-agent"
            cli_js = pkg_dir / "dist" / "bundle" / "cli.js"
            cli_js.parent.mkdir(parents=True)
            (pkg_dir / "package.json").write_text('{"name":"pi"}', encoding="utf-8")
            cli_js.write_text("// cli", encoding="utf-8")
            unrelated_pkg = npm_dir / "node_modules" / "other-pkg"
            unrelated_pkg.mkdir(parents=True)

            pi_cmd = npm_dir / "pi.cmd"
            pi_cmd.write_text(
                '@ECHO off\r\n'
                '"%_prog%"  "%dp0%\\node_modules\\@earendil-works\\pi-coding-agent\\dist\\bundle\\cli.js" %*\r\n',
                encoding="utf-8",
            )

            self.assertEqual(windows_sandbox.parse_npm_cmd_shim(pi_cmd), cli_js.resolve())

            def fake_which(name, path=None):
                if name == "node":
                    return str(node_exe)
                if name in ("pi", "pi.cmd"):
                    return str(pi_cmd)
                return None

            with mock.patch("windows_sandbox.shutil.which", side_effect=fake_which):
                resolved = windows_sandbox.resolve_windows_command(["pi", "--version"])
                self.assertEqual(resolved, [str(node_exe), str(cli_js.resolve()), "--version"])

                recursive_roots, single_paths, path_entries = (
                    windows_sandbox.discover_windows_runtime_layout()
                )
                self.assertIn(pkg_dir.resolve(), recursive_roots)
                self.assertNotIn(npm_dir.resolve(), recursive_roots)
                self.assertNotIn(unrelated_pkg.resolve(), recursive_roots)
                self.assertIn(pi_cmd.resolve(), single_paths)
                self.assertIn(str(node_dir.resolve()), path_entries)
                self.assertIn(str(npm_dir.resolve()), path_entries)

    def test_windows_isolation_lifecycle_acls_env_and_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            fake_home = Path(directory) / "user-home"
            fake_pi_agent = fake_home / ".pi" / "agent"
            fake_pi_agent.mkdir(parents=True)
            (fake_pi_agent / "settings.json").write_text(
                json.dumps({"packages": ["pi-wiggum"], "httpIdleTimeoutMs": 0}),
                encoding="utf-8",
            )
            (fake_pi_agent / "models.json").write_text("{}", encoding="utf-8")

            workspace = Path(directory) / "work"
            workspace.mkdir()
            (workspace / "CHAT_SESSION.TXT").write_text("log", encoding="utf-8")
            (workspace / "PI_WIGGUM_ATTEMPT_001.JSONL").write_text("raw", encoding="utf-8")
            (workspace / "static_check.json").write_text("{}", encoding="utf-8")
            (workspace / "index.html").write_text("<h1>app</h1>", encoding="utf-8")

            cfg = windows_sandbox.WindowsSandboxConfig(
                username="llm-eval-sandbox",
                domain=".",
                sid="S-1-5-21-1-2-3-1005",
                password_dpapi_b64="ZmFrZQ==",
            )
            fake_probe = mock.Mock(returncode=0, stdout="", stderr="")
            with (
                mock.patch("pi_isolation.sys.platform", "win32"),
                mock.patch("pi_isolation.Path.home", return_value=fake_home),
                mock.patch("windows_sandbox.load_config", return_value=cfg),
                mock.patch("windows_sandbox.validate_sandbox_config"),
                mock.patch(
                    "windows_sandbox.discover_windows_runtime_layout",
                    return_value=([Path("C:/node")], [Path("C:/npm/pi.cmd")], ["C:/node", "C:/Windows/System32"]),
                ),
                mock.patch(
                    "windows_sandbox.get_current_user_sid",
                    return_value="S-1-5-21-1-2-3-1001",
                ),
                mock.patch("windows_sandbox.has_allow_ace", return_value=True),
                mock.patch("windows_sandbox.grant_dacl") as grant_mock,
                mock.patch("windows_sandbox.deny_dacl") as deny_mock,
                mock.patch("windows_sandbox.revoke_dacl") as revoke_mock,
                mock.patch("windows_sandbox.ensure_ancestor_stat_grants", return_value=[]),
                mock.patch("windows_sandbox.ensure_runtime_rx_grants"),
                mock.patch("pi_isolation.subprocess.run", return_value=fake_probe) as run_mock,
            ):
                with PiIsolation(workspace) as sandbox:
                    self.assertEqual(sandbox.backend, "windows-sandbox-user")
                    metadata = json.loads((workspace / "ISOLATION.JSON").read_text(encoding="utf-8"))
                    self.assertTrue(metadata["enabled"])
                    self.assertEqual(metadata["backend"], "windows-sandbox-user")

                    # Verify Modify grant never includes FILE_DELETE_CHILD (0x40).
                    self.assertEqual(grant_mock.call_count, 2)
                    for call in grant_mock.call_args_list:
                        perms = call.args[2]
                        self.assertEqual(perms, windows_sandbox.FILE_MODIFY_NO_DELETE_CHILD)
                        self.assertEqual(perms & windows_sandbox.FILE_DELETE_CHILD, 0)

                    denied_names = {call.args[0].name for call in deny_mock.call_args_list}
                    self.assertEqual(
                        denied_names,
                        {
                            "CHAT_SESSION.TXT",
                            "PI_WIGGUM_ATTEMPT_001.JSONL",
                            "static_check.json",
                            "ISOLATION.JSON",
                        },
                    )
                    self.assertNotIn("index.html", denied_names)

                    env = sandbox.environment({"OPENROUTER_API_KEY": "secret-key"})
                    self.assertEqual(env["HOME"], str(sandbox.home))
                    self.assertEqual(env["USERPROFILE"], str(sandbox.home))
                    self.assertEqual(env["TEMP"], str(sandbox.home / "Temp"))
                    self.assertEqual(env["PI_CODING_AGENT_DIR"], str(sandbox.home / ".pi" / "agent"))
                    self.assertEqual(env["OPENROUTER_API_KEY"], "secret-key")

                    wrapped = sandbox.command(["pi", "--version"])
                    self.assertEqual(wrapped[0], sys.executable)
                    self.assertTrue(wrapped[1].endswith("windows_sandbox.py"))
                    self.assertEqual(wrapped[2], "exec")
                    self.assertEqual(wrapped[-2:], ["pi", "--version"])
                    self.assertEqual(run_mock.call_count, 1)

                revoked_paths = [call.args[0] for call in revoke_mock.call_args_list]
                self.assertIn(workspace.resolve(), revoked_paths)
                self.assertIn((workspace / "CHAT_SESSION.TXT").resolve(), revoked_paths)
                self.assertIn((workspace / "ISOLATION.JSON").resolve(), revoked_paths)

    @unittest.skipUnless(sys.platform == "win32", "Windows DPAPI test")
    def test_windows_dpapi_roundtrip(self):
        secret = windows_sandbox.generate_sandbox_password()
        protected = windows_sandbox.dpapi_protect(secret)
        self.assertNotIn(secret, protected)
        self.assertEqual(windows_sandbox.dpapi_unprotect(protected), secret)

    @unittest.skipUnless(sys.platform == "win32", "Windows NTFS DACL test")
    def test_windows_dacl_grant_deny_revoke_roundtrip(self):
        test_sid = "S-1-9-111111-222222-333333-444444"
        with tempfile.TemporaryDirectory(prefix="llm-eval-dacl-") as directory:
            root = Path(directory)
            target_file = root / "CHAT_SESSION.TXT"
            target_file.write_text("evaluator log", encoding="utf-8")
            inherit = (
                windows_sandbox.OBJECT_INHERIT_ACE
                | windows_sandbox.CONTAINER_INHERIT_ACE
            )
            windows_sandbox.grant_dacl(
                root, test_sid, windows_sandbox.FILE_MODIFY_NO_DELETE_CHILD, inherit
            )
            self.assertTrue(
                windows_sandbox.has_allow_ace(
                    root,
                    (test_sid,),
                    windows_sandbox.FILE_MODIFY_NO_DELETE_CHILD,
                    required_inherit=inherit,
                )
            )
            windows_sandbox.deny_dacl(target_file, test_sid)
            self.assertTrue(
                windows_sandbox.has_deny_ace(
                    target_file, (test_sid,), windows_sandbox.FILE_ALL_ACCESS
                )
            )
            windows_sandbox.revoke_dacl(target_file, test_sid)
            self.assertFalse(windows_sandbox.has_deny_ace(target_file, (test_sid,)))
            windows_sandbox.revoke_dacl(root, test_sid)
            self.assertFalse(
                windows_sandbox.has_allow_ace(
                    root,
                    (test_sid,),
                    windows_sandbox.FILE_RX,
                )
            )
            # Non-inheriting ancestor stat grants must preserve SE_DACL_PROTECTED
            # and never re-inherit BUILTIN\Users or Everyone from parent dirs.
            windows_sandbox.grant_dacl(
                root,
                test_sid,
                windows_sandbox.FILE_ANCESTOR_STAT,
                windows_sandbox.NO_INHERITANCE,
            )
            self.assertFalse(windows_sandbox.is_readable_by_users(root, recursive=False))
            windows_sandbox.revoke_dacl(root, test_sid)
            self.assertFalse(
                windows_sandbox.has_allow_ace(
                    root, (test_sid,), windows_sandbox.FILE_ANCESTOR_STAT
                )
            )

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

    @unittest.skipUnless(
        sys.platform == "win32"
        and windows_sandbox.get_config_path().is_file()
        and all(shutil.which(name) for name in ("pi", "node")),
        "Requires configured Windows sandbox user, Pi, and Node",
    )
    def test_real_windows_boundary_and_pi_startup(self):
        with tempfile.TemporaryDirectory(prefix="llm-eval-win-test-") as directory:
            root = Path(directory).resolve()
            workspace = root / "output"
            workspace.mkdir()
            secret = root / "previous-solution.txt"
            secret.write_text("previous solution", encoding="utf-8")
            records = [
                "CHAT_SESSION.TXT",
                "PI_WIGGUM_ATTEMPT_001.JSONL",
                "static_check.json",
                "ISOLATION.JSON",
            ]
            for name in records:
                (workspace / name).write_text("evaluator secret", encoding="utf-8")

            repo_static_check = Path(__file__).resolve().parent.parent / "static_check.js"
            listener = socket.socket()
            self.addCleanup(listener.close)
            listener.bind(("127.0.0.1", 0))
            listener.listen(1)
            port = listener.getsockname()[1]

            with PiIsolation(workspace) as sandbox:
                env = sandbox.environment(os.environ.copy())
                js = f"""
const assert = require('assert');
const cp = require('child_process');
const dns = require('dns');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

function assertDenied(label, fn) {{
  let threw = false;
  try {{ fn(); }} catch (err) {{ threw = true; }}
  assert.strictEqual(threw, true, 'Expected access denied for ' + label);
}}

assertDenied('secret_outside_ws', () => fs.readFileSync({str(secret)!r}, 'utf8'));
assertDenied('user_home_list', () => fs.readdirSync({str(Path.home())!r}));
assertDenied('repo_static_check', () => fs.readFileSync({str(repo_static_check)!r}, 'utf8'));

for (const name of {json.dumps(records)}) {{
  const p = path.join({str(workspace)!r}, name);
  assertDenied('read_' + name, () => fs.readFileSync(p, 'utf8'));
  assertDenied('write_' + name, () => fs.writeFileSync(p, 'tampered'));
  assertDenied('unlink_' + name, () => fs.unlinkSync(p));
  assertDenied('rename_' + name, () => fs.renameSync(p, p + '.moved'));
}}

fs.writeFileSync(path.join({str(workspace)!r}, 'index.html'), 'created', 'utf8');
fs.writeFileSync(path.join(os.homedir(), 'private.txt'), 'private', 'utf8');

const sub = cp.spawnSync('cmd.exe', ['/d', '/c', 'echo', 'sub-ok'], {{ encoding: 'utf8' }});
assert.strictEqual(sub.status, 0, sub.stderr || (sub.error && sub.error.message));
assert.strictEqual(sub.stdout.trim(), 'sub-ok');

dns.lookup('localhost', (err) => {{
  assert.ifError(err);
  const sock = net.createConnection({{ host: '127.0.0.1', port: {port} }}, () => {{
    sock.end();
    process.exit(0);
  }});
  sock.on('error', (connErr) => {{ throw connErr; }});
}});
"""
                check_script = workspace / "boundary_check.js"
                check_script.write_text(js, encoding="utf-8")
                result = subprocess.run(
                    sandbox.command(["node", str(check_script)]),
                    capture_output=True,
                    text=True,
                    timeout=20,
                    cwd=workspace,
                    env=env,
                )
                self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
                self.assertEqual((workspace / "index.html").read_text(encoding="utf-8"), "created")
                self.assertEqual(
                    (workspace / "CHAT_SESSION.TXT").read_text(encoding="utf-8"),
                    "evaluator secret",
                )

                pi_result = subprocess.run(
                    sandbox.command(["pi", "--version"]),
                    capture_output=True,
                    text=True,
                    timeout=20,
                    cwd=workspace,
                    env=env,
                )
                self.assertEqual(pi_result.returncode, 0, pi_result.stderr or pi_result.stdout)
                self.assertTrue(pi_result.stdout.strip())


if __name__ == "__main__":
    unittest.main()

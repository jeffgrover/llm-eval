"""Minimal Linux filesystem boundary for Pi benchmark attempts."""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import List


class PiIsolation:
    """Give Pi a private home, system tools, and only its output workspace."""

    def __init__(self, work_dir: Path):
        self.work_dir = work_dir.resolve()

    def __enter__(self):
        self.bwrap = shutil.which("bwrap")
        if not sys.platform.startswith("linux") or not self.bwrap:
            raise RuntimeError("Pi evaluations require Linux and bubblewrap (install bwrap).")
        self.temporary = tempfile.TemporaryDirectory(prefix="llm-eval-pi-")
        self.home = Path(self.temporary.name)
        try:
            config = self.home / ".pi" / "agent"
            config.mkdir(parents=True)
            source = Path.home() / ".pi" / "agent"
            for name in ("models.json", "settings.json", "auth.json"):
                if (source / name).is_file():
                    if name == "settings.json":
                        # The host settings may list optional npm packages
                        # (including pi-wiggum). In a private home Pi would
                        # try to download them before starting the model. The
                        # evaluator owns Wiggum, so omit that package manager
                        # list and keep only ordinary Pi settings.
                        settings = json.loads((source / name).read_text(encoding="utf-8"))
                        settings.pop("packages", None)
                        (config / name).write_text(json.dumps(settings, indent=2), encoding="utf-8")
                    else:
                        shutil.copyfile(source / name, config / name)
            self.empty = self.home / "empty"
            self.empty.touch()
            probe = subprocess.run(
                self.command(["/bin/true"]), capture_output=True, text=True, timeout=10
            )
            if probe.returncode:
                raise RuntimeError(f"Pi isolation cannot start: {probe.stderr.strip()}")
            (self.work_dir / "ISOLATION.JSON").write_text(json.dumps({
                "enabled": True, "backend": "bubblewrap",
                "workspace": "/workspace", "home": "private",
                "checkers": "evaluator only",
            }, indent=2), encoding="utf-8")
            return self
        except BaseException:
            self.temporary.cleanup()
            raise

    def __exit__(self, *exc):
        self.temporary.cleanup()

    def command(self, cmd: List[str]) -> List[str]:
        # An empty root avoids exposing /home, /opt, /mnt, or host /tmp by accident.
        prefix = [self.bwrap, "--tmpfs", "/"]
        for name in ("usr", "bin", "sbin", "lib", "lib64", "etc"):
            path = Path("/") / name
            if path.exists():
                prefix += ["--ro-bind", str(path), str(path)]
        # User-installed Pi and Node commonly share a single npm prefix.
        runtime_roots = set()
        for binary in ("pi", "node"):
            found = shutil.which(binary)
            if not found:
                raise RuntimeError(f"Pi isolation requires {binary} on PATH.")
            installed = Path(found).absolute()
            if not installed.is_relative_to(Path("/usr")) and not installed.is_relative_to(Path("/bin")):
                runtime = installed.parent.parent.resolve()
                # Pi and Node are installed together in this versioned prefix.
                # Expose only that immutable runtime, at a neutral path; the
                # real home containing it remains hidden.
                if runtime not in runtime_roots:
                    prefix += ["--ro-bind", str(runtime), "/opt/pi-runtime"]
                    runtime_roots.add(runtime)
        prefix += [
            "--bind", str(self.home), "/home/pi",
            "--bind", str(self.work_dir), "/workspace",
            "--tmpfs", "/tmp", "--dev", "/dev", "--proc", "/proc",
            "--unshare-pid", "--die-with-parent", "--chdir", "/workspace",
            "--setenv", "HOME", "/home/pi",
            "--setenv", "PATH", "/opt/pi-runtime/bin:/usr/bin:/bin",
            "--setenv", "PI_CODING_AGENT_DIR", "/home/pi/.pi/agent",
            "--setenv", "TMPDIR", "/tmp",
            "--setenv", "XDG_CACHE_HOME", "/tmp/cache",
            "--setenv", "XDG_CONFIG_HOME", "/home/pi/.config",
            "--setenv", "NODE_COMPILE_CACHE", "/tmp/node-compile-cache",
        ]
        # The evaluator opens these before launch. Hide their contents from Pi.
        for path in self.work_dir.iterdir():
            if path.is_file() and (
                path.name in {"CHAT_SESSION.TXT", "SERVER.LOG", "ISOLATION.JSON",
                              "static_check.json", "runtime_check.json", "summary.html"}
                or path.name.endswith(("_RESULT.JSON", "_EVENTS.JSONL"))
                or path.name.startswith("PI_WIGGUM_ATTEMPT_")
            ):
                prefix += ["--ro-bind", str(self.empty), f"/workspace/{path.name}"]
        return prefix + ["--", *cmd]

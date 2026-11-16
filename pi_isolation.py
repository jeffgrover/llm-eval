"""Filesystem boundary for Pi benchmark attempts."""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Dict, List


class PiIsolation:
    """Give Pi a private home and restrict it to its output workspace."""

    SYSTEM_READ_PATHS = (
        "/System",
        "/usr",
        "/bin",
        "/sbin",
        "/private/etc",
        "/private/var/db/dyld",
        "/private/var/db/timezone",
        "/private/var/select",
        "/Library/Apple",
        "/Library/Developer",
        "/Library/Preferences",
        "/opt/homebrew",
        "/usr/local",
    )

    PROTECTED_WORKSPACE_NAMES = {
        "CHAT_SESSION.TXT",
        "SERVER.LOG",
        "ISOLATION.JSON",
        "static_check.json",
        "runtime_check.json",
        "summary.html",
    }

    def __init__(self, work_dir: Path):
        self.work_dir = work_dir.resolve()

    def __enter__(self):
        if sys.platform.startswith("linux"):
            self.backend = "bubblewrap"
            self.bwrap = shutil.which("bwrap")
            if not self.bwrap:
                raise RuntimeError("Pi evaluations require bubblewrap (install bwrap).")
        elif sys.platform == "darwin":
            self.backend = "seatbelt"
            self.sandbox_exec = Path("/usr/bin/sandbox-exec")
            if not self.sandbox_exec.is_file():
                raise RuntimeError(
                    "Pi evaluations on macOS require /usr/bin/sandbox-exec (Seatbelt)."
                )
        else:
            raise RuntimeError("Pi evaluations require Linux/bubblewrap or macOS/Seatbelt.")

        self.temporary = tempfile.TemporaryDirectory(prefix="llm-eval-pi-")
        self.home = Path(self.temporary.name).resolve()
        try:
            config = self.home / ".pi" / "agent"
            config.mkdir(parents=True)
            source = Path.home() / ".pi" / "agent"
            for name in ("models.json", "settings.json", "auth.json"):
                if (source / name).is_file():
                    if name == "settings.json":
                        # Do not let private-home startup trigger package installs.
                        settings = json.loads((source / name).read_text(encoding="utf-8"))
                        settings.pop("packages", None)
                        (config / name).write_text(json.dumps(settings, indent=2), encoding="utf-8")
                    else:
                        shutil.copyfile(source / name, config / name)
            self.empty = self.home / "empty"
            self.empty.touch()

            if self.backend == "seatbelt":
                self._write_isolation_metadata()
                self._write_seatbelt_profile()

            probe_binary = "/usr/bin/true" if self.backend == "seatbelt" else "/bin/true"
            probe = subprocess.run(
                self.command([probe_binary]),
                capture_output=True,
                text=True,
                timeout=10,
                cwd=self.work_dir,
            )
            if probe.returncode:
                raise RuntimeError(
                    f"Pi isolation cannot start: {probe.stderr.strip()}"
                )
            if self.backend == "bubblewrap":
                self._write_isolation_metadata()
            return self
        except BaseException:
            self.temporary.cleanup()
            raise

    def __exit__(self, *exc):
        self.temporary.cleanup()

    def _write_isolation_metadata(self) -> None:
        metadata = {
            "enabled": True,
            "backend": self.backend,
            "workspace": "/workspace" if self.backend == "bubblewrap" else str(self.work_dir),
            "home": "private",
            "checkers": "evaluator only",
        }
        (self.work_dir / "ISOLATION.JSON").write_text(
            json.dumps(metadata, indent=2), encoding="utf-8"
        )

    def environment(self, env: Dict[str, str]) -> Dict[str, str]:
        """Set the private runtime paths that bubblewrap otherwise provides."""
        if self.backend != "seatbelt":
            return env

        env = env.copy()
        env.update({
            "HOME": str(self.home),
            "PATH": ":".join(self._seatbelt_path_entries),
            "PI_CODING_AGENT_DIR": str(self.home / ".pi" / "agent"),
            "TMPDIR": str(self.home),
            "XDG_CACHE_HOME": str(self.home / ".cache"),
            "XDG_CONFIG_HOME": str(self.home / ".config"),
            "NODE_COMPILE_CACHE": str(self.home / "node-compile-cache"),
        })
        return env

    def command(self, cmd: List[str]) -> List[str]:
        if self.backend == "seatbelt":
            return [
                str(self.sandbox_exec),
                *self._seatbelt_parameters,
                "-f",
                str(self.profile_path),
                *cmd,
            ]

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
            if path.is_file() and self._is_protected_workspace_path(path):
                prefix += ["--ro-bind", str(self.empty), f"/workspace/{path.name}"]
        return prefix + ["--", *cmd]

    def _is_protected_workspace_path(self, path: Path) -> bool:
        return (
            path.name in self.PROTECTED_WORKSPACE_NAMES
            or path.name.endswith(("_RESULT.JSON", "_EVENTS.JSONL"))
            or path.name.startswith("PI_WIGGUM_ATTEMPT_")
        )

    @staticmethod
    def _parameter(name: str) -> str:
        return f'(param "{name}")'

    def _write_seatbelt_profile(self) -> None:
        runtime_roots = set()
        path_entries = set()
        for binary in ("pi", "node"):
            found = shutil.which(binary)
            if not found:
                raise RuntimeError(f"Pi isolation requires {binary} on PATH.")
            installed = Path(found).absolute()
            resolved = installed.resolve()
            # Keep both the PATH entry and its resolved target available. This
            # covers version managers that expose Node/Pi through symlinks.
            path_entries.update((str(installed.parent), str(resolved.parent)))
            runtime_roots.update((installed.parent.parent.resolve(), resolved.parent.parent))

        self.runtime_roots = sorted(runtime_roots, key=str)
        system_roots = [
            Path(path).resolve()
            for path in self.SYSTEM_READ_PATHS
            if Path(path).exists()
        ]
        self._seatbelt_path_entries = sorted(path_entries) + [
            path for path in ("/usr/bin", "/bin", "/usr/sbin", "/sbin")
            if Path(path).is_dir()
        ]

        profile = [
            "(version 1)",
            "(deny default)",
            "(allow process-exec)",
            "(allow process-fork)",
            "(allow signal (target same-sandbox))",
            "(allow process-info* (target same-sandbox))",
            "(allow file-read-metadata (vnode-type DIRECTORY))",
            # macOS exposes these standard roots as symlinks into /private.
            # Resolver and runtime path checks need to stat the links too.
            '(allow file-read-metadata (literal "/etc") (literal "/var"))',
            '(allow file-read-data (literal "/"))',
            '(allow file-read* file-test-existence file-map-executable '
            '(subpath "/dev/fd"))',
            '(allow file-read* file-test-existence file-write* '
            '(literal "/dev/null") (literal "/dev/zero"))',
            '(allow file-read* file-test-existence '
            '(literal "/dev/random") (literal "/dev/urandom"))',
            '(allow sysctl-read '
            '(sysctl-name-prefix "hw.") '
            '(sysctl-name "kern.argmax") '
            '(sysctl-name "kern.hostname") '
            '(sysctl-name "kern.osproductversion") '
            '(sysctl-name "kern.osrelease") '
            '(sysctl-name "kern.ostype") '
            '(sysctl-name "kern.osversion") '
            '(sysctl-name "kern.version") '
            '(sysctl-name "vm.loadavg") '
            '(sysctl-name-prefix "net.routetable."))',
            # The system resolver and TLS stack consult these before network I/O.
            '(allow mach-lookup '
            '(global-name "com.apple.system.opendirectoryd.libinfo") '
            '(global-name "com.apple.system.configd") '
            '(global-name "com.apple.SystemConfiguration.configd") '
            '(global-name "com.apple.SystemConfiguration.DNSConfiguration") '
            '(global-name "com.apple.networkd") '
            '(global-name "com.apple.ocspd") '
            '(global-name "com.apple.mDNSResponder") '
            '(global-name "com.apple.trustd") '
            '(global-name "com.apple.trustd.agent"))',
            "(allow ipc-posix-sem)",
            "(allow system-socket)",
            "(allow network*)",
            # macOS routes getaddrinfo through this Unix socket, not UDP port 53.
            '(allow network-outbound '
            '(remote unix-socket (subpath "/private/var/run/mDNSResponder")) '
            '(remote unix-socket (subpath "/var/run/mDNSResponder")))',
        ]

        params = []
        read_roots = [*system_roots, self.work_dir, self.home, *self.runtime_roots]
        for index, root in enumerate(read_roots):
            name = f"READ_ROOT_{index}"
            params.extend(["-D", f"{name}={root}"])
            profile.append(
                f"(allow file-read* file-test-existence file-map-executable "
                f"(subpath {self._parameter(name)}))"
            )

        for index, root in enumerate((self.work_dir, self.home)):
            name = f"WRITE_ROOT_{index}"
            params.extend(["-D", f"{name}={root}"])
            profile.append(
                f"(allow file-write* (subpath {self._parameter(name)}))"
            )

        protected = set()
        for path in self.work_dir.iterdir():
            if path.is_file() and self._is_protected_workspace_path(path):
                protected.update((path.absolute(), path.resolve()))
        for index, path in enumerate(sorted(protected, key=str)):
            name = f"PROTECTED_{index}"
            params.extend(["-D", f"{name}={path}"])
            value = self._parameter(name)
            # Deny reads and writes after the workspace grants so evaluator
            # logs remain private even though the rest of the workspace is open.
            profile.append(f"(deny file-read* file-test-existence (subpath {value}))")
            profile.append(f"(deny file-write* (subpath {value}))")

        self.profile_path = self.home / "seatbelt.sb"
        self.profile_path.write_text("\n".join(profile) + "\n", encoding="utf-8")
        self._seatbelt_parameters = params

#!/usr/bin/env python3
"""Native Windows sandbox backend using a dedicated non-admin local user.

Provides kernel-enforced filesystem read/write isolation for Pi benchmark runs
on Windows 10/11 using only the Python standard library and Win32 APIs:

- One-time Administrator setup (`python windows_sandbox.py setup`) creates a
  hidden, non-admin local user (`llm-eval-sandbox`) with a random password
  protected by current-user Windows DPAPI (`CryptProtectData`).
- Every evaluation run (standard non-admin user) grants the sandbox user
  Modify access (without `FILE_DELETE_CHILD` or `WRITE_DAC`) to the workspace
  and private home, applies explicit DENY ACEs to protected evaluator logs,
  launches commands via `CreateProcessWithLogonW` inside a Windows Job Object
  (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`), and revokes temporary ACEs on exit.
"""

import argparse
import base64
import ctypes
import json
import os
import re
import secrets
import shutil
import string
import subprocess
import sys
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

DEFAULT_SANDBOX_USERNAME = "llm-eval-sandbox"
CONFIG_ENV_VAR = "LLM_EVAL_WINDOWS_SANDBOX_CONFIG"
WINLOGON_SPECIAL_ACCOUNTS_KEY = (
    r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\SpecialAccounts\UserList"
)

USERS_GROUP_SID = "S-1-5-32-545"
ADMINISTRATORS_GROUP_SID = "S-1-5-32-544"
REMOTE_DESKTOP_USERS_SID = "S-1-5-32-555"
EVERYONE_SID = "S-1-1-0"
AUTHENTICATED_USERS_SID = "S-1-5-11"

# Win32 access masks and ACL flags (also referenced in platform-independent tests).
SE_FILE_OBJECT = 1
DACL_SECURITY_INFORMATION = 0x00000004
PROTECTED_DACL_SECURITY_INFORMATION = 0x80000000
SE_DACL_PROTECTED = 0x1000
GRANT_ACCESS = 1
DENY_ACCESS = 3
TRUSTEE_IS_SID = 0
TRUSTEE_IS_UNKNOWN = 0
NO_INHERITANCE = 0x0
OBJECT_INHERIT_ACE = 0x1
CONTAINER_INHERIT_ACE = 0x2
INHERITED_ACE = 0x10
ACCESS_ALLOWED_ACE_TYPE = 0x0
ACCESS_DENIED_ACE_TYPE = 0x1

FILE_GENERIC_READ = 0x00120089
FILE_GENERIC_WRITE = 0x00120116
FILE_GENERIC_EXECUTE = 0x001200A0
FILE_TRAVERSE = 0x00000020
FILE_READ_ATTRIBUTES = 0x00000080
SYNCHRONIZE = 0x00100000
DELETE = 0x00010000
FILE_DELETE_CHILD = 0x00000040
FILE_ALL_ACCESS = 0x001F01FF
# Standard Modify without FILE_DELETE_CHILD (0x40), WRITE_DAC, or WRITE_OWNER:
# the sandbox can create/edit/delete normal files in its workspace, while
# explicit DENY ACEs on protected evaluator logs cannot be bypassed via the
# parent directory's FILE_DELETE_CHILD right or altered via WRITE_DAC.
FILE_MODIFY_NO_DELETE_CHILD = (
    FILE_GENERIC_READ | FILE_GENERIC_WRITE | FILE_GENERIC_EXECUTE | DELETE
)
FILE_RX = FILE_GENERIC_READ | FILE_GENERIC_EXECUTE
# Directory-only metadata/traverse mask (NO_INHERITANCE, no FILE_LIST_DIRECTORY):
# allows Node.js realpathSync/lstat to walk ancestor directories to the workspace
# and Pi runtime without listing directory contents or reading any sibling files.
FILE_ANCESTOR_STAT = FILE_READ_ATTRIBUTES | FILE_TRAVERSE | SYNCHRONIZE

# Win32 user/process/job/DPAPI constants.
CRYPTPROTECT_UI_FORBIDDEN = 0x1
TOKEN_QUERY = 0x0008
TokenUser = 1
UF_SCRIPT = 0x0001
UF_PASSWD_CANT_CHANGE = 0x0040
UF_NORMAL_ACCOUNT = 0x0200
UF_DONT_EXPIRE_PASSWD = 0x10000
USER_PRIV_USER = 1
NERR_Success = 0
NERR_UserExists = 2224
NERR_UserNotFound = 2221
ERROR_MEMBER_IN_ALIAS = 1378
ERROR_MEMBER_NOT_IN_ALIAS = 1377
ERROR_NO_SUCH_ALIAS = 1376
LG_INCLUDE_INDIRECT = 0x1

LOGON_WITH_PROFILE = 0x00000001
CREATE_SUSPENDED = 0x00000004
CREATE_UNICODE_ENVIRONMENT = 0x00000400
CREATE_NO_WINDOW = 0x08000000
STARTF_USESTDHANDLES = 0x00000100
HANDLE_FLAG_INHERIT = 0x00000001
INFINITE = 0xFFFFFFFF
JobObjectExtendedLimitInformation = 9
JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000
ACL_REVISION = 2
AclSizeInformation = 2


@dataclass(frozen=True)
class WindowsSandboxConfig:
    """Persisted metadata and DPAPI-protected credential for the sandbox user."""

    username: str
    domain: str
    sid: str
    password_dpapi_b64: str
    runtime_grants: Tuple[str, ...] = ()

    def to_dict(self) -> Dict[str, object]:
        return {
            "version": 1,
            "username": self.username,
            "domain": self.domain,
            "sid": self.sid,
            "password_dpapi_b64": self.password_dpapi_b64,
            "runtime_grants": list(self.runtime_grants),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, object]) -> "WindowsSandboxConfig":
        username = str(data.get("username") or "").strip()
        domain = str(data.get("domain") or ".").strip()
        sid = str(data.get("sid") or "").strip()
        password_dpapi_b64 = str(data.get("password_dpapi_b64") or "").strip()
        raw_grants = data.get("runtime_grants") or []
        runtime_grants = tuple(str(p) for p in raw_grants if p)
        if not username or not sid or not password_dpapi_b64:
            raise RuntimeError("Windows sandbox configuration is incomplete.")
        return cls(
            username=username,
            domain=domain,
            sid=sid,
            password_dpapi_b64=password_dpapi_b64,
            runtime_grants=runtime_grants,
        )


def get_config_path() -> Path:
    """Return the path to the current user's Windows sandbox config file."""
    override = os.environ.get(CONFIG_ENV_VAR)
    if override:
        return Path(override).expanduser()
    local_app_data = os.environ.get("LOCALAPPDATA")
    base = Path(local_app_data) if local_app_data else Path.home() / "AppData" / "Local"
    return base / "llm-eval" / "windows-sandbox.json"


def load_config(config_path: Optional[Path] = None) -> WindowsSandboxConfig:
    """Load and validate the persisted Windows sandbox configuration."""
    path = config_path or get_config_path()
    if not path.is_file():
        raise RuntimeError(
            "Pi evaluations on Windows require the local sandbox user to be set up once.\n"
            "Run this command from an Administrator terminal:\n"
            f"  \"{sys.executable}\" \"{Path(__file__).resolve()}\" setup"
        )
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(
            f"Failed to read Windows sandbox configuration at {path}: {exc}"
        ) from exc
    if not isinstance(data, dict):
        raise RuntimeError(f"Invalid Windows sandbox configuration at {path}.")
    return WindowsSandboxConfig.from_dict(data)


def save_config(config: WindowsSandboxConfig, config_path: Optional[Path] = None) -> Path:
    """Write the sandbox configuration to the current user's private AppData."""
    path = config_path or get_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config.to_dict(), indent=2) + "\n", encoding="utf-8")
    return path


def generate_sandbox_password(length: int = 32) -> str:
    """Generate a random password meeting Windows complexity policies."""
    groups = (
        string.ascii_uppercase,
        string.ascii_lowercase,
        string.digits,
        "!@#$%^&*-_=+",
    )
    chars = [secrets.choice(group) for group in groups]
    alphabet = "".join(groups)
    chars.extend(secrets.choice(alphabet) for _ in range(max(0, length - len(chars))))
    # Shuffle using cryptographically secure swaps.
    for i in range(len(chars) - 1, 0, -1):
        j = secrets.randbelow(i + 1)
        chars[i], chars[j] = chars[j], chars[i]
    return "".join(chars)


def parse_npm_cmd_shim(shim_path: Path) -> Optional[Path]:
    """Extract the target JS script from a standard Windows npm `.cmd` shim."""
    try:
        content = shim_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return None
    # Typical npm shim line:
    #   "%_prog%"  "%dp0%\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js" %*
    matches = re.findall(r'"%dp0%[\\/]([^"]+\.(?:[cm]?js))"', content, flags=re.IGNORECASE)
    for rel in matches:
        candidate = (shim_path.parent / rel.replace("\\", os.sep)).resolve()
        if candidate.is_file():
            return candidate
    return None


def find_package_root(script_path: Path) -> Path:
    """Find the enclosing npm package directory for a resolved CLI script."""
    current = script_path.resolve().parent
    for parent in (current, *current.parents):
        if (parent / "package.json").is_file():
            return parent
    return current


def resolve_windows_command(
    cmd: Sequence[str],
    search_path: Optional[str] = None,
) -> List[str]:
    """Resolve npm `.cmd` shims to direct `node <script.js>` invocations."""
    if not cmd:
        raise ValueError("Command must not be empty.")
    exe = cmd[0]
    args = list(cmd[1:])
    path_env = search_path if search_path is not None else os.environ.get("PATH")
    resolved = shutil.which(exe, path=path_env) if not Path(exe).is_absolute() else exe
    if not resolved:
        return list(cmd)
    resolved_path = Path(resolved)
    if resolved_path.suffix.lower() in (".cmd", ".bat"):
        js_entry = parse_npm_cmd_shim(resolved_path)
        if js_entry is not None:
            node_exe = shutil.which("node", path=path_env) or shutil.which("node")
            if node_exe:
                return [node_exe, str(js_entry), *args]
        comspec = os.environ.get("COMSPEC", r"C:\Windows\System32\cmd.exe")
        return [comspec, "/d", "/c", str(resolved_path), *args]
    return [str(resolved_path), *args]


def discover_windows_runtime_layout(
    search_path: Optional[str] = None,
) -> Tuple[List[Path], List[Path], List[str]]:
    """Locate Node, Pi, and optional Git/Bash paths for Windows isolation.

    Returns:
        (recursive_rx_roots, single_rx_paths, sanitized_path_entries)
    """
    path_env = search_path if search_path is not None else os.environ.get("PATH")
    recursive_roots: List[Path] = []
    single_paths: List[Path] = []
    path_entries: List[str] = []

    def _add_unique(target: List, item) -> None:
        if item not in target:
            target.append(item)

    node_found = shutil.which("node", path=path_env)
    if not node_found:
        raise RuntimeError("Pi isolation requires node on PATH.")
    node_path = Path(node_found).resolve()
    _add_unique(path_entries, str(node_path.parent))
    _add_unique(recursive_roots, node_path.parent)

    pi_found = shutil.which("pi", path=path_env) or shutil.which("pi.cmd", path=path_env)
    if not pi_found:
        raise RuntimeError("Pi isolation requires pi on PATH.")
    pi_path = Path(pi_found).resolve()
    _add_unique(path_entries, str(pi_path.parent))

    js_entry = parse_npm_cmd_shim(pi_path) if pi_path.suffix.lower() in (".cmd", ".bat") else None
    if js_entry is not None:
        # Grant RX to the shim files non-recursively and only to Pi's own
        # package directory recursively (avoiding unrelated global npm packages).
        _add_unique(single_paths, pi_path.parent)
        _add_unique(single_paths, pi_path)
        sibling_sh = pi_path.with_suffix("")
        if sibling_sh.is_file():
            _add_unique(single_paths, sibling_sh)
        _add_unique(recursive_roots, find_package_root(js_entry))
    else:
        _add_unique(recursive_roots, pi_path.parent)

    # Include Git/Bash if installed so Pi's bash tool works seamlessly.
    for tool in ("bash", "git"):
        found = shutil.which(tool, path=path_env)
        if not found:
            continue
        tool_path = Path(found).resolve()
        _add_unique(path_entries, str(tool_path.parent))
        # Standard Git for Windows keeps bash.exe in Git\bin and Git\usr\bin.
        if tool == "git" and tool_path.parent.name.lower() == "cmd":
            git_root = tool_path.parent.parent
            for subdir in ("bin", r"usr\bin"):
                candidate = git_root / subdir
                if candidate.is_dir():
                    _add_unique(path_entries, str(candidate))

    system_root = Path(os.environ.get("SystemRoot", r"C:\Windows"))
    for sys_dir in (
        system_root / "System32",
        system_root,
        system_root / "System32" / "Wbem",
        system_root / "System32" / "WindowsPowerShell" / "v1.0",
    ):
        if sys_dir.is_dir():
            _add_unique(path_entries, str(sys_dir))

    return recursive_roots, single_paths, path_entries


# --- Win32 ctypes implementation (Windows only) ---

if sys.platform == "win32":
    from ctypes import wintypes
    import msvcrt
    import winreg

    _advapi32 = ctypes.WinDLL("advapi32", use_last_error=True)
    _crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
    _kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    _netapi32 = ctypes.WinDLL("netapi32", use_last_error=True)
    _shell32 = ctypes.WinDLL("shell32", use_last_error=True)

    class _DATA_BLOB(ctypes.Structure):
        _fields_ = [
            ("cbData", wintypes.DWORD),
            ("pbData", ctypes.POINTER(ctypes.c_ubyte)),
        ]

    class _SID_AND_ATTRIBUTES(ctypes.Structure):
        _fields_ = [
            ("Sid", wintypes.LPVOID),
            ("Attributes", wintypes.DWORD),
        ]

    class _TOKEN_USER(ctypes.Structure):
        _fields_ = [("User", _SID_AND_ATTRIBUTES)]

    class _TRUSTEE_W(ctypes.Structure):
        _fields_ = [
            ("pMultipleTrustee", wintypes.LPVOID),
            ("MultipleTrusteeOperation", wintypes.DWORD),
            ("TrusteeForm", wintypes.DWORD),
            ("TrusteeType", wintypes.DWORD),
            ("ptstrName", wintypes.LPVOID),
        ]

    class _EXPLICIT_ACCESS_W(ctypes.Structure):
        _fields_ = [
            ("grfAccessPermissions", wintypes.DWORD),
            ("grfAccessMode", wintypes.DWORD),
            ("grfInheritance", wintypes.DWORD),
            ("Trustee", _TRUSTEE_W),
        ]

    class _ACL_SIZE_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("AceCount", wintypes.DWORD),
            ("AclBytesInUse", wintypes.DWORD),
            ("AclBytesFree", wintypes.DWORD),
        ]

    class _ACE_HEADER(ctypes.Structure):
        _fields_ = [
            ("AceType", ctypes.c_ubyte),
            ("AceFlags", ctypes.c_ubyte),
            ("AceSize", wintypes.WORD),
        ]

    class _ACCESS_ACE(ctypes.Structure):
        _fields_ = [
            ("Header", _ACE_HEADER),
            ("Mask", wintypes.DWORD),
            ("SidStart", wintypes.DWORD),
        ]

    class _SECURITY_ATTRIBUTES(ctypes.Structure):
        _fields_ = [
            ("nLength", wintypes.DWORD),
            ("lpSecurityDescriptor", wintypes.LPVOID),
            ("bInheritHandle", wintypes.BOOL),
        ]

    class _STARTUPINFOW(ctypes.Structure):
        _fields_ = [
            ("cb", wintypes.DWORD),
            ("lpReserved", wintypes.LPWSTR),
            ("lpDesktop", wintypes.LPWSTR),
            ("lpTitle", wintypes.LPWSTR),
            ("dwX", wintypes.DWORD),
            ("dwY", wintypes.DWORD),
            ("dwXSize", wintypes.DWORD),
            ("dwYSize", wintypes.DWORD),
            ("dwXCountChars", wintypes.DWORD),
            ("dwYCountChars", wintypes.DWORD),
            ("dwFillAttribute", wintypes.DWORD),
            ("dwFlags", wintypes.DWORD),
            ("wShowWindow", wintypes.WORD),
            ("cbReserved2", wintypes.WORD),
            ("lpReserved2", ctypes.POINTER(ctypes.c_byte)),
            ("hStdInput", wintypes.HANDLE),
            ("hStdOutput", wintypes.HANDLE),
            ("hStdError", wintypes.HANDLE),
        ]

    class _PROCESS_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("hProcess", wintypes.HANDLE),
            ("hThread", wintypes.HANDLE),
            ("dwProcessId", wintypes.DWORD),
            ("dwThreadId", wintypes.DWORD),
        ]

    class _IO_COUNTERS(ctypes.Structure):
        _fields_ = [
            ("ReadOperationCount", ctypes.c_uint64),
            ("WriteOperationCount", ctypes.c_uint64),
            ("OtherOperationCount", ctypes.c_uint64),
            ("ReadTransferCount", ctypes.c_uint64),
            ("WriteTransferCount", ctypes.c_uint64),
            ("OtherTransferCount", ctypes.c_uint64),
        ]

    class _JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("PerProcessUserTimeLimit", ctypes.c_int64),
            ("PerJobUserTimeLimit", ctypes.c_int64),
            ("LimitFlags", wintypes.DWORD),
            ("MinimumWorkingSetSize", ctypes.c_size_t),
            ("MaximumWorkingSetSize", ctypes.c_size_t),
            ("ActiveProcessLimit", wintypes.DWORD),
            ("Affinity", ctypes.c_size_t),
            ("PriorityClass", wintypes.DWORD),
            ("SchedulingClass", wintypes.DWORD),
        ]

    class _JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("BasicLimitInformation", _JOBOBJECT_BASIC_LIMIT_INFORMATION),
            ("IoInfo", _IO_COUNTERS),
            ("ProcessMemoryLimit", ctypes.c_size_t),
            ("JobMemoryLimit", ctypes.c_size_t),
            ("PeakProcessMemoryUsed", ctypes.c_size_t),
            ("PeakJobMemoryUsed", ctypes.c_size_t),
        ]

    class _USER_INFO_1(ctypes.Structure):
        _fields_ = [
            ("usri1_name", wintypes.LPWSTR),
            ("usri1_password", wintypes.LPWSTR),
            ("usri1_password_age", wintypes.DWORD),
            ("usri1_priv", wintypes.DWORD),
            ("usri1_home_dir", wintypes.LPWSTR),
            ("usri1_comment", wintypes.LPWSTR),
            ("usri1_flags", wintypes.DWORD),
            ("usri1_script_path", wintypes.LPWSTR),
        ]

    class _USER_INFO_1003(ctypes.Structure):
        _fields_ = [("usri1003_password", wintypes.LPWSTR)]

    class _USER_INFO_1008(ctypes.Structure):
        _fields_ = [("usri1008_flags", wintypes.DWORD)]

    class _LOCALGROUP_MEMBERS_INFO_0(ctypes.Structure):
        _fields_ = [("lgrmi0_sid", wintypes.LPVOID)]

    class _LOCALGROUP_USERS_INFO_0(ctypes.Structure):
        _fields_ = [("lgrui0_name", wintypes.LPWSTR)]

    # Prototypes
    _shell32.IsUserAnAdmin.argtypes = []
    _shell32.IsUserAnAdmin.restype = wintypes.BOOL

    _crypt32.CryptProtectData.argtypes = [
        ctypes.POINTER(_DATA_BLOB),
        wintypes.LPCWSTR,
        ctypes.POINTER(_DATA_BLOB),
        wintypes.LPVOID,
        wintypes.LPVOID,
        wintypes.DWORD,
        ctypes.POINTER(_DATA_BLOB),
    ]
    _crypt32.CryptProtectData.restype = wintypes.BOOL

    _crypt32.CryptUnprotectData.argtypes = [
        ctypes.POINTER(_DATA_BLOB),
        ctypes.POINTER(wintypes.LPWSTR),
        ctypes.POINTER(_DATA_BLOB),
        wintypes.LPVOID,
        wintypes.LPVOID,
        wintypes.DWORD,
        ctypes.POINTER(_DATA_BLOB),
    ]
    _crypt32.CryptUnprotectData.restype = wintypes.BOOL

    _kernel32.LocalFree.argtypes = [wintypes.HLOCAL]
    _kernel32.LocalFree.restype = wintypes.HLOCAL
    _kernel32.GetCurrentProcess.argtypes = []
    _kernel32.GetCurrentProcess.restype = wintypes.HANDLE
    _kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    _kernel32.CloseHandle.restype = wintypes.BOOL
    _kernel32.CreatePipe.argtypes = [
        ctypes.POINTER(wintypes.HANDLE),
        ctypes.POINTER(wintypes.HANDLE),
        ctypes.POINTER(_SECURITY_ATTRIBUTES),
        wintypes.DWORD,
    ]
    _kernel32.CreatePipe.restype = wintypes.BOOL
    _kernel32.SetHandleInformation.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.DWORD]
    _kernel32.SetHandleInformation.restype = wintypes.BOOL
    _kernel32.CreateJobObjectW.argtypes = [wintypes.LPVOID, wintypes.LPCWSTR]
    _kernel32.CreateJobObjectW.restype = wintypes.HANDLE
    _kernel32.SetInformationJobObject.argtypes = [
        wintypes.HANDLE, wintypes.DWORD, wintypes.LPVOID, wintypes.DWORD
    ]
    _kernel32.SetInformationJobObject.restype = wintypes.BOOL
    _kernel32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    _kernel32.AssignProcessToJobObject.restype = wintypes.BOOL
    _kernel32.ResumeThread.argtypes = [wintypes.HANDLE]
    _kernel32.ResumeThread.restype = wintypes.DWORD
    _kernel32.TerminateProcess.argtypes = [wintypes.HANDLE, wintypes.UINT]
    _kernel32.TerminateProcess.restype = wintypes.BOOL
    _kernel32.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    _kernel32.WaitForSingleObject.restype = wintypes.DWORD
    _kernel32.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
    _kernel32.GetExitCodeProcess.restype = wintypes.BOOL

    _advapi32.OpenProcessToken.argtypes = [
        wintypes.HANDLE, wintypes.DWORD, ctypes.POINTER(wintypes.HANDLE)
    ]
    _advapi32.OpenProcessToken.restype = wintypes.BOOL
    _advapi32.GetTokenInformation.argtypes = [
        wintypes.HANDLE, wintypes.DWORD, wintypes.LPVOID,
        wintypes.DWORD, ctypes.POINTER(wintypes.DWORD),
    ]
    _advapi32.GetTokenInformation.restype = wintypes.BOOL
    _advapi32.ConvertStringSidToSidW.argtypes = [
        wintypes.LPCWSTR, ctypes.POINTER(wintypes.LPVOID)
    ]
    _advapi32.ConvertStringSidToSidW.restype = wintypes.BOOL
    _advapi32.ConvertSidToStringSidW.argtypes = [
        wintypes.LPVOID, ctypes.POINTER(wintypes.LPWSTR)
    ]
    _advapi32.ConvertSidToStringSidW.restype = wintypes.BOOL
    _advapi32.EqualSid.argtypes = [wintypes.LPVOID, wintypes.LPVOID]
    _advapi32.EqualSid.restype = wintypes.BOOL
    _advapi32.LookupAccountNameW.argtypes = [
        wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.LPVOID,
        ctypes.POINTER(wintypes.DWORD), wintypes.LPWSTR,
        ctypes.POINTER(wintypes.DWORD), ctypes.POINTER(wintypes.DWORD),
    ]
    _advapi32.LookupAccountNameW.restype = wintypes.BOOL
    _advapi32.LookupAccountSidW.argtypes = [
        wintypes.LPCWSTR, wintypes.LPVOID, wintypes.LPWSTR,
        ctypes.POINTER(wintypes.DWORD), wintypes.LPWSTR,
        ctypes.POINTER(wintypes.DWORD), ctypes.POINTER(wintypes.DWORD),
    ]
    _advapi32.LookupAccountSidW.restype = wintypes.BOOL
    _advapi32.GetNamedSecurityInfoW.argtypes = [
        wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
        ctypes.POINTER(wintypes.LPVOID), ctypes.POINTER(wintypes.LPVOID),
        ctypes.POINTER(wintypes.LPVOID), ctypes.POINTER(wintypes.LPVOID),
        ctypes.POINTER(wintypes.LPVOID),
    ]
    _advapi32.GetNamedSecurityInfoW.restype = wintypes.DWORD
    _advapi32.SetEntriesInAclW.argtypes = [
        wintypes.ULONG, ctypes.POINTER(_EXPLICIT_ACCESS_W),
        wintypes.LPVOID, ctypes.POINTER(wintypes.LPVOID),
    ]
    _advapi32.SetEntriesInAclW.restype = wintypes.DWORD
    _advapi32.SetNamedSecurityInfoW.argtypes = [
        wintypes.LPWSTR, wintypes.DWORD, wintypes.DWORD,
        wintypes.LPVOID, wintypes.LPVOID, wintypes.LPVOID, wintypes.LPVOID,
    ]
    _advapi32.SetNamedSecurityInfoW.restype = wintypes.DWORD
    _advapi32.GetAclInformation.argtypes = [
        wintypes.LPVOID, wintypes.LPVOID, wintypes.DWORD, wintypes.DWORD
    ]
    _advapi32.GetAclInformation.restype = wintypes.BOOL
    _advapi32.GetAce.argtypes = [
        wintypes.LPVOID, wintypes.DWORD, ctypes.POINTER(wintypes.LPVOID)
    ]
    _advapi32.GetAce.restype = wintypes.BOOL
    _advapi32.InitializeAcl.argtypes = [wintypes.LPVOID, wintypes.DWORD, wintypes.DWORD]
    _advapi32.InitializeAcl.restype = wintypes.BOOL
    _advapi32.GetSecurityDescriptorControl.argtypes = [
        wintypes.LPVOID, ctypes.POINTER(wintypes.WORD), ctypes.POINTER(wintypes.DWORD)
    ]
    _advapi32.GetSecurityDescriptorControl.restype = wintypes.BOOL
    _advapi32.InitializeSecurityDescriptor.argtypes = [wintypes.LPVOID, wintypes.DWORD]
    _advapi32.InitializeSecurityDescriptor.restype = wintypes.BOOL
    _advapi32.SetSecurityDescriptorDacl.argtypes = [
        wintypes.LPVOID, wintypes.BOOL, wintypes.LPVOID, wintypes.BOOL
    ]
    _advapi32.SetSecurityDescriptorDacl.restype = wintypes.BOOL
    _advapi32.SetSecurityDescriptorControl.argtypes = [
        wintypes.LPVOID, wintypes.WORD, wintypes.WORD
    ]
    _advapi32.SetSecurityDescriptorControl.restype = wintypes.BOOL
    _advapi32.SetFileSecurityW.argtypes = [
        wintypes.LPCWSTR, wintypes.DWORD, wintypes.LPVOID
    ]
    _advapi32.SetFileSecurityW.restype = wintypes.BOOL
    _advapi32.AddAce.argtypes = [
        wintypes.LPVOID, wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID, wintypes.DWORD
    ]
    _advapi32.AddAce.restype = wintypes.BOOL
    _advapi32.CreateProcessWithLogonW.argtypes = [
        wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.LPCWSTR,
        wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPWSTR,
        wintypes.DWORD, wintypes.LPVOID, wintypes.LPCWSTR,
        ctypes.POINTER(_STARTUPINFOW), ctypes.POINTER(_PROCESS_INFORMATION),
    ]
    _advapi32.CreateProcessWithLogonW.restype = wintypes.BOOL

    _netapi32.NetUserAdd.argtypes = [
        wintypes.LPCWSTR, wintypes.DWORD, wintypes.LPVOID, ctypes.POINTER(wintypes.DWORD)
    ]
    _netapi32.NetUserAdd.restype = wintypes.DWORD
    _netapi32.NetUserSetInfo.argtypes = [
        wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD,
        wintypes.LPVOID, ctypes.POINTER(wintypes.DWORD),
    ]
    _netapi32.NetUserSetInfo.restype = wintypes.DWORD
    _netapi32.NetUserDel.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR]
    _netapi32.NetUserDel.restype = wintypes.DWORD
    _netapi32.NetLocalGroupAddMembers.argtypes = [
        wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD,
        wintypes.LPVOID, wintypes.DWORD,
    ]
    _netapi32.NetLocalGroupAddMembers.restype = wintypes.DWORD
    _netapi32.NetLocalGroupDelMembers.argtypes = [
        wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD,
        wintypes.LPVOID, wintypes.DWORD,
    ]
    _netapi32.NetLocalGroupDelMembers.restype = wintypes.DWORD
    _netapi32.NetUserGetLocalGroups.argtypes = [
        wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
        ctypes.POINTER(wintypes.LPVOID), wintypes.DWORD,
        ctypes.POINTER(wintypes.DWORD), ctypes.POINTER(wintypes.DWORD),
    ]
    _netapi32.NetUserGetLocalGroups.restype = wintypes.DWORD
    _netapi32.NetApiBufferFree.argtypes = [wintypes.LPVOID]
    _netapi32.NetApiBufferFree.restype = wintypes.DWORD


def _require_windows() -> None:
    if sys.platform != "win32":
        raise RuntimeError("Windows sandbox operations require Windows.")


def is_admin() -> bool:
    """Return True if the current process has Administrator privileges."""
    _require_windows()
    return bool(_shell32.IsUserAnAdmin())


def _str_to_sid(sid_str: str) -> ctypes.c_void_p:
    sid = wintypes.LPVOID()
    if not _advapi32.ConvertStringSidToSidW(sid_str, ctypes.byref(sid)):
        raise ctypes.WinError(ctypes.get_last_error())
    return sid


def _sid_to_str(sid: ctypes.c_void_p) -> str:
    pstr = wintypes.LPWSTR()
    if not _advapi32.ConvertSidToStringSidW(sid, ctypes.byref(pstr)):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        return pstr.value
    finally:
        _kernel32.LocalFree(pstr)


def dpapi_protect(secret: str) -> str:
    """Encrypt a UTF-8 string with current-user Windows DPAPI and return base64."""
    _require_windows()
    raw = secret.encode("utf-8")
    in_buf = (ctypes.c_ubyte * len(raw)).from_buffer_copy(raw)
    in_blob = _DATA_BLOB(len(raw), in_buf)
    out_blob = _DATA_BLOB()
    if not _crypt32.CryptProtectData(
        ctypes.byref(in_blob),
        "llm-eval-windows-sandbox",
        None,
        None,
        None,
        CRYPTPROTECT_UI_FORBIDDEN,
        ctypes.byref(out_blob),
    ):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        encrypted = bytes(ctypes.string_at(out_blob.pbData, out_blob.cbData))
        return base64.b64encode(encrypted).decode("ascii")
    finally:
        _kernel32.LocalFree(out_blob.pbData)


def dpapi_unprotect(encoded_b64: str) -> str:
    """Decrypt a base64-encoded DPAPI blob back to its original UTF-8 string."""
    _require_windows()
    encrypted = base64.b64decode(encoded_b64.encode("ascii"))
    in_buf = (ctypes.c_ubyte * len(encrypted)).from_buffer_copy(encrypted)
    in_blob = _DATA_BLOB(len(encrypted), in_buf)
    out_blob = _DATA_BLOB()
    if not _crypt32.CryptUnprotectData(
        ctypes.byref(in_blob),
        None,
        None,
        None,
        None,
        CRYPTPROTECT_UI_FORBIDDEN,
        ctypes.byref(out_blob),
    ):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData).decode("utf-8")
    finally:
        _kernel32.LocalFree(out_blob.pbData)


def get_current_user_sid() -> str:
    """Return the SID string of the current Windows user."""
    _require_windows()
    h_token = wintypes.HANDLE()
    if not _advapi32.OpenProcessToken(
        _kernel32.GetCurrentProcess(), TOKEN_QUERY, ctypes.byref(h_token)
    ):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        needed = wintypes.DWORD(0)
        _advapi32.GetTokenInformation(h_token, TokenUser, None, 0, ctypes.byref(needed))
        buf = ctypes.create_string_buffer(needed.value)
        if not _advapi32.GetTokenInformation(
            h_token, TokenUser, buf, needed.value, ctypes.byref(needed)
        ):
            raise ctypes.WinError(ctypes.get_last_error())
        token_user = _TOKEN_USER.from_buffer(buf)
        return _sid_to_str(token_user.User.Sid)
    finally:
        _kernel32.CloseHandle(h_token)


def lookup_account_sid(account_name: str) -> Optional[str]:
    """Resolve a local Windows account or group name to its SID string."""
    _require_windows()
    sid_size = wintypes.DWORD(0)
    domain_size = wintypes.DWORD(0)
    sid_type = wintypes.DWORD(0)
    _advapi32.LookupAccountNameW(
        None, account_name, None, ctypes.byref(sid_size),
        None, ctypes.byref(domain_size), ctypes.byref(sid_type),
    )
    if sid_size.value == 0:
        return None
    sid_buf = ctypes.create_string_buffer(sid_size.value)
    domain_buf = ctypes.create_unicode_buffer(domain_size.value)
    if not _advapi32.LookupAccountNameW(
        None, account_name, sid_buf, ctypes.byref(sid_size),
        domain_buf, ctypes.byref(domain_size), ctypes.byref(sid_type),
    ):
        return None
    return _sid_to_str(ctypes.addressof(sid_buf))


def lookup_sid_account_name(sid_str: str) -> Optional[str]:
    """Resolve a well-known SID string to its localized Windows account/group name."""
    _require_windows()
    sid = _str_to_sid(sid_str)
    try:
        name_size = wintypes.DWORD(0)
        domain_size = wintypes.DWORD(0)
        sid_type = wintypes.DWORD(0)
        _advapi32.LookupAccountSidW(
            None, sid, None, ctypes.byref(name_size),
            None, ctypes.byref(domain_size), ctypes.byref(sid_type),
        )
        if name_size.value == 0:
            return None
        name_buf = ctypes.create_unicode_buffer(name_size.value)
        domain_buf = ctypes.create_unicode_buffer(domain_size.value)
        if not _advapi32.LookupAccountSidW(
            None, sid, name_buf, ctypes.byref(name_size),
            domain_buf, ctypes.byref(domain_size), ctypes.byref(sid_type),
        ):
            return None
        return name_buf.value
    finally:
        _kernel32.LocalFree(sid)


def is_user_in_administrators(username: str) -> bool:
    """Return True if the local user belongs to BUILTIN\\Administrators."""
    _require_windows()
    buf_ptr = wintypes.LPVOID()
    entries_read = wintypes.DWORD(0)
    total_entries = wintypes.DWORD(0)
    err = _netapi32.NetUserGetLocalGroups(
        None,
        username,
        0,
        LG_INCLUDE_INDIRECT,
        ctypes.byref(buf_ptr),
        0xFFFFFFFF,
        ctypes.byref(entries_read),
        ctypes.byref(total_entries),
    )
    if err != NERR_Success:
        raise RuntimeError(
            f"Unable to verify local group membership for '{username}' (Win32 error {err})."
        )
    try:
        if not entries_read.value or not buf_ptr.value:
            return False
        groups = (_LOCALGROUP_USERS_INFO_0 * entries_read.value).from_address(buf_ptr.value)
        for index in range(entries_read.value):
            group_name = groups[index].lgrui0_name
            if not group_name:
                continue
            group_sid = lookup_account_sid(group_name)
            if group_sid == ADMINISTRATORS_GROUP_SID:
                return True
        return False
    finally:
        if buf_ptr.value:
            _netapi32.NetApiBufferFree(buf_ptr)


def validate_sandbox_config(config: WindowsSandboxConfig) -> None:
    """Verify the configured sandbox account exists, is distinct, and is non-admin."""
    _require_windows()
    current_sid = get_current_user_sid()
    resolved_sid = lookup_account_sid(config.username)
    if not resolved_sid:
        raise RuntimeError(
            f"Windows sandbox user '{config.username}' does not exist.\n"
            "Run setup from an Administrator terminal:\n"
            f"  \"{sys.executable}\" \"{Path(__file__).resolve()}\" setup"
        )
    if resolved_sid != config.sid:
        raise RuntimeError(
            f"Windows sandbox user '{config.username}' SID changed ({resolved_sid} != {config.sid}). "
            "Re-run Windows sandbox setup."
        )
    if resolved_sid == current_sid:
        raise RuntimeError(
            "Windows sandbox user must be a distinct account from the current user."
        )
    if is_user_in_administrators(config.username):
        raise RuntimeError(
            f"Refusing to run sandbox: '{config.username}' is a member of Administrators."
        )


def _iter_dacl_aces(dacl_ptr: ctypes.c_void_p) -> List[Tuple[int, int, int, ctypes.c_void_p, int]]:
    """Return (ace_type, ace_flags, mask, sid_ptr, ace_size) entries from an ACL."""
    if not dacl_ptr:
        return []
    size_info = _ACL_SIZE_INFORMATION()
    if not _advapi32.GetAclInformation(
        dacl_ptr, ctypes.byref(size_info), ctypes.sizeof(size_info), AclSizeInformation
    ):
        raise ctypes.WinError(ctypes.get_last_error())
    entries = []
    for index in range(size_info.AceCount):
        ace_ptr = wintypes.LPVOID()
        if not _advapi32.GetAce(dacl_ptr, index, ctypes.byref(ace_ptr)):
            raise ctypes.WinError(ctypes.get_last_error())
        header = _ACE_HEADER.from_address(ace_ptr.value)
        if header.AceType in (ACCESS_ALLOWED_ACE_TYPE, ACCESS_DENIED_ACE_TYPE):
            ace = _ACCESS_ACE.from_address(ace_ptr.value)
            sid_ptr = ctypes.c_void_p(ace_ptr.value + _ACCESS_ACE.SidStart.offset)
            entries.append(
                (header.AceType, header.AceFlags, ace.Mask, sid_ptr, header.AceSize)
            )
    return entries


def has_allow_ace(
    path: Path,
    sid_strs: Sequence[str],
    required_mask: int,
    required_inherit: int = 0,
) -> bool:
    """Return True if any SID in `sid_strs` already has an ALLOW ACE meeting mask/inherit."""
    return _has_ace(
        path,
        sid_strs,
        ACCESS_ALLOWED_ACE_TYPE,
        required_mask,
        required_inherit=required_inherit,
    )


def has_deny_ace(
    path: Path,
    sid_strs: Sequence[str],
    required_mask: int = 0,
    required_inherit: int = 0,
) -> bool:
    """Return True if any SID in `sid_strs` already has a DENY ACE meeting mask/inherit."""
    return _has_ace(
        path,
        sid_strs,
        ACCESS_DENIED_ACE_TYPE,
        required_mask,
        required_inherit=required_inherit,
    )


def _has_ace(
    path: Path,
    sid_strs: Sequence[str],
    expected_ace_type: int,
    required_mask: int,
    required_inherit: int = 0,
) -> bool:
    _require_windows()
    old_dacl = wintypes.LPVOID()
    sd = wintypes.LPVOID()
    sids = [_str_to_sid(s) for s in sid_strs]
    try:
        err = _advapi32.GetNamedSecurityInfoW(
            str(path), SE_FILE_OBJECT, DACL_SECURITY_INFORMATION,
            None, None, ctypes.byref(old_dacl), None, ctypes.byref(sd),
        )
        if err != 0:
            return False
        for ace_type, ace_flags, mask, ace_sid, _ in _iter_dacl_aces(old_dacl.value):
            if ace_type != expected_ace_type:
                continue
            if required_mask and (mask & required_mask) != required_mask:
                continue
            if required_inherit and (ace_flags & required_inherit) != required_inherit:
                continue
            for target_sid in sids:
                if _advapi32.EqualSid(ace_sid, target_sid):
                    return True
        return False
    finally:
        if sd.value:
            _kernel32.LocalFree(sd)
        for sid in sids:
            _kernel32.LocalFree(sid)


def is_readable_by_users(path: Path, recursive: bool = True) -> bool:
    """Return True if BUILTIN\\Users, Authenticated Users, or Everyone has RX on `path`."""
    inherit = (OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE) if (recursive and path.is_dir()) else 0
    return has_allow_ace(
        path,
        (USERS_GROUP_SID, AUTHENTICATED_USERS_SID, EVERYONE_SID),
        FILE_RX,
        required_inherit=inherit,
    )


def _is_dacl_protected(sd: ctypes.c_void_p) -> bool:
    sd_control = wintypes.WORD(0)
    sd_revision = wintypes.DWORD(0)
    if _advapi32.GetSecurityDescriptorControl(
        sd, ctypes.byref(sd_control), ctypes.byref(sd_revision)
    ):
        return bool(sd_control.value & SE_DACL_PROTECTED)
    return False


def _set_file_dacl_nonrecursive(path: Path, new_dacl: ctypes.c_void_p, dacl_protected: bool) -> None:
    """Update only `path`'s own DACL without walking children or altering inheritance."""
    sd_buf = ctypes.create_string_buffer(64)
    if not _advapi32.InitializeSecurityDescriptor(sd_buf, 1):
        raise ctypes.WinError(ctypes.get_last_error())
    if not _advapi32.SetSecurityDescriptorDacl(sd_buf, True, new_dacl, False):
        raise ctypes.WinError(ctypes.get_last_error())
    if dacl_protected:
        if not _advapi32.SetSecurityDescriptorControl(
            sd_buf, SE_DACL_PROTECTED, SE_DACL_PROTECTED
        ):
            raise ctypes.WinError(ctypes.get_last_error())
    if not _advapi32.SetFileSecurityW(str(path), DACL_SECURITY_INFORMATION, sd_buf):
        raise ctypes.WinError(ctypes.get_last_error())


def _apply_explicit_ace(path: Path, sid_str: str, mode: int, perms: int, inherit: int) -> None:
    _require_windows()
    sid = _str_to_sid(sid_str)
    old_dacl = wintypes.LPVOID()
    sd = wintypes.LPVOID()
    new_dacl = wintypes.LPVOID()
    try:
        err = _advapi32.GetNamedSecurityInfoW(
            str(path), SE_FILE_OBJECT, DACL_SECURITY_INFORMATION,
            None, None, ctypes.byref(old_dacl), None, ctypes.byref(sd),
        )
        if err != 0:
            raise ctypes.WinError(err)
        dacl_protected = _is_dacl_protected(sd)
        ea = _EXPLICIT_ACCESS_W()
        ea.grfAccessPermissions = perms
        ea.grfAccessMode = mode
        ea.grfInheritance = inherit
        ea.Trustee.TrusteeForm = TRUSTEE_IS_SID
        ea.Trustee.TrusteeType = TRUSTEE_IS_UNKNOWN
        ea.Trustee.ptstrName = sid
        err = _advapi32.SetEntriesInAclW(1, ctypes.byref(ea), old_dacl, ctypes.byref(new_dacl))
        if err != 0:
            raise ctypes.WinError(err)
        if inherit == NO_INHERITANCE:
            # Non-inheriting ACEs (ancestor stat, single-file DENY) use
            # SetFileSecurityW so Windows never walks child trees and never
            # clears SE_DACL_PROTECTED.
            _set_file_dacl_nonrecursive(path, new_dacl, dacl_protected)
        else:
            sec_info = DACL_SECURITY_INFORMATION
            if dacl_protected:
                sec_info |= PROTECTED_DACL_SECURITY_INFORMATION
            err = _advapi32.SetNamedSecurityInfoW(
                str(path), SE_FILE_OBJECT, sec_info,
                None, None, new_dacl, None,
            )
            if err != 0:
                raise ctypes.WinError(err)
    finally:
        if new_dacl.value:
            _kernel32.LocalFree(new_dacl)
        if sd.value:
            _kernel32.LocalFree(sd)
        _kernel32.LocalFree(sid)


def grant_dacl(path: Path, sid_str: str, perms: int, inherit: int) -> None:
    """Add an explicit ACCESS_ALLOWED_ACE for `sid_str` on `path`."""
    _apply_explicit_ace(path, sid_str, GRANT_ACCESS, perms, inherit)


def deny_dacl(
    path: Path,
    sid_str: str,
    perms: int = FILE_ALL_ACCESS,
    inherit: int = NO_INHERITANCE,
) -> None:
    """Add an explicit ACCESS_DENIED_ACE for `sid_str` on `path`."""
    _apply_explicit_ace(path, sid_str, DENY_ACCESS, perms, inherit)


def revoke_dacl(path: Path, sid_str: str) -> None:
    """Remove all explicit ALLOW and DENY ACEs for `sid_str` from `path`."""
    _require_windows()
    if not path.exists():
        return
    target_sid = _str_to_sid(sid_str)
    old_dacl = wintypes.LPVOID()
    sd = wintypes.LPVOID()
    try:
        err = _advapi32.GetNamedSecurityInfoW(
            str(path), SE_FILE_OBJECT, DACL_SECURITY_INFORMATION,
            None, None, ctypes.byref(old_dacl), None, ctypes.byref(sd),
        )
        if err != 0 or not old_dacl.value:
            return
        size_info = _ACL_SIZE_INFORMATION()
        if not _advapi32.GetAclInformation(
            old_dacl, ctypes.byref(size_info), ctypes.sizeof(size_info), AclSizeInformation
        ):
            return

        dacl_protected = _is_dacl_protected(sd)

        kept_all: List[Tuple[int, int]] = []
        kept_explicit: List[Tuple[int, int]] = []
        removed_any = False
        removed_inheriting = False
        for index in range(size_info.AceCount):
            ace_ptr = wintypes.LPVOID()
            if not _advapi32.GetAce(old_dacl, index, ctypes.byref(ace_ptr)):
                raise ctypes.WinError(ctypes.get_last_error())
            header = _ACE_HEADER.from_address(ace_ptr.value)
            is_inherited = bool(header.AceFlags & INHERITED_ACE)
            if (
                not is_inherited
                and header.AceType in (ACCESS_ALLOWED_ACE_TYPE, ACCESS_DENIED_ACE_TYPE)
            ):
                sid_ptr = ctypes.c_void_p(ace_ptr.value + _ACCESS_ACE.SidStart.offset)
                if _advapi32.EqualSid(sid_ptr, target_sid):
                    removed_any = True
                    if header.AceFlags & (OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE):
                        removed_inheriting = True
                    continue
            kept_all.append((ace_ptr.value, header.AceSize))
            if not is_inherited or dacl_protected:
                kept_explicit.append((ace_ptr.value, header.AceSize))

        if not removed_any:
            return

        # Allocate a new ACL large enough to hold the header + all remaining ACEs.
        new_acl_size = max(64, size_info.AclBytesInUse + 64)
        new_acl_buf = ctypes.create_string_buffer(new_acl_size)
        if not _advapi32.InitializeAcl(new_acl_buf, new_acl_size, ACL_REVISION):
            raise ctypes.WinError(ctypes.get_last_error())
        aces_to_write = kept_explicit if removed_inheriting else kept_all
        for ace_addr, ace_size in aces_to_write:
            if not _advapi32.AddAce(
                new_acl_buf, ACL_REVISION, 0xFFFFFFFF, ctypes.c_void_p(ace_addr), ace_size
            ):
                raise ctypes.WinError(ctypes.get_last_error())

        if not removed_inheriting:
            _set_file_dacl_nonrecursive(path, new_acl_buf, dacl_protected)
        else:
            sec_info = DACL_SECURITY_INFORMATION
            if dacl_protected:
                sec_info |= PROTECTED_DACL_SECURITY_INFORMATION
            err = _advapi32.SetNamedSecurityInfoW(
                str(path), SE_FILE_OBJECT, sec_info,
                None, None, new_acl_buf, None,
            )
            if err != 0:
                raise ctypes.WinError(err)
    finally:
        if sd.value:
            _kernel32.LocalFree(sd)
        _kernel32.LocalFree(target_sid)


def ensure_ancestor_stat_grants(
    sid_str: str,
    target_paths: Sequence[Path],
) -> List[Path]:
    """Grant non-inheriting stat/traverse-only access on ancestor directories.

    Node.js module resolution (`fs.realpathSync`) calls `lstat()` on every
    ancestor directory along a script or workspace path. Granting only
    `FILE_READ_ATTRIBUTES | FILE_TRAVERSE | SYNCHRONIZE` with `NO_INHERITANCE`
    satisfies `lstat()` while keeping `readdir()` and all sibling/child files
    strictly denied (equivalent to macOS Seatbelt's directory metadata rule).
    """
    granted: List[Path] = []
    seen = set()
    for target in target_paths:
        resolved = target.resolve()
        for parent in resolved.parents:
            if parent in seen or parent == parent.parent:
                continue
            seen.add(parent)
            if not parent.is_dir():
                continue
            if has_allow_ace(
                parent,
                (USERS_GROUP_SID, AUTHENTICATED_USERS_SID, EVERYONE_SID, sid_str),
                FILE_ANCESTOR_STAT,
                required_inherit=0,
            ):
                continue
            try:
                grant_dacl(parent, sid_str, FILE_ANCESTOR_STAT, NO_INHERITANCE)
                granted.append(parent)
            except OSError:
                # System-owned ancestors (e.g. C:\Users) cannot be modified by
                # non-admins and already grant traverse/stat via BUILTIN\Users.
                continue
    return granted


def ensure_runtime_rx_grants(
    sid_str: str,
    recursive_roots: Sequence[Path],
    single_paths: Sequence[Path],
) -> List[Path]:
    """Ensure `sid_str` has RX on user-local runtime paths; return newly granted paths."""
    granted: List[Path] = []
    granted.extend(
        ensure_ancestor_stat_grants(sid_str, [*single_paths, *recursive_roots])
    )
    for path in single_paths:
        if not path.exists():
            continue
        if is_readable_by_users(path, recursive=False) or has_allow_ace(
            path, (sid_str,), FILE_RX, required_inherit=0
        ):
            continue
        grant_dacl(path, sid_str, FILE_RX, NO_INHERITANCE)
        granted.append(path)
    for root in recursive_roots:
        if not root.exists():
            continue
        inherit = OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE if root.is_dir() else NO_INHERITANCE
        if is_readable_by_users(root, recursive=True) or has_allow_ace(
            root, (sid_str,), FILE_RX, required_inherit=inherit
        ):
            continue
        grant_dacl(root, sid_str, FILE_RX, inherit)
        granted.append(root)
    return granted


def _set_winlogon_hidden(username: str, hidden: bool) -> None:
    key = winreg.CreateKeyEx(
        winreg.HKEY_LOCAL_MACHINE,
        WINLOGON_SPECIAL_ACCOUNTS_KEY,
        0,
        winreg.KEY_SET_VALUE,
    )
    try:
        if hidden:
            winreg.SetValueEx(key, username, 0, winreg.REG_DWORD, 0)
        else:
            try:
                winreg.DeleteValue(key, username)
            except FileNotFoundError:
                pass
    finally:
        winreg.CloseKey(key)


def _update_local_group_membership(group_sid_str: str, member_sid_str: str, add: bool) -> None:
    group_name = lookup_sid_account_name(group_sid_str)
    if not group_name:
        return
    member_sid = _str_to_sid(member_sid_str)
    try:
        member = _LOCALGROUP_MEMBERS_INFO_0(member_sid)
        if add:
            err = _netapi32.NetLocalGroupAddMembers(
                None, group_name, 0, ctypes.byref(member), 1
            )
            if err not in (NERR_Success, ERROR_MEMBER_IN_ALIAS):
                raise RuntimeError(
                    f"Failed to add sandbox user to '{group_name}' (Win32 error {err})."
                )
        else:
            err = _netapi32.NetLocalGroupDelMembers(
                None, group_name, 0, ctypes.byref(member), 1
            )
            if err not in (NERR_Success, ERROR_MEMBER_NOT_IN_ALIAS, ERROR_NO_SUCH_ALIAS):
                raise RuntimeError(
                    f"Failed to remove sandbox user from '{group_name}' (Win32 error {err})."
                )
    finally:
        _kernel32.LocalFree(member_sid)


def _ensure_seclogon_enabled() -> None:
    """Ensure Windows Secondary Logon (`seclogon`) is not disabled."""
    probe = subprocess.run(
        ["sc.exe", "qc", "seclogon"],
        capture_output=True,
        text=True,
        check=False,
    )
    if probe.returncode == 0 and "DISABLED" in probe.stdout.upper():
        subprocess.run(
            ["sc.exe", "config", "seclogon", "start=", "demand"],
            capture_output=True,
            text=True,
            check=False,
        )


def setup_windows_sandbox(
    username: str = DEFAULT_SANDBOX_USERNAME,
    config_path: Optional[Path] = None,
) -> WindowsSandboxConfig:
    """One-time Administrator setup: create hidden non-admin sandbox user + DPAPI config."""
    _require_windows()
    if not is_admin():
        raise RuntimeError(
            "Windows sandbox setup requires Administrator privileges.\n"
            "Open an elevated (Administrator) PowerShell or Command Prompt and run:\n"
            f"  \"{sys.executable}\" \"{Path(__file__).resolve()}\" setup"
        )

    password = generate_sandbox_password()
    flags = UF_SCRIPT | UF_NORMAL_ACCOUNT | UF_PASSWD_CANT_CHANGE | UF_DONT_EXPIRE_PASSWD
    info1 = _USER_INFO_1(
        usri1_name=username,
        usri1_password=password,
        usri1_password_age=0,
        usri1_priv=USER_PRIV_USER,
        usri1_home_dir=None,
        usri1_comment="Isolated non-admin account for llm-eval Pi evaluations",
        usri1_flags=flags,
        usri1_script_path=None,
    )
    parm_err = wintypes.DWORD(0)
    err = _netapi32.NetUserAdd(None, 1, ctypes.byref(info1), ctypes.byref(parm_err))
    if err == NERR_UserExists:
        pw_info = _USER_INFO_1003(usri1003_password=password)
        err = _netapi32.NetUserSetInfo(
            None, username, 1003, ctypes.byref(pw_info), ctypes.byref(parm_err)
        )
        if err != NERR_Success:
            raise RuntimeError(
                f"Failed to update password for '{username}' (Win32 error {err})."
            )
        flag_info = _USER_INFO_1008(usri1008_flags=flags)
        err = _netapi32.NetUserSetInfo(
            None, username, 1008, ctypes.byref(flag_info), ctypes.byref(parm_err)
        )
        if err != NERR_Success:
            raise RuntimeError(
                f"Failed to update account flags for '{username}' (Win32 error {err})."
            )
    elif err != NERR_Success:
        raise RuntimeError(
            f"Failed to create local user '{username}' (Win32 error {err}, param {parm_err.value})."
        )

    sid = lookup_account_sid(username)
    if not sid:
        raise RuntimeError(f"Created user '{username}' but could not resolve its SID.")
    if sid == get_current_user_sid():
        raise RuntimeError("Sandbox username cannot match the current user.")

    # Ensure least-privilege membership: Users only, never Administrators or RDP.
    _update_local_group_membership(USERS_GROUP_SID, sid, add=True)
    _update_local_group_membership(ADMINISTRATORS_GROUP_SID, sid, add=False)
    _update_local_group_membership(REMOTE_DESKTOP_USERS_SID, sid, add=False)
    _set_winlogon_hidden(username, hidden=True)
    _ensure_seclogon_enabled()

    # Pre-grant RX on user-local Node/Pi runtimes (e.g. AppData\Roaming\npm\node_modules\...)
    # so individual evaluations do not have to walk thousands of files on each run.
    runtime_grants: List[str] = []
    try:
        recursive_roots, single_paths, _ = discover_windows_runtime_layout()
        granted = ensure_runtime_rx_grants(sid, recursive_roots, single_paths)
        runtime_grants = [str(p) for p in granted]
        # Keep any already-granted user-local paths recorded so teardown cleans them.
        for candidate in (*single_paths, *recursive_roots):
            if candidate.exists() and not is_readable_by_users(candidate, recursive=candidate.is_dir()):
                if str(candidate) not in runtime_grants:
                    runtime_grants.append(str(candidate))
    except RuntimeError:
        # Node/Pi may be installed later; PiIsolation will grant them on first run.
        pass

    config = WindowsSandboxConfig(
        username=username,
        domain=".",
        sid=sid,
        password_dpapi_b64=dpapi_protect(password),
        runtime_grants=tuple(runtime_grants),
    )
    saved_path = save_config(config, config_path)
    print(f"[+] Windows sandbox user '{username}' configured ({sid}).")
    print(f"[+] Saved DPAPI-protected sandbox config to: {saved_path}")
    if runtime_grants:
        print("[+] Pre-granted read/execute runtime paths:")
        for grant in runtime_grants:
            print(f"    - {grant}")
    return config


def teardown_windows_sandbox(
    username: str = DEFAULT_SANDBOX_USERNAME,
    config_path: Optional[Path] = None,
) -> None:
    """Remove the sandbox user, registry hide entry, runtime ACL grants, and config."""
    _require_windows()
    if not is_admin():
        raise RuntimeError(
            "Windows sandbox teardown requires Administrator privileges.\n"
            "Open an elevated (Administrator) PowerShell or Command Prompt and run:\n"
            f"  \"{sys.executable}\" \"{Path(__file__).resolve()}\" teardown"
        )

    path = config_path or get_config_path()
    sid: Optional[str] = None
    runtime_grants: Tuple[str, ...] = ()
    if path.is_file():
        try:
            cfg = load_config(path)
            username = cfg.username
            sid = cfg.sid
            runtime_grants = cfg.runtime_grants
        except RuntimeError:
            pass
    if not sid:
        sid = lookup_account_sid(username)

    if sid:
        for grant_str in runtime_grants:
            try:
                revoke_dacl(Path(grant_str), sid)
            except OSError:
                pass

    _set_winlogon_hidden(username, hidden=False)
    err = _netapi32.NetUserDel(None, username)
    if err not in (NERR_Success, NERR_UserNotFound):
        raise RuntimeError(f"Failed to delete local user '{username}' (Win32 error {err}).")

    if path.exists():
        path.unlink()
    print(f"[+] Windows sandbox user '{username}' removed and configuration cleaned up.")


def build_unicode_env_block(env: Dict[str, str]) -> ctypes.Array:
    """Build a Windows double-NUL-terminated UTF-16LE environment block."""
    # Windows requires environment keys to be sorted case-insensitively.
    items = sorted(env.items(), key=lambda pair: pair[0].upper())
    payload = "\0".join(f"{key}={value}" for key, value in items) + "\0\0"
    return ctypes.create_unicode_buffer(payload)


def _create_inheritable_pipe() -> Tuple[int, int]:
    """Create a Win32 anonymous pipe with inheritable handles (read_handle, write_handle)."""
    sa = _SECURITY_ATTRIBUTES(ctypes.sizeof(_SECURITY_ATTRIBUTES), None, True)
    read_h = wintypes.HANDLE()
    write_h = wintypes.HANDLE()
    if not _kernel32.CreatePipe(ctypes.byref(read_h), ctypes.byref(write_h), ctypes.byref(sa), 0):
        raise ctypes.WinError(ctypes.get_last_error())
    return int(read_h.value), int(write_h.value)


def _pump_stream(
    src_fd: Optional[int],
    dst_fd: int,
    close_dst: Optional[object] = None,
) -> None:
    """Relay raw bytes between two file descriptors until EOF or broken pipe."""
    try:
        if src_fd is None:
            return
        while True:
            chunk = os.read(src_fd, 8192)
            if not chunk:
                break
            view = memoryview(chunk)
            while view:
                written = os.write(dst_fd, view)
                view = view[written:]
    except OSError:
        pass
    finally:
        if callable(close_dst):
            close_dst()


def apply_private_home_env(
    env: Dict[str, str],
    home: Path,
    path_entries: Optional[Sequence[str]] = None,
) -> Dict[str, str]:
    """Return a copy of `env` pointed at the sandbox's private home directory."""
    updated = dict(env)
    home_str = str(home)
    drive = home.drive
    home_path = home_str[len(drive):] if drive and home_str.startswith(drive) else home_str
    updated.update(
        {
            "HOME": home_str,
            "USERPROFILE": home_str,
            "HOMEDRIVE": drive or "C:",
            "HOMEPATH": home_path,
            "APPDATA": str(home / "AppData" / "Roaming"),
            "LOCALAPPDATA": str(home / "AppData" / "Local"),
            "TEMP": str(home / "Temp"),
            "TMP": str(home / "Temp"),
            "TMPDIR": str(home / "Temp"),
            "PI_CODING_AGENT_DIR": str(home / ".pi" / "agent"),
            "XDG_CACHE_HOME": str(home / ".cache"),
            "XDG_CONFIG_HOME": str(home / ".config"),
            "NODE_COMPILE_CACHE": str(home / "node-compile-cache"),
        }
    )
    if path_entries is not None:
        updated["PATH"] = os.pathsep.join(path_entries)
    return updated


def exec_in_windows_sandbox(
    cmd: Sequence[str],
    *,
    cwd: Path,
    home: Optional[Path] = None,
    env: Optional[Dict[str, str]] = None,
    config_path: Optional[Path] = None,
) -> int:
    """Launch `cmd` as the sandbox user inside a kill-on-close Windows Job Object."""
    _require_windows()
    config = load_config(config_path)
    validate_sandbox_config(config)
    password = dpapi_unprotect(config.password_dpapi_b64)

    effective_env = dict(os.environ if env is None else env)
    if home is not None:
        # Ensure private-home variables are always enforced even if the caller
        # ran `sandbox.command(...)` without calling `sandbox.environment(...)`.
        path_entries = None
        if effective_env.get("HOME") != str(home):
            _, _, path_entries = discover_windows_runtime_layout(
                search_path=effective_env.get("PATH")
            )
        effective_env = apply_private_home_env(
            effective_env, home, path_entries=path_entries
        )
    resolved_cmd = resolve_windows_command(cmd, search_path=effective_env.get("PATH"))
    cmd_line = subprocess.list2cmdline(resolved_cmd)
    env_block = build_unicode_env_block(effective_env)

    # Create explicit pipes for stdin/stdout/stderr so CreateProcessWithLogonW
    # works identically whether invoked with redirected pipes or a console.
    in_r, in_w = _create_inheritable_pipe()
    out_r, out_w = _create_inheritable_pipe()
    err_r, err_w = _create_inheritable_pipe()
    # Keep parent-side ends non-inheritable so EOF propagates cleanly.
    _kernel32.SetHandleInformation(in_w, HANDLE_FLAG_INHERIT, 0)
    _kernel32.SetHandleInformation(out_r, HANDLE_FLAG_INHERIT, 0)
    _kernel32.SetHandleInformation(err_r, HANDLE_FLAG_INHERIT, 0)

    h_job = _kernel32.CreateJobObjectW(None, None)
    if not h_job:
        for handle in (in_r, in_w, out_r, out_w, err_r, err_w):
            _kernel32.CloseHandle(handle)
        raise ctypes.WinError(ctypes.get_last_error())

    job_info = _JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
    job_info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    if not _kernel32.SetInformationJobObject(
        h_job,
        JobObjectExtendedLimitInformation,
        ctypes.byref(job_info),
        ctypes.sizeof(job_info),
    ):
        err = ctypes.get_last_error()
        _kernel32.CloseHandle(h_job)
        for handle in (in_r, in_w, out_r, out_w, err_r, err_w):
            _kernel32.CloseHandle(handle)
        raise ctypes.WinError(err)

    si = _STARTUPINFOW()
    si.cb = ctypes.sizeof(_STARTUPINFOW)
    si.dwFlags = STARTF_USESTDHANDLES
    si.hStdInput = in_r
    si.hStdOutput = out_w
    si.hStdError = err_w
    pi = _PROCESS_INFORMATION()

    cmd_buf = ctypes.create_unicode_buffer(cmd_line)
    # CreateProcessWithLogonW spawns via seclogon; pass CREATE_SUSPENDED so the
    # process is bound to the kill-on-close Job Object before executing a single
    # instruction.
    created = _advapi32.CreateProcessWithLogonW(
        config.username,
        config.domain,
        password,
        0,
        None,
        cmd_buf,
        CREATE_SUSPENDED | CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT,
        ctypes.byref(env_block),
        str(cwd),
        ctypes.byref(si),
        ctypes.byref(pi),
    )
    # Close child-side pipe ends in the parent regardless of launch outcome.
    for handle in (in_r, out_w, err_w):
        _kernel32.CloseHandle(handle)

    if not created:
        err = ctypes.get_last_error()
        for handle in (in_w, out_r, err_r, h_job):
            _kernel32.CloseHandle(handle)
        raise ctypes.WinError(err)

    in_w_fd = msvcrt.open_osfhandle(in_w, os.O_WRONLY)
    out_r_fd = msvcrt.open_osfhandle(out_r, os.O_RDONLY)
    err_r_fd = msvcrt.open_osfhandle(err_r, os.O_RDONLY)

    in_w_lock = threading.Lock()
    in_w_closed = False

    def _close_in_w_once() -> None:
        nonlocal in_w_closed
        with in_w_lock:
            if in_w_closed:
                return
            in_w_closed = True
            try:
                os.close(in_w_fd)
            except OSError:
                pass

    try:
        if not _kernel32.AssignProcessToJobObject(h_job, pi.hProcess):
            err = ctypes.get_last_error()
            _kernel32.TerminateProcess(pi.hProcess, 1)
            raise ctypes.WinError(err)

        if _kernel32.ResumeThread(pi.hThread) == 0xFFFFFFFF:
            err = ctypes.get_last_error()
            _kernel32.TerminateProcess(pi.hProcess, 1)
            raise ctypes.WinError(err)

        try:
            stdin_fd: Optional[int] = sys.stdin.fileno() if sys.stdin is not None else None
        except (AttributeError, OSError, ValueError):
            stdin_fd = None

        # Relay stdin (daemon so we don't block exit if child doesn't read stdin)
        # and stdout/stderr (joined so all output flushes before exit).
        stdin_thread = threading.Thread(
            target=_pump_stream,
            args=(stdin_fd, in_w_fd, _close_in_w_once),
            daemon=True,
        )
        stdout_thread = threading.Thread(
            target=_pump_stream,
            args=(out_r_fd, sys.stdout.fileno(), None),
            daemon=True,
        )
        stderr_thread = threading.Thread(
            target=_pump_stream,
            args=(err_r_fd, sys.stderr.fileno(), None),
            daemon=True,
        )
        stdin_thread.start()
        stdout_thread.start()
        stderr_thread.start()

        _kernel32.WaitForSingleObject(pi.hProcess, INFINITE)
        exit_code = wintypes.DWORD(1)
        _kernel32.GetExitCodeProcess(pi.hProcess, ctypes.byref(exit_code))

        stdout_thread.join(timeout=5)
        stderr_thread.join(timeout=5)
        return int(exit_code.value)
    finally:
        for fd in (out_r_fd, err_r_fd):
            try:
                os.close(fd)
            except OSError:
                pass
        _close_in_w_once()
        _kernel32.CloseHandle(pi.hThread)
        _kernel32.CloseHandle(pi.hProcess)
        # Closing the Job Object handle guarantees any stray descendants terminate.
        _kernel32.CloseHandle(h_job)


def print_status(config_path: Optional[Path] = None) -> int:
    """Print diagnostic status for the Windows sandbox configuration."""
    _require_windows()
    path = config_path or get_config_path()
    print(f"Config path: {path}")
    if not path.is_file():
        print("Status: NOT CONFIGURED")
        print(
            f"Run from an Administrator terminal: \"{sys.executable}\" \"{Path(__file__).resolve()}\" setup"
        )
        return 1
    try:
        config = load_config(path)
        validate_sandbox_config(config)
        _ = dpapi_unprotect(config.password_dpapi_b64)
    except Exception as exc:
        print(f"Status: INVALID ({exc})")
        return 1
    print(f"Status: READY (user={config.username}, sid={config.sid})")
    return 0


def _cli_main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Manage and execute commands inside the Windows Pi sandbox."
    )
    sub = parser.add_subparsers(dest="action", required=True)

    setup_p = sub.add_parser("setup", help="One-time Administrator setup of the sandbox user")
    setup_p.add_argument("--username", default=DEFAULT_SANDBOX_USERNAME)
    setup_p.add_argument("--config", type=Path, default=None)

    teardown_p = sub.add_parser("teardown", help="Remove the sandbox user and configuration")
    teardown_p.add_argument("--username", default=DEFAULT_SANDBOX_USERNAME)
    teardown_p.add_argument("--config", type=Path, default=None)

    status_p = sub.add_parser("status", help="Verify Windows sandbox readiness")
    status_p.add_argument("--config", type=Path, default=None)

    exec_p = sub.add_parser("exec", help="Execute a command inside the sandbox")
    exec_p.add_argument("--cwd", type=Path, required=True)
    exec_p.add_argument("--home", type=Path, default=None)
    exec_p.add_argument("--config", type=Path, default=None)
    exec_p.add_argument("cmd", nargs=argparse.REMAINDER)

    args = parser.parse_args(argv)
    if args.action == "setup":
        setup_windows_sandbox(username=args.username, config_path=args.config)
        return 0
    if args.action == "teardown":
        teardown_windows_sandbox(username=args.username, config_path=args.config)
        return 0
    if args.action == "status":
        return print_status(config_path=args.config)
    if args.action == "exec":
        cmd = list(args.cmd)
        if cmd and cmd[0] == "--":
            cmd = cmd[1:]
        if not cmd:
            parser.error("exec requires a command after --")
        return exec_in_windows_sandbox(
            cmd, cwd=args.cwd, home=args.home, config_path=args.config
        )
    return 1


if __name__ == "__main__":
    try:
        sys.exit(_cli_main())
    except Exception as exc:
        sys.stderr.write(f"[-] {exc}\n")
        sys.exit(1)

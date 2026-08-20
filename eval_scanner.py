"""Evaluation directory scanner and data loader.

Discovers evaluation runs under ``evals/``, parses directory names,
loads result JSON and runtime-check data, and assembles a list of
scored evaluation entries ready for dashboard rendering.

Extracted from ``generate_index.py`` to separate filesystem I/O and
naming conventions from the pure scoring algorithms and the HTML
rendering pipeline.
"""

import json
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from evaluation_metrics import (
    RESULT_FILES,
    RunMetrics,
    _parse_result_data,
    load_run_metrics,
)
from eval_scoring import (
    deterministic_score,
    first_preview_link,
    read_text,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EVALS_DIR = Path("evals")
RUNTIME_CHECK_FILE = "runtime_check.json"
NON_RESULT_FILES = {"server.log"}

AGENT_DISPLAY_NAMES = {
    "mistral": "Mistral Vibe",
    "gemini": "Antigravity CLI",
    "agy": "Antigravity CLI",
    "antigravity": "Antigravity CLI",
    "claude": "Claude Code",
    "codex": "Codex CLI",
    "crush": "Charmbracelet Crush",
    "opencode": "OpenCode CLI",
    "pi-wiggum": "Pi Wiggum",
    "pi": "Pi Coding Agent",
    "qoder": "Qoder CLI",
    "vibe": "Mistral Vibe",
}

AGENT_COLORS = {
    "Claude Code": "#b45309",
    "Codex CLI": "#111827",
    "Antigravity CLI": "#2563eb",
    "Gemini CLI": "#2563eb",
    "OpenCode CLI": "#047857",
    "Mistral Vibe": "#dc2626",
    "Charmbracelet Crush": "#7c3aed",
    "Pi Coding Agent": "#0e7490",
    "Pi Wiggum": "#be123c",
    "Qoder CLI": "#4f46e5",
}


# ---------------------------------------------------------------------------
# Prompt discovery
# ---------------------------------------------------------------------------


def get_known_prompts() -> set:
    """Return the set of prompt stems found at the repository root."""
    prompts = set()
    excluded = {"README", "CLAUDE", "AGENTS"}
    for pattern in ("*.txt", "*.md"):
        for f in Path(".").glob(pattern):
            if f.stem not in excluded:
                prompts.add(f.stem)
    return prompts


# ---------------------------------------------------------------------------
# Naming helpers
# ---------------------------------------------------------------------------


def get_display_name(agent_raw: str) -> str:
    """Map a raw agent slug to its human-friendly display name."""
    return AGENT_DISPLAY_NAMES.get(agent_raw.lower(), agent_raw.title())


def get_agent_color(agent_name: str) -> str:
    """Return the brand colour for *agent_name*."""
    return AGENT_COLORS.get(agent_name, "#64748b")


def detect_provider(summary_path: Path) -> str:
    """Infer the provider label from a ``summary.html`` file."""
    content = read_text(summary_path)
    if not content:
        return "unknown"
    if "Cloud API" in content:
        m = re.search(r'Provider:</span>\s*<span[^>]*>([^<]+)', content)
        return m.group(1).strip() if m else "Cloud"
    if "LM Studio" in content:
        return "Local (LM Studio)"
    m = re.search(r'Provider:</span>\s*<span[^>]*>([^<]+)', content)
    if m:
        provider = m.group(1).strip()
        return "Local (LM Studio)" if provider.lower() == "lmstudio" else provider
    return "unknown"


def parse_directory_name(dir_name: str, known_prompts: set) -> Dict[str, str]:
    """Parse an eval directory name into Agent / Model / Prompt parts."""
    sep = "_" if "_" in dir_name else "-"
    parts = dir_name.split(sep)
    if len(parts) < 3:
        return {"Agent": "Unknown", "Model": dir_name, "Prompt": "", "Raw": dir_name}

    agent = parts[0]
    if len(parts) > 1 and f"{parts[0]}-{parts[1]}" in AGENT_DISPLAY_NAMES:
        agent = f"{parts[0]}-{parts[1]}"
        parts = [agent] + parts[2:]
    model_parts = parts[1:]
    prompt = ""
    model = sep.join(model_parts)

    for i in range(len(model_parts) - 1, 0, -1):
        candidate = sep.join(model_parts[i:])
        if candidate in known_prompts:
            prompt = candidate
            model = sep.join(model_parts[:i])
            break

    return {
        "Agent": get_display_name(agent),
        "Model": model,
        "Prompt": prompt,
        "Raw": dir_name,
    }


# ---------------------------------------------------------------------------
# Data loaders
# ---------------------------------------------------------------------------


def parse_result_json(work_dir: Path) -> Dict:
    """Load the raw result JSON, delegating to :func:`load_run_metrics`."""
    metrics = load_run_metrics(work_dir)
    if metrics.parse_error:
        return {"_result_file": metrics.result_file, "_parse_error": True}
    if not metrics.result_file:
        return {}
    # Re-read raw data for callers that inspect non-metric fields
    path = work_dir / metrics.result_file
    try:
        data = json.loads(read_text(path))
        data["_result_file"] = metrics.result_file
        return data
    except (OSError, json.JSONDecodeError):
        return {"_result_file": metrics.result_file, "_parse_error": True}


def parse_runtime_check(work_dir: Path) -> Dict:
    """Load and return the ``runtime_check.json`` for a run directory."""
    path = work_dir / RUNTIME_CHECK_FILE
    if not path.exists():
        return {}
    try:
        data = json.loads(read_text(path))
        return data if isinstance(data, dict) else {"_parse_error": True}
    except json.JSONDecodeError:
        return {"_parse_error": True}


def parse_metrics(result: Dict) -> Dict[str, float]:
    """Convert a raw result dict to a flat metrics dict.

    Delegates parsing to :func:`evaluation_metrics._parse_result_data`
    for consistency with the per-run report, then converts to a dict
    for backward compatibility with the dashboard renderer.
    """
    if not result:
        return {
            "input_tokens": 0, "output_tokens": 0, "total_tokens": 0,
            "cache_read_tokens": 0, "cost_usd": 0.0, "num_turns": 0,
            "duration_ms": 0, "success": None, "error": False,
            "token_counts_estimated": False, "cost_available": None,
            "terminal_reason": "", "termination": {},
        }

    result_file = result.get("_result_file", "")
    # Strip internal keys before parsing
    clean = {k: v for k, v in result.items() if not k.startswith("_")}
    m = _parse_result_data(clean, result_file)

    return {
        "input_tokens": m.input_tokens,
        "output_tokens": m.output_tokens,
        "total_tokens": m.total_tokens,
        "cache_read_tokens": m.cache_read_tokens,
        "cost_usd": m.cost_usd,
        "num_turns": m.num_turns,
        "duration_ms": m.duration_ms,
        "success": m.success,
        "error": m.error or result.get("_parse_error", False),
        "token_counts_estimated": m.token_counts_estimated,
        "cost_available": m.cost_available,
        "terminal_reason": m.terminal_reason,
        "termination": m.termination,
    }


# ---------------------------------------------------------------------------
# Scanner
# ---------------------------------------------------------------------------


def scan_evaluations() -> List[Dict]:
    """Walk ``EVALS_DIR`` and return a sorted list of scored eval entries."""
    known_prompts = get_known_prompts()
    evaluations = []
    if not EVALS_DIR.exists():
        return evaluations

    for item in EVALS_DIR.iterdir():
        if not item.is_dir():
            continue
        if not any(
            path.is_file() and path.name.lower() not in NON_RESULT_FILES
            for path in item.rglob("*")
        ):
            continue
        summary_path = item / "summary.html"
        result = parse_result_json(item)
        metrics = parse_metrics(result)
        runtime = parse_runtime_check(item)
        info = parse_directory_name(item.name, known_prompts)
        info["Path"] = item
        info["HasReport"] = summary_path.exists()
        info["ReportLink"] = f"evals/{item.name}/summary.html"
        info["PreviewLink"] = first_preview_link(item)
        info["Provider"] = detect_provider(summary_path)
        info["Result"] = result
        info["Metrics"] = metrics
        info["Runtime"] = runtime
        info["Score"] = deterministic_score(info)
        evaluations.append(info)

    evaluations.sort(key=lambda x: (-x["Score"]["total"], x["Agent"].lower(), x["Model"].lower()))
    return evaluations

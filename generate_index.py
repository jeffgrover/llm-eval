#!/usr/bin/env python3
import html
import json
import re
from collections import deque
from pathlib import Path
from typing import Dict, List, Optional, Tuple

EVALS_DIR = Path("evals")
INDEX_FILE = Path("index.html")
MAX_ARTIFACT_BYTES = 50 * 1000 * 1000
TARGET_ARTIFACT_BYTES = 45 * 1000 * 1000
TRUNCATE_HEAD_LINES = 100
TRUNCATE_TAIL_LINES = 100
TRUNCATION_MARKER_PREFIX = "LLM-EVAL-TRUNCATED"

RESULT_FILES = (
    "CLAUDE_RESULT.JSON",
    "GEMINI_RESULT.JSON",
    "OPENCODE_RESULT.JSON",
    "PI_WIGGUM_RESULT.JSON",
    "PI_RESULT.JSON",
    "CODEX_RESULT.JSON",
    "VIBE_RESULT.JSON",
    "QODER_RESULT.JSON",
)

RUNTIME_CHECK_FILE = "runtime_check.json"

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


def esc(value) -> str:
    return html.escape(str(value), quote=True)


def read_text(path: Path, limit: Optional[int] = None) -> str:
    if not path.exists() or not path.is_file():
        return ""
    text = path.read_text(encoding="utf-8", errors="ignore")
    return text[:limit] if limit and len(text) > limit else text


def truncation_marker(path: Path, removed_lines: int, removed_bytes: int, note: str = "") -> bytes:
    message = (
        f"{TRUNCATION_MARKER_PREFIX}: removed {removed_lines:,} lines "
        f"({removed_bytes:,} bytes) from the middle of this oversized generated file."
    )
    if note:
        message = f"{message} {note}"
    suffix = path.suffix.lower()
    if suffix in {".jsonl", ".ndjson"}:
        return (json.dumps({"truncated": True, "message": message}) + "\n").encode("utf-8")
    if suffix in {".html", ".htm", ".xml", ".svg"}:
        return f"\n<!-- {message} -->\n".encode("utf-8")
    if suffix in {".js", ".css", ".c", ".cpp", ".h", ".java", ".ts"}:
        return f"\n/* {message} */\n".encode("utf-8")
    if suffix in {".py", ".sh", ".rb", ".pl", ".yaml", ".yml", ".toml"}:
        return f"\n# {message}\n".encode("utf-8")
    return f"\n{message}\n".encode("utf-8")


def fit_truncated_content(path: Path, content: bytes, removed_lines: int, original_size: int) -> bytes:
    if len(content) <= TARGET_ARTIFACT_BYTES:
        return content

    marker_token = TRUNCATION_MARKER_PREFIX.encode("utf-8")
    content = b"".join(line for line in content.splitlines(keepends=True) if marker_token not in line)
    placeholder = truncation_marker(path, removed_lines, 0, "Retained edge content was byte-capped because one or more lines were extremely large.")
    side_budget = max((TARGET_ARTIFACT_BYTES - len(placeholder)) // 2, 0)
    content = content[:side_budget] + placeholder + content[-side_budget:]
    removed_bytes = original_size - len(content)
    marker = truncation_marker(path, removed_lines, removed_bytes, "Retained edge content was byte-capped because one or more lines were extremely large.")
    side_budget = max((TARGET_ARTIFACT_BYTES - len(marker)) // 2, 0)
    return content[:side_budget] + marker + content[-side_budget:]


def shorten_oversized_file(path: Path) -> Optional[Tuple[int, int, int]]:
    original_size = path.stat().st_size
    if original_size <= MAX_ARTIFACT_BYTES:
        return None

    head: List[bytes] = []
    tail = deque(maxlen=TRUNCATE_TAIL_LINES)
    total_lines = 0

    with path.open("rb") as f:
        for line in f:
            total_lines += 1
            if len(head) < TRUNCATE_HEAD_LINES:
                head.append(line)
            tail.append(line)

    if total_lines <= TRUNCATE_HEAD_LINES + TRUNCATE_TAIL_LINES:
        content = path.read_bytes()
        capped = fit_truncated_content(path, content, 0, original_size)
        if len(capped) >= len(content):
            return None
        tmp_path = path.with_name(f"{path.name}.tmp-truncated")
        tmp_path.write_bytes(capped)
        tmp_path.replace(path)
        return original_size, path.stat().st_size, 0

    if TRUNCATION_MARKER_PREFIX.encode("utf-8") in b"".join(head):
        return None

    tail_lines = list(tail)
    removed_lines = total_lines - len(head) - len(tail_lines)
    marker = truncation_marker(path, removed_lines, 0)
    new_content = b"".join(head) + marker + b"".join(tail_lines)
    removed_bytes = original_size - len(new_content)
    marker = truncation_marker(path, removed_lines, removed_bytes)
    new_content = b"".join(head) + marker + b"".join(tail_lines)
    new_content = fit_truncated_content(path, new_content, removed_lines, original_size)

    tmp_path = path.with_name(f"{path.name}.tmp-truncated")
    tmp_path.write_bytes(new_content)
    tmp_path.replace(path)
    return original_size, path.stat().st_size, removed_lines


def shorten_oversized_artifacts() -> List[Tuple[Path, int, int, int]]:
    if not EVALS_DIR.exists():
        return []

    shortened = []
    for path in EVALS_DIR.rglob("*"):
        if not path.is_file():
            continue
        result = shorten_oversized_file(path)
        if result:
            old_size, new_size, removed_lines = result
            shortened.append((path, old_size, new_size, removed_lines))
    return shortened


def get_known_prompts() -> set:
    prompts = set()
    excluded = {"README", "CLAUDE", "AGENTS"}
    for pattern in ("*.txt", "*.md"):
        for f in Path(".").glob(pattern):
            if f.stem not in excluded:
                prompts.add(f.stem)
    return prompts


def get_display_name(agent_raw: str) -> str:
    return AGENT_DISPLAY_NAMES.get(agent_raw.lower(), agent_raw.title())


def get_agent_color(agent_name: str) -> str:
    return AGENT_COLORS.get(agent_name, "#64748b")


def detect_provider(summary_path: Path) -> str:
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


def parse_result_json(work_dir: Path) -> Dict:
    for filename in RESULT_FILES:
        path = work_dir / filename
        if path.exists():
            try:
                data = json.loads(read_text(path))
                data["_result_file"] = filename
                return data
            except json.JSONDecodeError:
                return {"_result_file": filename, "_parse_error": True}
    return {}


def parse_runtime_check(work_dir: Path) -> Dict:
    path = work_dir / RUNTIME_CHECK_FILE
    if not path.exists():
        return {}
    try:
        data = json.loads(read_text(path))
        return data if isinstance(data, dict) else {"_parse_error": True}
    except json.JSONDecodeError:
        return {"_parse_error": True}


def parse_metrics(result: Dict) -> Dict[str, float]:
    metrics = {
        "input_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
        "cache_read_tokens": 0,
        "cost_usd": 0.0,
        "num_turns": 0,
        "duration_ms": 0,
        "success": None,
        "error": False,
        "token_counts_estimated": False,
        "cost_available": None,
    }
    if not result:
        return metrics

    stats = result.get("stats", {})
    if stats:
        metrics["input_tokens"] = stats.get("input_tokens", stats.get("input", 0)) or 0
        metrics["output_tokens"] = stats.get("output_tokens", 0) or 0
        metrics["total_tokens"] = stats.get("total_tokens", 0) or 0
        metrics["cache_read_tokens"] = stats.get("cached", 0) or 0
        metrics["duration_ms"] = stats.get("duration_ms", 0) or result.get("duration_ms", 0) or 0
        metrics["num_turns"] = stats.get("tool_calls", 0) or 0
        metrics["success"] = result.get("status") == "success"
        metrics["error"] = result.get("status") not in (None, "success")
        metrics["token_counts_estimated"] = bool(
            result.get("token_counts_estimated")
        )
        if "cost_available" in result:
            metrics["cost_available"] = bool(result["cost_available"])
        return metrics

    if result.get("token_counts_estimated"):
        metrics["input_tokens"] = result.get("input_tokens", 0) or 0
        metrics["output_tokens"] = result.get("output_tokens", 0) or 0
        metrics["total_tokens"] = (
            result.get("total_tokens")
            or metrics["input_tokens"] + metrics["output_tokens"]
        )
        metrics["token_counts_estimated"] = True
    elif "modelUsage" in result:
        for model_data in result.get("modelUsage", {}).values():
            metrics["input_tokens"] += (
                model_data.get("inputTokens", 0)
                + model_data.get("cacheCreationInputTokens", 0)
                + model_data.get("cacheReadInputTokens", 0)
            )
            metrics["output_tokens"] += model_data.get("outputTokens", 0)
            metrics["cache_read_tokens"] += model_data.get("cacheReadInputTokens", 0)
            metrics["cost_usd"] += model_data.get("costUSD", 0) or 0
        metrics["total_tokens"] = metrics["input_tokens"] + metrics["output_tokens"]
    else:
        usage = result.get("usage", {})
        metrics["input_tokens"] = (
            result.get("input_tokens")
            or result.get("prompt_tokens")
            or usage.get("input_tokens", 0)
            + usage.get("cache_creation_input_tokens", 0)
            + usage.get("cache_read_input_tokens", 0)
            or 0
        )
        metrics["output_tokens"] = (
            result.get("output_tokens")
            or result.get("completion_tokens")
            or usage.get("output_tokens", 0)
            or 0
        )
        metrics["total_tokens"] = result.get("total_tokens") or metrics["input_tokens"] + metrics["output_tokens"]
        metrics["cache_read_tokens"] = result.get("cache_read_tokens") or usage.get("cache_read_input_tokens", 0) or 0
        metrics["cost_usd"] = result.get("cost_usd") or result.get("total_cost_usd") or 0.0

    if "cost_available" in result:
        metrics["cost_available"] = bool(result["cost_available"])
    metrics["duration_ms"] = result.get("duration_ms", 0) or result.get("duration_api_ms", 0) or 0
    metrics["num_turns"] = result.get("num_turns", 0) or 0
    metrics["success"] = (
        result.get("subtype") == "success"
        or result.get("status") == "success"
        or result.get("terminal_reason") == "completed"
    )
    metrics["error"] = bool(result.get("is_error")) or bool(result.get("_parse_error"))
    return metrics


def points(condition: bool, amount: int, label: str, evidence: List[str]) -> int:
    if condition:
        evidence.append(label)
        return amount
    return 0


def contains_any(text: str, patterns: Tuple[str, ...]) -> bool:
    return any(re.search(pattern, text, re.IGNORECASE | re.MULTILINE) for pattern in patterns)


def browser_js_source(files: Dict[str, str]) -> str:
    return "\n".join(text for name, text in files.items() if name.lower().endswith(".js"))


def is_elevator_prompt(prompt: str) -> bool:
    return prompt.startswith("elevator_prompt")


def is_office_prompt(prompt: str) -> bool:
    return prompt.startswith("office_prompt")


def required_files_for_prompt(prompt: str) -> List[str]:
    if is_office_prompt(prompt):
        return ["index.html", "person.js", "world.js", "elevator.js", "sim.js"]
    if is_elevator_prompt(prompt):
        return ["index.html", "person.js", "elevator.js"]
    return []


def score_efficiency(metrics: Dict[str, float], evidence: List[str]) -> int:
    total = metrics.get("total_tokens", 0) or 0
    turns = metrics.get("num_turns", 0) or 0
    score = 0
    if total <= 0:
        return 2
    if total <= 75_000:
        score += 3
        evidence.append("token use under 75k")
    elif total <= 175_000:
        score += 2
        evidence.append("token use under 175k")
    elif total <= 500_000:
        score += 1
        evidence.append("token use under 500k")
    if turns == 0 or turns <= 10:
        score += 2
        if turns:
            evidence.append("turn count under 10")
    elif turns <= 18:
        score += 1
        evidence.append("turn count under 18")
    return min(score, 5)


def score_runtime(work_dir: Path, files: Dict[str, str], runtime: Dict, evidence: List[str], flags: List[str]) -> int:
    index = files.get("index.html", "")
    browser_code = browser_js_source(files)
    preview_exists = first_preview_link(work_dir) is not None

    if not runtime:
        score = 0
        score += points(not contains_any(browser_code, (r"^\s*import\s+", r"^\s*export\s+")), 5, "static browser preflight: no ES module syntax", evidence)
        score += points(bool(index) and contains_any(index, (r"<script[^>]+\.js",)), 4, "static browser preflight: scripts loaded", evidence)
        score += points(preview_exists, 3, "static browser preflight: HTML preview present", evidence)
        flags.append("Runtime not verified")
        return min(score, 12)

    if runtime.get("_parse_error"):
        flags.append("Runtime check parse error")
        return 0

    static_errors = runtime.get("static_errors") or []
    console_errors = runtime.get("console_errors") or []
    page_errors = runtime.get("page_errors") or []
    startup_clean = bool(runtime.get("loaded")) and not static_errors and not console_errors and not page_errors
    canvas_count = int(runtime.get("canvas_count") or 0)
    frame_count = int(runtime.get("animation_frames") or 0)
    scene_objects = int(runtime.get("scene_object_count") or 0)
    dynamic_changes = int(runtime.get("dynamic_changes") or 0)

    score = 0
    score += points(startup_clean, 15, "runtime verified: zero startup errors", evidence)
    score += points(canvas_count > 0, 4, "runtime verified: canvas created", evidence)
    score += points(bool(runtime.get("nonblank_canvas")), 4, "runtime verified: nonblank canvas", evidence)
    score += points(frame_count >= 2, 5, "runtime verified: animation frames advanced", evidence)
    score += points(scene_objects >= 3, 7, "runtime verified: scene objects detected", evidence)
    score += points(dynamic_changes > 0, 5, "runtime verified: simulation changes over time", evidence)

    warnings = runtime.get("warnings") or []
    if warnings:
        flags.extend(str(w) for w in warnings[:2])
    if static_errors:
        flags.append("Static JS reference check failed")
    return min(score, 40)


def score_elevator(work_dir: Path, files: Dict[str, str], evidence: List[str]) -> Tuple[int, Dict[str, int]]:
    index = files.get("index.html", "")
    person = files.get("person.js", "")
    elevator = files.get("elevator.js", "")
    all_code = "\n".join(files.values())
    categories = {"files": 0, "implementation": 0}

    for name in required_files_for_prompt("elevator_prompt"):
        categories["files"] += points(bool(files.get(name)), 4, f"{name} present", evidence)
    categories["files"] += points(
        contains_any(index, (r"three@0\.(?:128|147)\.0/build/three\.min\.js",)) and contains_any(index, (r"OrbitControls\.js",)),
        3,
        "required Three.js scripts present",
        evidence,
    )

    categories["implementation"] += points(contains_any(elevator, (r"FLOOR_COUNT\s*=\s*6", r"FLOOR_COUNT:\s*6")), 3, "six-floor building signal", evidence)
    categories["implementation"] += points(contains_any(elevator, (r"depthWrite\s*:\s*false",)) and "DoubleSide" in elevator, 3, "transparent material settings", evidence)
    categories["implementation"] += points("sortObjects" in elevator and contains_any(elevator, (r"alpha\s*:\s*true",)), 3, "renderer transparency setup", evidence)
    categories["implementation"] += points(contains_any(elevator, (r"door",)) and contains_any(elevator, (r"open",)) and contains_any(elevator, (r"close",)), 4, "door open/close signals", evidence)
    categories["implementation"] += points(contains_any(elevator, (r"elevatorCar\.attach\s*\(", r"scene\.attach\s*\(")), 4, "person attach/reparenting signal", evidence)
    categories["implementation"] += points(contains_any(elevator + person, (r"Math\.sin", r"isWalking", r"walkPhase")), 3, "walking animation signal", evidence)
    categories["implementation"] += points(contains_any(elevator, (r"positive\s*Z", r"\+Z", r"Math\.PI", r"rotation\.y")), 3, "orientation/front-of-elevator signal", evidence)
    categories["implementation"] += points(contains_any(elevator + index, (r"speed", r"slider", r"range", r"20x")), 2, "speed control signal", evidence)
    categories["implementation"] += points(contains_any(all_code, (r"requestAnimationFrame",)), 5, "animation loop signal", evidence)
    return sum(categories.values()), categories


def score_office(work_dir: Path, files: Dict[str, str], evidence: List[str]) -> Tuple[int, Dict[str, int]]:
    index = files.get("index.html", "")
    person = files.get("person.js", "")
    world = files.get("world.js", "")
    elevator = files.get("elevator.js", "")
    sim = files.get("sim.js", "")
    all_code = "\n".join(files.values())
    categories = {"files": 0, "implementation": 0}

    for name in required_files_for_prompt("office_prompt"):
        categories["files"] += points(bool(files.get(name)), 2, f"{name} present", evidence)
    categories["files"] += points(
        all(token in index for token in ("person.js", "world.js", "elevator.js", "sim.js")),
        5,
        "office scripts loaded in shell",
        evidence,
    )
    categories["implementation"] += points(contains_any(world, (r"FLOOR_COUNT\s*:\s*6", r"FLOOR_COUNT\s*=\s*6")), 3, "six-floor office signal", evidence)
    categories["implementation"] += points(contains_any(world, (r"office", r"conference", r"lounge", r"desk", r"chair")), 4, "office layout vocabulary", evidence)
    categories["implementation"] += points(contains_any(world + sim, (r"navigation", r"graph", r"waypoint", r"node")), 4, "navigation graph signal", evidence)
    categories["implementation"] += points(contains_any(elevator, (r"SCAN", r"direction", r"queue", r"call", r"capacity")), 5, "elevator scheduler/capacity signals", evidence)
    categories["implementation"] += points(contains_any(sim, (r"clock", r"schedule", r"lunch", r"meeting", r"home", r"arriv")), 5, "daily schedule signals", evidence)
    categories["implementation"] += points(contains_any(sim, (r"state", r"agent", r"worker", r"goal", r"task")), 3, "agent state machine signals", evidence)
    categories["implementation"] += points(contains_any(person + sim, (r"isSitting", r"walkPhase", r"Math\.sin")), 3, "walk/sit animation signal", evidence)
    categories["implementation"] += points(contains_any(world + elevator, (r"call panel", r"indicator", r"button", r"lamp")), 2, "call panel/indicator signal", evidence)
    categories["implementation"] += points(contains_any(sim + world, (r"light", r"sun", r"day", r"night")), 1, "day lighting signal", evidence)
    return sum(categories.values()), categories


def score_generic(files: Dict[str, str], evidence: List[str]) -> Tuple[int, Dict[str, int]]:
    categories = {"files": 0, "implementation": 0}
    categories["files"] += min(len(files) * 3, 15)
    if files:
        evidence.append("generated artifact files present")
    categories["implementation"] += points(any(name.endswith((".py", ".js", ".html")) for name in files), 15, "code artifact present", evidence)
    return sum(categories.values()), categories


def deterministic_score(ev: Dict) -> Dict:
    work_dir: Path = ev["Path"]
    metrics = ev.get("Metrics", {})
    prompt = ev.get("Prompt", "")
    evidence: List[str] = []
    flags = []
    files = {
        p.name: read_text(p, limit=500_000)
        for p in work_dir.iterdir()
        if p.is_file() and p.suffix.lower() in {".html", ".js", ".py", ".md", ".txt"}
    }
    all_code = "\n".join(files.values())
    runtime = ev.get("Runtime") or {}

    completion = 0
    completion += points(ev["HasReport"], 3, "summary report present", evidence)
    completion += points(bool(files), 2, "artifact files present", evidence)
    completion += points(bool(ev.get("Result")), 2, "machine-readable result metrics present", evidence)
    completion += points(metrics.get("success") is True, 2, "agent result marked successful", evidence)
    completion += points(not metrics.get("error"), 1, "no result error flag", evidence)

    if is_office_prompt(prompt):
        quality, detail_categories = score_office(work_dir, files, evidence)
    elif is_elevator_prompt(prompt):
        quality, detail_categories = score_elevator(work_dir, files, evidence)
    else:
        quality, detail_categories = score_generic(files, evidence)

    runtime_score = score_runtime(work_dir, files, runtime, evidence, flags)
    categories = {"completion": completion, **detail_categories, "runtime": runtime_score, "efficiency": score_efficiency(metrics, evidence)}
    raw_total = min(sum(categories.values()), 100)

    caps = []
    if missing := [name for name in required_files_for_prompt(prompt) if not (work_dir / name).exists()]:
        flags.append(f"Missing: {', '.join(missing)}")
        caps.append((50, "required files missing"))
    if not first_preview_link(work_dir):
        flags.append("No runnable HTML preview")
        caps.append((35, "no runnable HTML preview"))
    if contains_any(browser_js_source(files), (r"^\s*import\s+", r"^\s*export\s+")):
        flags.append("ES module syntax in browser artifact")
        caps.append((45, "classic-script module syntax failure"))
    if not runtime:
        caps.append((85, "runtime not verified"))
    elif runtime.get("_parse_error"):
        caps.append((55, "runtime check parse error"))
    else:
        static_errors = runtime.get("static_errors") or []
        console_errors = runtime.get("console_errors") or []
        page_errors = runtime.get("page_errors") or []
        if static_errors:
            flags.append("Static JS reference check failed")
            caps.append((55, "static JS reference check failed"))
        if console_errors or page_errors or not runtime.get("loaded"):
            flags.append("Runtime startup failed")
            caps.append((45, "runtime startup failed"))
        elif int(runtime.get("canvas_count") or 0) <= 0:
            flags.append("No runtime canvas")
            caps.append((35, "no canvas at runtime"))
        elif not runtime.get("nonblank_canvas"):
            flags.append("Blank runtime canvas")
            caps.append((55, "blank runtime canvas"))
        elif int(runtime.get("animation_frames") or 0) < 2:
            flags.append("Animation loop not verified")
            caps.append((55, "animation loop not verified"))
        elif int(runtime.get("dynamic_changes") or 0) <= 0:
            flags.append("No runtime motion detected")
            caps.append((70, "no runtime motion detected"))

    total = raw_total
    if caps:
        cap_value, cap_reason = min(caps, key=lambda item: item[0])
        if raw_total > cap_value:
            flags.append(f"Capped at {cap_value}: {cap_reason}")
        total = min(raw_total, cap_value)

    if total >= 85:
        grade = "Excellent"
    elif total >= 70:
        grade = "Strong"
    elif total >= 55:
        grade = "Partial"
    elif total >= 35:
        grade = "Weak"
    else:
        grade = "Incomplete"

    if metrics.get("error"):
        flags.append("Result flagged error")
    if not ev["HasReport"]:
        flags.append("No summary report")
    flags = list(dict.fromkeys(flags))

    return {
        "total": total,
        "raw_total": raw_total,
        "grade": grade,
        "categories": categories,
        "evidence": evidence[:10],
        "flags": flags,
        "runtime_errors": runtime_error_summary(runtime),
    }


def fmt_int(value) -> str:
    try:
        return f"{int(value):,}"
    except (TypeError, ValueError):
        return "0"


def fmt_cost(value) -> str:
    try:
        amount = float(value)
    except (TypeError, ValueError):
        amount = 0.0
    return f"${amount:.2f}" if amount else "-"


def fmt_duration(ms) -> str:
    try:
        seconds = float(ms) / 1000
    except (TypeError, ValueError):
        seconds = 0
    if seconds <= 0:
        return "-"
    if seconds < 60:
        return f"{seconds:.0f}s"
    minutes = seconds / 60
    if minutes < 60:
        return f"{minutes:.1f}m"
    return f"{minutes / 60:.1f}h"


def provider_class(provider: str) -> str:
    if provider == "unknown":
        return "provider-unknown"
    if "Local" in provider or "lmstudio" in provider.lower():
        return "provider-local"
    return "provider-cloud"


def prompt_label(prompt: str) -> str:
    return prompt.replace("_", " ").title() if prompt else "Unknown Prompt"


def first_preview_link(work_dir: Path) -> Optional[str]:
    for name in ("index.html", "elevator_sim.html", "elevator_simulation.html", "test.html"):
        if (work_dir / name).exists():
            return f"evals/{work_dir.name}/{name}"
    return None


def score_bar(score: int) -> str:
    return f'<div class="score-bar" aria-label="Score {score} of 100"><span style="width: {max(2, min(score, 100))}%"></span></div>'


def short_runtime_error(message: str, limit: int = 140) -> str:
    text = re.sub(r"\s+", " ", str(message)).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def runtime_error_summary(runtime: Dict, limit: int = 5) -> List[str]:
    seen = set()
    errors = []
    for err in (runtime.get("static_errors") or []) + (runtime.get("page_errors") or []) + (runtime.get("console_errors") or []):
        text = short_runtime_error(err)
        key = text.lower()
        if not text or key in seen:
            continue
        seen.add(key)
        errors.append(text)
        if len(errors) >= limit:
            break
    return errors


def scoring_methodology_tooltip() -> str:
    text = (
        "Scores prioritize working browser simulations. Runtime verification can contribute up to 40 points for "
        "zero startup errors, a nonblank canvas, animation frames, scene complexity, and visible changes over time. "
        "Prompt-specific implementation signals, required files, completion metadata, and efficiency make up the "
        "remaining points. Hard caps prevent browser-dead, blank, missing-file, or unverified runs from ranking as excellent."
    )
    return (
        '<span class="info-wrap" tabindex="0" aria-label="Scoring methodology">'
        '<span class="info-icon" aria-hidden="true">i</span>'
        f'<span class="info-tooltip" role="tooltip">{esc(text)}</span>'
        '</span>'
    )


def scan_evaluations() -> List[Dict]:
    known_prompts = get_known_prompts()
    evaluations = []
    if not EVALS_DIR.exists():
        return evaluations

    for item in EVALS_DIR.iterdir():
        if not item.is_dir():
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


def render_reference_section() -> str:
    return """
        <section class="reference-section">
            <div class="section-heading">
                <div>
                    <h2>Reference Implementations</h2>
                    <p>Known-good examples for visual comparison.</p>
                </div>
            </div>
            <div class="reference-grid">
                <a class="reference-card" href="reference/elevator/index.html" target="_blank" rel="noopener">
                    <img class="reference-thumb" src="reference/elevator/preview.png" alt="Elevator simulation preview">
                    <div class="reference-body">
                        <span class="reference-title">Elevator Simulation</span>
                        <span class="reference-cta">Launch</span>
                    </div>
                </a>
                <a class="reference-card" href="reference/office/index.html" target="_blank" rel="noopener">
                    <img class="reference-thumb" src="reference/office/preview.png" alt="Office simulation preview">
                    <div class="reference-body">
                        <span class="reference-title">Office Building Simulation</span>
                        <span class="reference-cta">Launch</span>
                    </div>
                </a>
            </div>
        </section>
    """


def render_leader_cards(evaluations: List[Dict]) -> str:
    cards = []
    for rank, ev in enumerate(evaluations[:6], 1):
        score = ev["Score"]["total"]
        flags = ev["Score"]["flags"]
        flag_html = f'<div class="mini-flag">{esc(flags[0])}</div>' if flags else ""
        cards.append(
            f"""
            <article class="leader-card">
                <div class="rank">#{rank}</div>
                <div class="leader-main">
                    <div class="leader-score">{score}</div>
                    <div class="leader-title">{esc(ev["Agent"])}</div>
                    <div class="leader-model">{esc(ev["Model"])}</div>
                    <div class="leader-meta">{esc(prompt_label(ev["Prompt"]))} / {esc(ev["Provider"])}</div>
                    {score_bar(score)}
                    {flag_html}
                </div>
            </article>
            """
        )
    return "\n".join(cards)


def render_comparison_rows(evaluations: List[Dict]) -> str:
    rows = []
    for ev in evaluations:
        score = ev["Score"]["total"]
        metrics = ev["Metrics"]
        cats = ev["Score"]["categories"]
        flags = ev["Score"]["flags"]
        evidence = ev["Score"]["evidence"]
        runtime_errors = ev["Score"].get("runtime_errors", [])
        token_display = fmt_int(metrics.get("total_tokens"))
        if metrics.get("token_counts_estimated") and token_display != "—":
            token_display = f"≈{token_display}"
        cost_display = (
            "N/A"
            if metrics.get("cost_available") is False
            else fmt_cost(metrics.get("cost_usd"))
        )
        report = f'<a class="link-btn" href="{esc(ev["ReportLink"])}">Report</a>' if ev["HasReport"] else '<span class="muted">No report</span>'
        preview = f'<a class="link-btn subtle" href="{esc(ev["PreviewLink"])}" target="_blank" rel="noopener">Preview</a>' if ev["PreviewLink"] else ""
        flag_html = "".join(f'<span class="flag">{esc(flag)}</span>' for flag in flags)
        evidence_html = ", ".join(esc(item) for item in evidence[:3])
        runtime_error_html = ""
        if runtime_errors:
            runtime_error_html = (
                '<div class="runtime-errors"><strong>Runtime errors</strong>'
                + "".join(f"<span>{esc(err)}</span>" for err in runtime_errors)
                + "</div>"
            )
        rows.append(
            f"""
            <tr>
                <td>
                    <div class="score-cell">
                        <strong>{score}</strong>
                        {score_bar(score)}
                        <span>{esc(ev["Score"]["grade"])}</span>
                    </div>
                </td>
                <td>
                    <div class="identity">
                        <span class="agent-dot" style="background:{get_agent_color(ev["Agent"])}"></span>
                        <strong>{esc(ev["Agent"])}</strong>
                        <span>{esc(ev["Model"])}</span>
                    </div>
                </td>
                <td><span class="provider-badge {provider_class(ev["Provider"])}">{esc(ev["Provider"])}</span></td>
                <td class="metric">{token_display}</td>
                <td class="metric">{cost_display}</td>
                <td class="metric">{fmt_duration(metrics.get("duration_ms"))}</td>
                <td class="breakdown-cell">
                    <div class="category-pills">
                        <span>C {cats.get("completion", 0)}</span>
                        <span>F {cats.get("files", 0)}</span>
                        <span>I {cats.get("implementation", 0)}</span>
                        <span>R {cats.get("runtime", 0)}</span>
                        <span>E {cats.get("efficiency", 0)}</span>
                    </div>
                    <div class="evidence">{evidence_html}</div>
                    <div>{flag_html}</div>
                    {runtime_error_html}
                </td>
                <td><div class="actions">{report}{preview}</div></td>
            </tr>
            """
        )
    return "\n".join(rows)


def render_score_tab(tab_id: str, title: str, evaluations: List[Dict], description: str) -> str:
    scored = [ev for ev in evaluations if ev["Score"]["total"] > 0]
    local = [ev for ev in evaluations if "Local" in ev["Provider"] or "lmstudio" in ev["Provider"].lower()]
    cloud = [ev for ev in evaluations if ev not in local and ev["Provider"] != "unknown"]
    avg = round(sum(ev["Score"]["total"] for ev in scored) / len(scored), 1) if scored else 0
    active = " active" if tab_id == "elevator" else ""
    return f"""
        <section id="{tab_id}-tab" class="tab-panel{active}">
            <div class="stats-grid">
                <div class="stat-card"><span>Total Runs</span><strong>{len(evaluations)}</strong></div>
                <div class="stat-card"><span>Average Score</span><strong>{avg}</strong></div>
                <div class="stat-card"><span>Local Runs</span><strong>{len(local)}</strong></div>
                <div class="stat-card"><span>Cloud Runs</span><strong>{len(cloud)}</strong></div>
            </div>
            <section class="leaderboard">
                <div class="section-heading">
                    <div>
                        <h2 class="title-with-info">{esc(title)} {scoring_methodology_tooltip()}</h2>
                        <p>{esc(description)}</p>
                    </div>
                </div>
                <div class="leader-grid">
                    {render_leader_cards(evaluations)}
                </div>
            </section>
            <section class="comparison-table-wrap">
                <div class="section-heading">
                    <div>
                        <h2>Comparison Matrix</h2>
                        <p>C=completion, F=files, I=implementation signals, R=runtime verification, E=efficiency.</p>
                    </div>
                </div>
                <div class="table-scroll">
                    <table class="comparison-table">
                        <colgroup>
                            <col class="score-col">
                            <col class="agent-col">
                            <col class="provider-col">
                            <col class="metric-col">
                            <col class="metric-col">
                            <col class="metric-col">
                            <col class="breakdown-col">
                            <col class="links-col">
                        </colgroup>
                        <thead>
                            <tr>
                                <th>Score</th>
                                <th>Agent / Model</th>
                                <th>Provider</th>
                                <th>Tokens</th>
                                <th>Cost</th>
                                <th>Time</th>
                                <th>Breakdown</th>
                                <th>Links</th>
                            </tr>
                        </thead>
                        <tbody>{render_comparison_rows(evaluations)}</tbody>
                    </table>
                </div>
            </section>
        </section>
    """


def render_agent_cards(evaluations: List[Dict]) -> str:
    agents_order = []
    agents_map: Dict[str, List[Dict]] = {}
    for ev in sorted(evaluations, key=lambda x: (x["Agent"].lower(), x["Model"].lower(), x["Prompt"].lower())):
        agent = ev["Agent"]
        if agent not in agents_map:
            agents_map[agent] = []
            agents_order.append(agent)
        agents_map[agent].append(ev)

    sections = []
    for agent_name in agents_order:
        evs = agents_map[agent_name]
        color = get_agent_color(agent_name)
        cards = []
        for ev in evs:
            provider = ev["Provider"]
            btn_class = "view-btn" if ev["HasReport"] else "view-btn disabled"
            btn_text = "View Report" if ev["HasReport"] else "No Report"
            score = ev["Score"]["total"]
            cards.append(
                f"""
                <div class="eval-card">
                    <div class="card-header">
                        <span class="provider-badge {provider_class(provider)}">{esc(provider if provider != "unknown" else "Unknown")}</span>
                        <span class="score-badge">{score}</span>
                    </div>
                    <div class="card-body">
                        <div class="model-name">{esc(ev["Model"])}</div>
                        <div class="prompt-row"><span class="prompt-chip">{esc(prompt_label(ev["Prompt"]))}</span></div>
                        {score_bar(score)}
                    </div>
                    <div class="card-footer">
                        <a href="{esc(ev["ReportLink"])}" class="{btn_class}">{btn_text}</a>
                    </div>
                </div>
                """
            )
        sections.append(
            f"""
            <section class="agent-section">
                <div class="agent-section-header">
                    <span class="agent-section-badge" style="background: {color};">{esc(agent_name)}</span>
                    <span class="agent-section-count">{len(evs)} evaluation{"s" if len(evs) != 1 else ""}</span>
                </div>
                <div class="eval-grid">{"".join(cards)}</div>
            </section>
            """
        )
    return "\n".join(sections)


def render_agent_tab(evaluations: List[Dict]) -> str:
    return f"""
        <section id="agents-tab" class="tab-panel">
            {render_agent_cards(evaluations)}
        </section>
    """


def render_styles() -> str:
    return """
        :root {
            color-scheme: light;
            --bg: #f8fafc;
            --panel: #ffffff;
            --text: #111827;
            --muted: #64748b;
            --line: #e2e8f0;
            --accent: #2563eb;
            --accent-strong: #1d4ed8;
            --red: #b91c1c;
        }
        * { box-sizing: border-box; }
        body {
            font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            background: var(--bg);
            color: var(--text);
        }
        .container { max-width: 1360px; margin: 0 auto; padding: 24px; }
        header { padding: 24px 0 18px; }
        h1 { margin: 0 0 8px; font-size: 34px; line-height: 1.1; letter-spacing: 0; }
        .intro { color: var(--muted); margin: 0; max-width: 760px; line-height: 1.5; }
        .tab-nav {
            display: inline-flex;
            gap: 4px;
            padding: 4px;
            background: #e2e8f0;
            border-radius: 8px;
            border: 1px solid #cbd5e1;
            margin: 8px 0 22px;
            flex-wrap: wrap;
        }
        .tab-btn {
            border: 0;
            background: transparent;
            color: #334155;
            padding: 10px 14px;
            border-radius: 6px;
            font-weight: 800;
            cursor: pointer;
            white-space: nowrap;
        }
        .tab-btn.active { background: white; color: var(--accent-strong); box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12); }
        .tab-panel { display: none; }
        .tab-panel.active { display: block; }
        .section-heading { display: flex; justify-content: space-between; align-items: end; gap: 16px; margin: 22px 0 14px; }
        .section-heading h2 { margin: 0 0 5px; font-size: 21px; }
        .section-heading p { margin: 0; color: var(--muted); line-height: 1.45; }
        .title-with-info { display: inline-flex; align-items: center; gap: 7px; position: relative; }
        .info-wrap { position: relative; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; outline: none; }
        .info-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 18px;
            height: 18px;
            border: 1px solid #93c5fd;
            border-radius: 50%;
            color: var(--accent-strong);
            background: #eff6ff;
            font-size: 12px;
            font-weight: 900;
            line-height: 1;
            cursor: help;
        }
        .info-tooltip {
            position: absolute;
            left: 50%;
            bottom: calc(100% + 10px);
            transform: translateX(-50%) translateY(4px);
            width: min(360px, calc(100vw - 48px));
            padding: 10px 12px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            background: #0f172a;
            color: white;
            box-shadow: 0 12px 28px rgba(15, 23, 42, 0.22);
            font-size: 12px;
            font-weight: 600;
            line-height: 1.45;
            text-transform: none;
            opacity: 0;
            pointer-events: none;
            visibility: hidden;
            z-index: 20;
            transition: opacity .15s ease, transform .15s ease, visibility .15s ease;
        }
        .info-tooltip::after {
            content: "";
            position: absolute;
            left: 50%;
            top: 100%;
            transform: translateX(-50%);
            border: 7px solid transparent;
            border-top-color: #0f172a;
        }
        .info-wrap:hover .info-tooltip,
        .info-wrap:focus .info-tooltip,
        .info-wrap:focus-visible .info-tooltip {
            opacity: 1;
            visibility: visible;
            transform: translateX(-50%) translateY(0);
        }
        .reference-section { margin: 18px 0 18px; }
        .reference-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
        .reference-card, .eval-card, .leader-card, .stat-card, .table-scroll {
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 8px;
            box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
        }
        .reference-card { overflow: hidden; text-decoration: none; color: inherit; }
        .reference-thumb { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; background: #111827; }
        .reference-body { padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .reference-title { font-weight: 800; }
        .reference-cta { color: var(--accent-strong); font-weight: 800; font-size: 13px; }
        .stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin: 14px 0 28px; }
        .stat-card { padding: 18px; }
        .stat-card span { display: block; color: var(--muted); font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
        .stat-card strong { display: block; margin-top: 8px; font-size: 30px; }
        .leader-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
        .leader-card { display: flex; gap: 14px; padding: 16px; min-width: 0; }
        .rank { font-size: 13px; color: var(--muted); font-weight: 800; }
        .leader-main { min-width: 0; flex: 1; }
        .leader-score { font-size: 32px; font-weight: 900; line-height: 1; color: var(--accent-strong); }
        .leader-title { margin-top: 8px; font-weight: 900; }
        .leader-model { color: #334155; font-size: 14px; word-break: break-word; }
        .leader-meta { color: var(--muted); font-size: 12px; margin-top: 6px; }
        .score-bar { height: 7px; background: #e2e8f0; border-radius: 999px; overflow: hidden; margin-top: 9px; }
        .score-bar span { display: block; height: 100%; background: linear-gradient(90deg, #2563eb, #059669); border-radius: inherit; }
        .mini-flag { margin-top: 8px; color: #b45309; font-size: 12px; font-weight: 800; }
        .comparison-table-wrap, .agent-section { margin-top: 26px; }
        .table-scroll { overflow-x: auto; }
        table { border-collapse: collapse; width: 100%; min-width: 1160px; table-layout: fixed; }
        .score-col { width: 82px; }
        .agent-col { width: 200px; }
        .provider-col { width: 108px; }
        .metric-col { width: 76px; }
        .breakdown-col { width: auto; }
        .links-col { width: 104px; }
        th, td { padding: 13px 14px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
        th { color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; background: #f1f5f9; }
        tr:last-child td { border-bottom: 0; }
        .score-cell strong { display: block; font-size: 24px; color: var(--accent-strong); }
        .score-cell span { color: var(--muted); font-size: 12px; font-weight: 800; }
        .identity { display: grid; grid-template-columns: auto 1fr; column-gap: 8px; row-gap: 2px; min-width: 0; }
        .identity strong { grid-column: 2; }
        .identity span:last-child { grid-column: 2; color: #475569; font-size: 13px; word-break: break-word; }
        .agent-dot { width: 10px; height: 10px; border-radius: 999px; margin-top: 5px; }
        .provider-badge, .prompt-chip { display: inline-flex; align-items: center; border-radius: 6px; padding: 4px 8px; font-size: 12px; font-weight: 800; white-space: nowrap; }
        .provider-cloud { background: #dbeafe; color: #1d4ed8; }
        .provider-local { background: #dcfce7; color: #166534; }
        .provider-unknown { background: #f1f5f9; color: #64748b; }
        .prompt-chip { background: #f8fafc; border: 1px solid #e2e8f0; color: #334155; }
        .metric { font-variant-numeric: tabular-nums; white-space: nowrap; }
        .category-pills { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 7px; }
        .category-pills span { background: #eef2ff; color: #3730a3; border-radius: 5px; padding: 2px 6px; font-size: 11px; font-weight: 800; }
        .breakdown-cell { min-width: 390px; }
        .evidence { color: var(--muted); font-size: 12px; line-height: 1.4; }
        .flag { display: inline-block; margin: 7px 5px 0 0; color: var(--red); background: #fee2e2; border-radius: 5px; padding: 2px 6px; font-size: 11px; font-weight: 800; }
        .runtime-errors { margin-top: 8px; display: grid; gap: 4px; color: #7f1d1d; font-size: 12px; line-height: 1.35; }
        .runtime-errors strong { color: #991b1b; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
        .runtime-errors span { display: block; padding: 5px 7px; border: 1px solid #fecaca; border-radius: 6px; background: #fff1f2; overflow-wrap: anywhere; }
        .actions { display: flex; gap: 6px; flex-wrap: wrap; }
        .link-btn, .view-btn { display: inline-flex; justify-content: center; align-items: center; min-height: 34px; padding: 8px 10px; border-radius: 6px; color: white; background: var(--accent); text-decoration: none; font-size: 13px; font-weight: 800; }
        .link-btn.subtle { color: #1e293b; background: #e2e8f0; }
        .muted { color: var(--muted); font-size: 13px; }
        .agent-section-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
        .agent-section-badge { padding: 6px 12px; border-radius: 999px; font-size: 14px; font-weight: 800; color: white; }
        .agent-section-count { color: var(--muted); font-size: 13px; font-weight: 800; }
        .eval-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 16px; }
        .eval-card { overflow: hidden; display: flex; flex-direction: column; }
        .card-header { padding: 13px 14px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); }
        .score-badge { color: var(--accent-strong); font-size: 20px; font-weight: 900; }
        .card-body { padding: 16px; flex: 1; }
        .model-name { font-weight: 850; word-break: break-word; line-height: 1.3; }
        .prompt-row { margin-top: 10px; }
        .card-footer { padding: 14px; border-top: 1px solid var(--line); }
        .view-btn { width: 100%; }
        .view-btn.disabled { background: #cbd5e1; pointer-events: none; }
        @media (max-width: 860px) {
            .container { padding: 16px; }
            .tab-nav { width: 100%; }
            .tab-btn { flex: 1; }
            .stats-grid, .leader-grid, .reference-grid { grid-template-columns: 1fr; }
            h1 { font-size: 28px; }
        }
    """


def render_script() -> str:
    return """
        function showTab(tabName) {
            document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.getElementById(tabName + '-tab').classList.add('active');
            document.querySelector('[data-tab="' + tabName + '"]').classList.add('active');
        }
    """


def generate_index_html() -> None:
    evaluations = scan_evaluations()
    shortened = shorten_oversized_artifacts()
    elevator_evals = [ev for ev in evaluations if is_elevator_prompt(ev.get("Prompt", ""))]
    office_evals = [ev for ev in evaluations if is_office_prompt(ev.get("Prompt", ""))]

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LLM Agent Evaluations</title>
    <style>{render_styles()}</style>
    <script>{render_script()}</script>
</head>
<body>
    <div class="container">
        <header>
            <h1>LLM Agent Evaluation Dashboard</h1>
            <p class="intro">Compare agent/model runs with deterministic scoring, token metrics, provider context, and links back to the full generated reports.</p>
            {render_reference_section()}
            <nav class="tab-nav" aria-label="Dashboard views">
                <button class="tab-btn active" type="button" data-tab="elevator" onclick="showTab('elevator')">Elevator Prompt Scores</button>
                <button class="tab-btn" type="button" data-tab="office" onclick="showTab('office')">Office Prompt Scores</button>
                <button class="tab-btn" type="button" data-tab="agents" onclick="showTab('agents')">By Agent</button>
            </nav>
        </header>
        {render_score_tab("elevator", "Elevator Prompt Scores", elevator_evals, "Local-model focused elevator simulations, scored primarily by runtime viability, then file completeness, Three.js behavior cues, and efficiency.")}
        {render_score_tab("office", "Office Prompt Scores", office_evals, "Frontier/cloud office simulations, scored primarily by runtime viability, then office-world behavior, elevator scheduling cues, and efficiency.")}
        {render_agent_tab(evaluations)}
    </div>
</body>
</html>
"""

    INDEX_FILE.write_text(html_content, encoding="utf-8")
    for path, old_size, new_size, removed_lines in shortened:
        print(
            f"[+] Shortened oversized artifact: {path} "
            f"({old_size:,} -> {new_size:,} bytes; removed {removed_lines:,} middle lines)"
        )
    print(f"[+] Index generated at: {INDEX_FILE.absolute()}")
    print(f"    Elevator prompt runs: {len(elevator_evals)}")
    print(f"    Office prompt runs: {len(office_evals)}")


if __name__ == "__main__":
    generate_index_html()

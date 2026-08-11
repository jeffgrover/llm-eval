"""Pure scoring functions for evaluation runs.

These functions are independent of the dashboard rendering and filesystem
scanning. They operate on data dicts (``ev``) produced by the scanner and
return deterministic scores suitable for ranking and comparison.

Extracted from ``generate_index.py`` to make scoring algorithms
independently testable with synthetic ``EvalEntry`` fixtures.
"""

import html as _html
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple


def esc(value) -> str:
    """HTML-escape a value (used by tooltip rendering)."""
    return _html.escape(str(value), quote=True)


def read_text(path: Path, limit: Optional[int] = None) -> str:
    """Read a text file, optionally truncating to *limit* characters."""
    if not path.exists() or not path.is_file():
        return ""
    text = path.read_text(encoding="utf-8", errors="ignore")
    return text[:limit] if limit and len(text) > limit else text


# --- Helpers ---


def points(condition: bool, amount: int, label: str, evidence: List[str]) -> int:
    """Add *amount* to the score and record *label* in *evidence* if true."""
    if condition:
        evidence.append(label)
        return amount
    return 0


def contains_any(text: str, patterns: Tuple[str, ...]) -> bool:
    """Return True if *text* matches any of the regex *patterns*."""
    return any(re.search(pattern, text, re.IGNORECASE | re.MULTILINE) for pattern in patterns)


def browser_js_source(files: Dict[str, str]) -> str:
    """Concatenate all ``.js`` file contents from *files*."""
    return "\n".join(text for name, text in files.items() if name.lower().endswith(".js"))


# --- Prompt classification ---


def is_elevator_prompt(prompt: str) -> bool:
    return prompt.startswith("elevator_prompt")


def is_office_prompt(prompt: str) -> bool:
    return prompt.startswith("office_prompt")


def required_files_for_prompt(prompt: str) -> List[str]:
    """Return the expected artifact filenames for a given prompt type."""
    if is_office_prompt(prompt):
        return ["index.html", "person.js", "world.js", "elevator.js", "sim.js"]
    if is_elevator_prompt(prompt):
        return ["index.html", "person.js", "elevator.js"]
    return []


# --- Preview link ---


def first_preview_link(work_dir: Path) -> Optional[str]:
    """Return a relative URL to the first runnable HTML preview, if any."""
    for name in ("index.html", "elevator_sim.html", "elevator_simulation.html", "test.html"):
        if (work_dir / name).exists():
            return f"evals/{work_dir.name}/{name}"
    return None


# --- Runtime error helpers ---


def short_runtime_error(message: str, limit: int = 140) -> str:
    """Collapse whitespace and truncate a runtime error message."""
    text = re.sub(r"\s+", " ", str(message)).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def runtime_error_summary(runtime: Dict, limit: int = 5) -> List[str]:
    """Deduplicate and truncate runtime errors for display."""
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


# --- Score dimensions ---


def score_efficiency(metrics: Dict[str, float], evidence: List[str]) -> int:
    """Score token and turn efficiency (max 5 points)."""
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
    """Score runtime verification (max 40 points)."""
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
    """Score elevator-prompt implementation quality."""
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
    """Score office-prompt implementation quality."""
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
    """Score a generic (non-prompt-specific) run."""
    categories = {"files": 0, "implementation": 0}
    categories["files"] += min(len(files) * 3, 15)
    if files:
        evidence.append("generated artifact files present")
    categories["implementation"] += points(any(name.endswith((".py", ".js", ".html")) for name in files), 15, "code artifact present", evidence)
    return sum(categories.values()), categories


# --- Top-level scoring ---


def deterministic_score(ev: Dict) -> Dict:
    """Compute the full deterministic score for an evaluation entry.

    *ev* is a dict with keys ``Path``, ``HasReport``, ``Result``,
    ``Metrics``, ``Runtime``, and ``Prompt``.
    """
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


def scoring_methodology_tooltip() -> str:
    """Return HTML for the scoring methodology tooltip."""
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

#!/usr/bin/env python3
"""Dashboard generator – thin orchestrator.

Scans evaluation directories, scores runs, and renders the HTML
dashboard.  Scoring algorithms live in :mod:`eval_scoring`; filesystem
discovery and data loading live in :mod:`eval_scanner`.
"""

import html
import json
import re
from collections import deque
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from evaluation_metrics import (
    RESULT_FILES,
    RunMetrics,
    _parse_result_data,
    load_run_metrics,
)
from eval_scanner import (
    AGENT_COLORS,
    AGENT_DISPLAY_NAMES,
    EVALS_DIR,
    NON_RESULT_FILES,
    RUNTIME_CHECK_FILE,
    detect_provider,
    get_agent_color,
    get_display_name,
    get_known_prompts,
    parse_directory_name,
    parse_metrics,
    parse_result_json,
    parse_runtime_check,
    scan_evaluations,
)
from eval_scoring import (
    browser_js_source,
    contains_any,
    deterministic_score,
    first_preview_link,
    is_elevator_prompt,
    is_office_prompt,
    points,
    read_text,
    required_files_for_prompt,
    runtime_error_summary,
    score_efficiency,
    score_elevator,
    score_generic,
    score_office,
    score_runtime,
    scoring_methodology_tooltip,
    short_runtime_error,
)

INDEX_FILE = Path("index.html")
MAX_ARTIFACT_BYTES = 50 * 1000 * 1000
TARGET_ARTIFACT_BYTES = 45 * 1000 * 1000
TRUNCATE_HEAD_LINES = 100
TRUNCATE_TAIL_LINES = 100
TRUNCATION_MARKER_PREFIX = "LLM-EVAL-TRUNCATED"
WIGGUM_ATTEMPT_PREFIX = "PI_WIGGUM_ATTEMPT_"
WIGGUM_RETAIN_HEAD_LINES = 5
WIGGUM_RETAIN_TAIL_LINES = 5
WIGGUM_TARGET_BYTES = 1 * 1000 * 1000
TRUNCATION_COUNTS_PATTERN = re.compile(
    rb"removed ([\d,]+) lines \(([\d,]+) bytes\)"
)


def esc(value) -> str:
    return html.escape(str(value), quote=True)


def truncation_marker(path: Path, removed_lines: int, removed_bytes: int, note: str = "") -> bytes:
    message = (
        f"{TRUNCATION_MARKER_PREFIX}: removed {removed_lines:,} lines "
        f"({removed_bytes:,} bytes) from the middle of this generated file."
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


def fit_truncated_content(
    path: Path,
    content: bytes,
    removed_lines: int,
    original_size: int,
    target_bytes: int = TARGET_ARTIFACT_BYTES,
) -> bytes:
    if len(content) <= target_bytes:
        return content

    marker_token = TRUNCATION_MARKER_PREFIX.encode("utf-8")
    content = b"".join(line for line in content.splitlines(keepends=True) if marker_token not in line)
    placeholder = truncation_marker(path, removed_lines, 0, "Retained edge content was byte-capped because one or more lines were extremely large.")
    side_budget = max((target_bytes - len(placeholder)) // 2, 0)
    content = content[:side_budget] + placeholder + content[-side_budget:]
    removed_bytes = original_size - len(content)
    marker = truncation_marker(path, removed_lines, removed_bytes, "Retained edge content was byte-capped because one or more lines were extremely large.")
    side_budget = max((target_bytes - len(marker)) // 2, 0)
    return content[:side_budget] + marker + content[-side_budget:]


def shorten_oversized_file(
    path: Path,
    *,
    max_artifact_bytes: int = MAX_ARTIFACT_BYTES,
    target_artifact_bytes: int = TARGET_ARTIFACT_BYTES,
    head_lines: int = TRUNCATE_HEAD_LINES,
    tail_lines: int = TRUNCATE_TAIL_LINES,
    recompact_truncated: bool = False,
) -> Optional[Tuple[int, int, int]]:
    original_size = path.stat().st_size
    if original_size <= max_artifact_bytes:
        return None

    head: List[bytes] = []
    tail = deque(maxlen=tail_lines)
    total_lines = 0
    existing_marker: Optional[bytes] = None
    marker_token = TRUNCATION_MARKER_PREFIX.encode("utf-8")

    with path.open("rb") as f:
        for line in f:
            if marker_token in line:
                existing_marker = line
                continue
            total_lines += 1
            if len(head) < head_lines:
                head.append(line)
            tail.append(line)

    if existing_marker and not recompact_truncated:
        return None

    retained_line_count = head_lines + tail_lines
    if total_lines <= retained_line_count:
        if existing_marker:
            return None
        content = path.read_bytes()
        capped = fit_truncated_content(
            path,
            content,
            0,
            original_size,
            target_artifact_bytes,
        )
        if len(capped) >= len(content):
            return None
        tmp_path = path.with_name(f"{path.name}.tmp-truncated")
        tmp_path.write_bytes(capped)
        tmp_path.replace(path)
        return original_size, path.stat().st_size, 0

    tail_content = list(tail)
    removed_lines = total_lines - len(head) - len(tail_content)
    previous_removed_lines = 0
    previous_removed_bytes = 0
    if existing_marker:
        match = TRUNCATION_COUNTS_PATTERN.search(existing_marker)
        if match:
            previous_removed_lines = int(match.group(1).replace(b",", b""))
            previous_removed_bytes = int(match.group(2).replace(b",", b""))
        removed_lines += previous_removed_lines

    marker = truncation_marker(path, removed_lines, 0)
    new_content = b"".join(head) + marker + b"".join(tail_content)
    removed_bytes = previous_removed_bytes + original_size - len(new_content)
    marker = truncation_marker(path, removed_lines, removed_bytes)
    new_content = b"".join(head) + marker + b"".join(tail_content)
    new_content = fit_truncated_content(
        path,
        new_content,
        removed_lines,
        original_size,
        target_artifact_bytes,
    )

    tmp_path = path.with_name(f"{path.name}.tmp-truncated")
    tmp_path.write_bytes(new_content)
    tmp_path.replace(path)
    return original_size, path.stat().st_size, removed_lines


def is_wiggum_attempt_log(path: Path) -> bool:
    return (
        path.name.startswith(WIGGUM_ATTEMPT_PREFIX)
        and path.suffix.lower() == ".jsonl"
    )


def shorten_oversized_artifacts() -> List[Tuple[Path, int, int, int]]:
    if not EVALS_DIR.exists():
        return []

    shortened = []
    for path in EVALS_DIR.rglob("*"):
        if not path.is_file():
            continue
        if is_wiggum_attempt_log(path):
            result = shorten_oversized_file(
                path,
                max_artifact_bytes=0,
                target_artifact_bytes=WIGGUM_TARGET_BYTES,
                head_lines=WIGGUM_RETAIN_HEAD_LINES,
                tail_lines=WIGGUM_RETAIN_TAIL_LINES,
                recompact_truncated=True,
            )
        else:
            result = shorten_oversized_file(path)
        if result:
            old_size, new_size, removed_lines = result
            shortened.append((path, old_size, new_size, removed_lines))
    return shortened


# ---------------------------------------------------------------------------
# Rendering helpers
# ---------------------------------------------------------------------------


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


def score_bar(score: int) -> str:
    return f'<div class="score-bar" aria-label="Score {score} of 100"><span style="width: {max(2, min(score, 100))}%"></span></div>'


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
        .table-scroll { overflow-x: auto; width: 100%; }
        table { border-collapse: collapse; width: 100%; table-layout: fixed; }
        .score-col { width: 72px; }
        .agent-col { width: 180px; }
        .provider-col { width: 160px; }
        .metric-col { width: 110px; }
        .breakdown-col { width: auto; }
        .links-col { width: 92px; }
        th, td { padding: 12px 12px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; overflow: hidden; }
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
        .metric { font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .provider-badge { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
        .category-pills { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 7px; }
        .category-pills span { background: #eef2ff; color: #3730a3; border-radius: 5px; padding: 2px 6px; font-size: 11px; font-weight: 800; }
        .breakdown-cell { min-width: 300px; }
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

    html_content = "\n".join(
        line.rstrip()
        for line in html_content.splitlines()
    ) + "\n"
    INDEX_FILE.write_text(html_content, encoding="utf-8")
    for path, old_size, new_size, removed_lines in shortened:
        print(
            f"[+] Shortened artifact: {path} "
            f"({old_size:,} -> {new_size:,} bytes; removed {removed_lines:,} middle lines)"
        )
    print(f"[+] Index generated at: {INDEX_FILE.absolute()}")
    print(f"    Elevator prompt runs: {len(elevator_evals)}")
    print(f"    Office prompt runs: {len(office_evals)}")


if __name__ == "__main__":
    generate_index_html()

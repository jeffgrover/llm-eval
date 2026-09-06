"""Self-contained HTML report rendering for evaluation runs."""

import base64
import html
import re
from pathlib import Path
from typing import Dict


MAX_EMBEDDED_ARTIFACT_BYTES = 2 * 1024 * 1024

AGENT_DISPLAY_NAMES = {
    "mistral": "Mistral Vibe",
    "gemini": "Antigravity CLI",
    "agy": "Antigravity CLI",
    "antigravity": "Antigravity CLI",
    "claude": "Claude Code",
    "codex": "Codex CLI",
    "crush": "Charmbracelet Crush",
    "opencode": "OpenCode CLI",
    "pi": "Pi Coding Agent",
    "pi-wiggum": "Pi Wiggum",
    "qoder": "Qoder CLI",
    "dsh": "DeepSeek Harness",
}


def format_duration_human(seconds: float) -> str:
    """Format seconds as a compact, human-readable duration."""
    if seconds < 0:
        return "0.00 sec"
    if seconds < 60:
        return f"{seconds:.2f} sec"

    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    remaining_seconds = seconds % 60

    parts = []
    if hours > 0:
        parts.append(f"{hours}h")
    if minutes > 0:
        parts.append(f"{minutes}m")
    if remaining_seconds > 0 or not parts:
        parts.append(f"{remaining_seconds:.1f}s")
    return " ".join(parts)


def _info_rows(values: Dict) -> str:
    rows = ""
    for key, value in values.items():
        if key == "Full Name":
            continue
        rows += (
            '<div class="info-row">'
            f'<span class="label">{key}:</span> '
            f'<span class="value">{value}</span>'
            "</div>"
        )
    return rows


def _artifact_size_label(path: Path) -> str:
    try:
        size = path.stat().st_size
    except OSError:
        return ""
    if size >= 1024 * 1024:
        return f"{size / (1024 * 1024):.1f} MB"
    if size >= 1024:
        return f"{size / 1024:.1f} KB"
    return f"{size} B"


def _embedded_html_preview(artifact_path: Path) -> str:
    """Inline local JavaScript so file:// report previews remain functional."""
    html_text = artifact_path.read_text(encoding="utf-8", errors="replace")

    def inline_script(match):
        attrs = f"{match.group(1)}{match.group(4)}"
        src = match.group(3)
        src_lower = src.lower()
        if (
            "://" in src
            or src_lower.startswith(("data:", "about:", "javascript:"))
            or src.startswith(("/", "\\"))
        ):
            return match.group(0)

        local_path = (artifact_path.parent / src).resolve()
        try:
            local_path.relative_to(artifact_path.parent.resolve())
        except ValueError:
            return match.group(0)
        if not local_path.exists() or local_path.suffix.lower() != ".js":
            return match.group(0)

        script_text = local_path.read_text(encoding="utf-8", errors="replace")
        safe_script = script_text.replace("</script", "<\\/script")
        return f"<script{attrs}>\n{safe_script}\n</script>"

    return re.sub(
        r"<script\b([^>]*)\bsrc\s*=\s*([\"'])([^\"']+)\2([^>]*)>\s*</script>",
        inline_script,
        html_text,
        flags=re.IGNORECASE | re.DOTALL,
    )


def _artifact_navigation(work_dir: Path) -> str:
    items = []
    artifacts = sorted(
        path
        for path in work_dir.iterdir()
        if path.is_file() and path.name != "summary.html"
    )
    for artifact_path in artifacts:
        name = artifact_path.name
        try:
            artifact_size = artifact_path.stat().st_size
        except OSError:
            artifact_size = 0

        is_html = name.lower().endswith((".html", ".htm"))
        is_image = name.lower().endswith(
            (".png", ".jpg", ".jpeg", ".gif", ".svg")
        )
        if artifact_size > MAX_EMBEDDED_ARTIFACT_BYTES and not is_image:
            size_label = _artifact_size_label(artifact_path)
            items.append(
                f"""
                <div class="file-list-item" onclick="loadFile('{name}', 'text')">
                    {name} <span class="badge">Large {size_label}</span>
                </div>
                """
            )
            continue

        if is_html:
            try:
                preview = _embedded_html_preview(artifact_path)
                encoded = base64.b64encode(preview.encode("utf-8")).decode()
                items.append(
                    f"""
                    <div class="file-list-item" onclick="loadHTMLPreview('{name}', '{encoded}')">
                        {name} <span class="badge">Preview</span>
                    </div>
                    """
                )
            except OSError:
                pass
            try:
                encoded = base64.b64encode(artifact_path.read_bytes()).decode()
                items.append(
                    f"""
                    <div class="file-list-item" onclick="loadSource('{name}', '{encoded}')">
                        {name} <span class="badge">Source</span>
                    </div>
                    """
                )
            except OSError:
                pass
        elif is_image:
            items.append(
                f"""
                <div class="file-list-item" onclick="loadFile('{name}', 'html')">
                    {name}
                </div>
                """
            )
        else:
            try:
                encoded = base64.b64encode(artifact_path.read_bytes()).decode()
                items.append(
                    f"""
                    <div class="file-list-item" onclick="loadSource('{name}', '{encoded}')">
                        {name}
                    </div>
                    """
                )
            except OSError:
                items.append(
                    f"""
                    <div class="file-list-item" onclick="loadFile('{name}', 'text')">
                        {name}
                    </div>
                    """
                )
    return "".join(items)


def generate_html_report(
    work_dir: Path,
    metadata: Dict,
    prompt_text: str,
    duration_seconds: float,
    agent_name: str,
) -> Path:
    """Generate a self-contained HTML report."""
    report_path = work_dir / "summary.html"
    tokens = metadata.get("Tokens", {})
    total_output = tokens.get("completion_tokens", 0)
    prompt_time_seconds = metadata.get("PromptTime", 0.0)

    duration_str = format_duration_human(duration_seconds)
    if prompt_time_seconds > 0:
        prompt_time_str = format_duration_human(prompt_time_seconds)
        prompt_time_label = "Processing Time"
    else:
        prompt_time_str = duration_str
        prompt_time_label = "Total Time"

    turns = tokens.get("num_turns", 0)
    if turns > 1 and total_output > 0 and duration_seconds > 0:
        tokens_per_second = round(total_output / duration_seconds, 2)
    elif duration_seconds > prompt_time_seconds:
        generation_seconds = duration_seconds - prompt_time_seconds
        tokens_per_second = round(total_output / generation_seconds, 2)
    elif total_output > 0 and duration_seconds > 0:
        tokens_per_second = round(total_output / duration_seconds, 2)
    else:
        tokens_per_second = 0

    extra_token_rows = ""
    if tokens.get("cost_available") is False:
        cost_note = html.escape(
            str(tokens.get("cost_note", "Per-run USD cost is not reported"))
        )
        extra_token_rows += (
            '<div class="token-stat"><span class="label">Cost:</span> '
            f'<span class="value" title="{cost_note}">Not reported</span></div>'
        )
    elif "cost_usd" in tokens:
        extra_token_rows += (
            '<div class="token-stat"><span class="label">Cost:</span> '
            f'<span class="value">${tokens["cost_usd"]:.4f}</span></div>'
        )
    if tokens.get("cache_read_tokens"):
        extra_token_rows += (
            '<div class="token-stat"><span class="label">Cache Read:</span> '
            f'<span class="value">{tokens["cache_read_tokens"]:,}</span></div>'
        )
    if turns:
        extra_token_rows += (
            '<div class="token-stat"><span class="label">Turns:</span> '
            f'<span class="value">{turns}</span></div>'
        )
    if tokens.get("wiggum_attempts"):
        extra_token_rows += (
            '<div class="token-stat"><span class="label">Wiggum Ticks:</span> '
            f'<span class="value">{tokens["wiggum_attempts"]}</span></div>'
        )
    token_label_suffix = " (est.)" if tokens.get("token_counts_estimated") else ""
    rate_label_suffix = " (estimated)" if tokens.get("token_counts_estimated") else ""

    display_agent_name = AGENT_DISPLAY_NAMES.get(agent_name.lower(), agent_name)
    model_name = metadata["Model"].get("Full Name")
    artifact_navigation = _artifact_navigation(work_dir)
    warnings = tokens.get("warnings", [])
    if isinstance(warnings, str):
        warnings = [warnings]
    else:
        warnings = list(warnings)
    terminal_reason = tokens.get("terminal_reason")
    is_terminated = bool(
        terminal_reason
        and str(terminal_reason).strip().lower() not in {"completed"}
    )
    termination = tokens.get("termination", {})
    if is_terminated and not warnings:
        termination_message = (
            termination.get("message")
            if isinstance(termination, dict)
            else ""
        )
        label = str(terminal_reason).replace("_", " ")
        warnings.append(
            f"Run terminated ({label}): {termination_message or 'safety limit reached'}"
        )
    diagnostics_html = ""
    if warnings:
        warning_items = "".join(
            f"<li>{html.escape(str(warning))}</li>" for warning in warnings
        )
        diagnostics_html = (
            '<section class="diagnostics-warning">'
            f"<strong>{'Run terminated' if is_terminated else 'Run diagnostics'}</strong>"
            f"<ul>{warning_items}</ul>"
            "</section>"
        )

    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Evaluation Report: {model_name}</title>
        <style>
            * {{ box-sizing: border-box; }}
            body {{ font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; background: #f5f3ff; color: #1d1d1f; }}
            .container {{ max-width: 1200px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); overflow: hidden; }}
            header {{ background: #1a202c; color: white; padding: 24px; border-bottom: 4px solid #7c3aed; }}
            .diagnostics-warning {{ margin: 18px 24px 0; padding: 14px 16px; background: #fff7ed; border: 1px solid #fb923c; border-radius: 8px; color: #9a3412; }}
            .diagnostics-warning ul {{ margin: 8px 0 0 20px; padding: 0; }}
            h1 {{ margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.5px; }}
            .header-info {{ display: flex; justify-content: space-between; gap: 16px; font-size: 14px; opacity: 0.9; margin-top: 8px; font-weight: 400; color: #a0aec0; }}
            .header-info div {{ min-width: 0; overflow-wrap: anywhere; }}
            .header-info span {{ color: #a78bfa; font-weight: 500; }}

            .meta-grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; padding: 24px; background: #faf5ff; border-bottom: 1px solid #e9d5ff; }}
            .meta-item {{ min-width: 0; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid #ede9fe; display: flex; flex-direction: column; }}
            .meta-item h3 {{ margin: 0 0 12px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #8b5cf6; font-weight: 700; }}

            .info-row {{ display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; font-size: 13px; border-bottom: 1px solid #f5f3ff; padding-bottom: 4px; }}
            .info-row:last-child {{ border-bottom: none; margin-bottom: 0; }}
            .label {{ color: #8b5cf6; font-weight: 500; flex: 0 0 auto; }}
            .value {{ color: #2d3748; font-weight: 600; text-align: right; max-width: 70%; word-break: break-all; }}

            .prompt-card {{ grid-column: span 2; position: relative; }}
            .prompt-content {{ flex: 1; overflow: auto; font-size: 13px; font-family: "Menlo", "Monaco", "Courier New", monospace; line-height: 1.5; color: #4a5568; background: #f5f3ff; padding: 12px; border-radius: 6px; border: 1px solid #ede9fe; max-height: 200px; white-space: pre-wrap; overflow-wrap: anywhere; }}
            .prompt-footer {{ margin-top: 10px; font-size: 12px; color: #8b5cf6; text-align: right; border-top: 1px solid #ede9fe; padding-top: 8px; }}

            .tokens-content {{ flex: 1; display: flex; flex-direction: column; justify-content: space-between; }}
            .token-stat {{ display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; font-size: 13px; }}
            .token-stat.total {{ margin-top: 8px; padding-top: 8px; border-top: 1px solid #ede9fe; font-weight: 700; color: #2d3748; }}
            .token-rate {{ margin-top: auto; padding-top: 12px; text-align: center; color: #7c3aed; font-weight: 600; font-size: 14px; background: #ddd6fe; border-radius: 6px; padding: 8px; }}

            .content-area {{ display: flex; height: 800px; min-height: 0; }}
            .sidebar {{ flex: 0 0 280px; min-width: 0; background: #faf5ff; border-right: 1px solid #e9d5ff; overflow-y: auto; padding: 16px; }}
            .sidebar h3 {{ margin: 0 0 16px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #8b5cf6; font-weight: 700; }}

            .main-view {{ flex: 1 1 auto; min-width: 0; padding: 0; display: flex; flex-direction: column; background: white; }}

            .file-list-item {{ display: block; padding: 10px 12px; margin-bottom: 6px; background: white; border: 1px solid #e9d5ff; border-radius: 8px; cursor: pointer; text-decoration: none; color: #4a5568; font-size: 12px; font-weight: 500; transition: all 0.2s; overflow-wrap: anywhere; }}
            .file-list-item:hover {{ background: #ede9fe; border-color: #8b5cf6; color: #5b21b6; transform: translateY(-1px); }}
            .file-list-item.active {{ background: #8b5cf6; color: white; border-color: #8b5cf6; box-shadow: 0 4px 6px rgba(139, 92, 246, 0.2); }}
            .file-list-item .badge {{ font-size: 9px; text-transform: uppercase; background: #ede9fe; color: #8b5cf6; padding: 1px 4px; border-radius: 4px; float: right; margin-top: 2px; }}
            .file-list-item.active .badge {{ background: rgba(255,255,255,0.2); color: white; }}

            #preview-frame {{ width: 100%; height: 100%; border: none; background: white; }}

            @media (max-width: 900px) {{
                body {{ padding: 12px; }}
                .container {{ border-radius: 10px; }}
                header {{ padding: 18px; }}
                h1 {{ font-size: 22px; }}
                .header-info {{ flex-direction: column; gap: 6px; }}
                .meta-grid {{ grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; padding: 16px; }}
                .prompt-card {{ grid-column: 1 / -1; }}
                .content-area {{ flex-direction: column; height: auto; }}
                .sidebar {{ flex: none; width: 100%; max-height: 240px; border-right: 0; border-bottom: 1px solid #e9d5ff; }}
                .main-view {{ min-height: 560px; height: 70vh; }}
            }}

            @media (max-width: 640px) {{
                body {{ padding: 0; background: white; }}
                .container {{ width: 100%; border-radius: 0; box-shadow: none; }}
                header {{ padding: 16px; }}
                h1 {{ font-size: 20px; letter-spacing: 0; }}
                .meta-grid {{ grid-template-columns: 1fr; gap: 12px; padding: 12px; }}
                .meta-item {{ padding: 14px; border-radius: 8px; }}
                .info-row,
                .token-stat {{ align-items: flex-start; }}
                .value {{ max-width: 62%; }}
                .prompt-content {{ max-height: 260px; }}
                .sidebar {{ max-height: 220px; padding: 12px; }}
                .file-list-item {{ padding: 12px; font-size: 13px; }}
                .main-view {{ min-height: 420px; height: 68vh; }}
            }}
        </style>
        <script>
            function loadFile(filename, type) {{
                const frame = document.getElementById('preview-frame');
                document.querySelectorAll('.file-list-item').forEach(el => el.classList.remove('active'));
                event.currentTarget.classList.add('active');
                frame.srcdoc = '';
                frame.src = filename;
            }}

            function loadHTMLPreview(filename, b64) {{
                const frame = document.getElementById('preview-frame');
                document.querySelectorAll('.file-list-item').forEach(el => el.classList.remove('active'));
                event.currentTarget.classList.add('active');

                try {{
                    frame.srcdoc = atob(b64);
                }} catch (e) {{
                    frame.srcdoc = '<html><body><p>Error decoding preview: ' + e + '</p></body></html>';
                }}
            }}

            function loadSource(filename, b64) {{
                const frame = document.getElementById('preview-frame');
                document.querySelectorAll('.file-list-item').forEach(el => el.classList.remove('active'));
                event.currentTarget.classList.add('active');

                try {{
                    const decoded = atob(b64);
                    const escaped = decoded.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    frame.src = 'about:blank';
                    frame.srcdoc = `<html><body style="margin:0;padding:20px;background:#1e1e1e;color:#d4d4d4;font-family:monospace;font-size:13px;line-height:1.5;"><pre style="white-space:pre-wrap;word-break:break-all;">${{escaped}}</pre></body></html>`;
                }} catch (e) {{
                    frame.srcdoc = '<html><body><p>Error decoding source: ' + e + '</p></body></html>';
                }}
            }}
        </script>
    </head>
    <body>
        <div class="container">
            <header>
                <h1>Agent Evaluation Report</h1>
                <div class="header-info">
                    <div>Agent: <span>{display_agent_name}</span> &nbsp;&nbsp;|&nbsp;&nbsp; Model: <span>{model_name}</span></div>
                    <div>Generation Time: <span>{duration_str}</span></div>
                </div>
            </header>

            {diagnostics_html}

            <div class="meta-grid">
                <div class="meta-item">
                    <h3>System Info</h3>
                    <div>{_info_rows(metadata["Hardware"])}</div>
                </div>
                <div class="meta-item">
                    <h3>Software Versions</h3>
                    <div>{_info_rows(metadata["Software"])}</div>
                </div>
                <div class="meta-item">
                    <h3>Model Details</h3>
                    <div>{_info_rows(metadata["Model"])}</div>
                </div>
                <div class="meta-item prompt-card">
                     <h3>Prompt</h3>
                     <div class="prompt-content">{html.escape(prompt_text)}</div>
                     <div class="prompt-footer">{prompt_time_label}: {prompt_time_str}</div>
                </div>
                <div class="meta-item">
                    <h3>Token Metrics</h3>
                    <div class="tokens-content">
                        <div>
                            <div class="token-stat"><span class="label">Input{token_label_suffix}:</span> <span class="value">{tokens.get("prompt_tokens", 0)}</span></div>
                            <div class="token-stat"><span class="label">Output{token_label_suffix}:</span> <span class="value">{tokens.get("completion_tokens", 0)}</span></div>
                            <div class="token-stat total"><span class="label">Total{token_label_suffix}:</span> <span class="value">{tokens.get("total_tokens", 0)}</span></div>
                            {extra_token_rows}
                        </div>
                        <div class="token-rate">~{tokens_per_second} tokens/sec{rate_label_suffix}</div>
                    </div>
                </div>
            </div>

            <div class="content-area">
                <div class="sidebar">
                    <h3>Artifacts</h3>
                    {artifact_navigation}
                </div>
                <div class="main-view">
                    <iframe id="preview-frame" src="about:blank"></iframe>
                </div>
            </div>
        </div>
        <script>
            const firstItem = document.querySelector('.file-list-item');
            if(firstItem) firstItem.click();
        </script>
    </body>
    </html>
    """

    report_path.write_text(html_content, encoding="utf-8")
    return report_path

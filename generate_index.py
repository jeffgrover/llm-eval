#!/usr/bin/env python3
import os
import re
from pathlib import Path

# Configuration
EVALS_DIR = Path("evals")
INDEX_FILE = Path("index.html")

# Agent Name Mapping (Consistent with evaluate_agent.py)
AGENT_DISPLAY_NAMES = {
    "mistral": "Mistral Vibe",
    "gemini": "Gemini CLI",
    "claude": "Claude Code",
    "crush": "Charmbracelet Crush",
    "opencode": "OpenCode CLI",
    "vibe": "Mistral Vibe" # Alias
}

# Known prompt file stems (auto-detected from *.txt at repo root)
def get_known_prompts():
    prompts = set()
    for f in Path(".").glob("*.txt"):
        prompts.add(f.stem)
    return prompts

def get_display_name(agent_raw):
    return AGENT_DISPLAY_NAMES.get(agent_raw.lower(), agent_raw.title())

# Per-agent badge colors
AGENT_COLORS = {
    "Claude Code": "#d97706",
    "Gemini CLI": "#2563eb",
    "OpenCode CLI": "#059669",
    "Mistral Vibe": "#dc2626",
    "Charmbracelet Crush": "#7c3aed",
}

def get_agent_color(agent_name):
    return AGENT_COLORS.get(agent_name, "#6b7280")

def detect_provider(summary_path: Path) -> str:
    """Parse summary.html to determine if the eval used a cloud or local provider."""
    if not summary_path.exists():
        return "unknown"
    try:
        content = summary_path.read_text(encoding="utf-8", errors="ignore")
        if "Cloud API" in content:
            # Try to extract the provider name
            m = re.search(r'Provider:</span>\s*<span[^>]*>([^<]+)', content)
            if m:
                return m.group(1).strip()
            return "Cloud"
        if "LM Studio" in content:
            return "Local (LM Studio)"
        # Check for provider_id from OpenCode
        m = re.search(r'Provider:</span>\s*<span[^>]*>([^<]+)', content)
        if m:
            return m.group(1).strip()
    except Exception:
        pass
    return "unknown"


def parse_directory_name(dir_name, known_prompts):
    """
    Parses directory name to extract Agent, Model, and Prompt separately.
    Format: {agent}_{model}_{prompt} where prompt matches a known prompt file stem.
    """
    # Detect separator: use '_' if present
    sep = '_' if '_' in dir_name else '-'
    parts = dir_name.split(sep)

    if len(parts) < 3:
        return {
            "Agent": "Unknown",
            "Model": dir_name,
            "Prompt": "",
            "Raw": dir_name
        }

    agent = parts[0]

    # Find the prompt by checking suffixes against known prompts.
    # Prompt names can contain the separator (e.g. "elevator_prompt"), so try
    # longest match first by joining from the end.
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
        "Raw": dir_name
    }


def generate_index_html():
    if not EVALS_DIR.exists():
        print(f"[-] Directory '{EVALS_DIR}' not found.")
        return

    known_prompts = get_known_prompts()

    # Scan directories
    evaluations = []
    for item in EVALS_DIR.iterdir():
        if item.is_dir():
            summary_path = item / "summary.html"
            has_report = summary_path.exists()

            info = parse_directory_name(item.name, known_prompts)
            info["Path"] = item
            info["HasReport"] = has_report
            info["ReportLink"] = f"evals/{item.name}/summary.html"
            info["Provider"] = detect_provider(summary_path)

            evaluations.append(info)

    # Sort by agent name, then model name
    evaluations.sort(key=lambda x: (x["Agent"].lower(), x["Model"].lower(), x["Prompt"].lower()))

    # Group by agent
    agents_order = []
    agents_map = {}
    for ev in evaluations:
        agent = ev["Agent"]
        if agent not in agents_map:
            agents_map[agent] = []
            agents_order.append(agent)
        agents_map[agent].append(ev)

    # HTML Template
    html_content = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>LLM Agent Evaluations</title>
        <style>
            body { font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; background: #f5f3ff; color: #1d1d1f; }
            .container { max-width: 1200px; margin: 0 auto; }

            header { text-align: center; margin-bottom: 40px; padding: 40px 0; }
            h1 { margin: 0 0 16px 0; font-size: 32px; font-weight: 700; letter-spacing: -1px; color: #1a202c; }
            p.intro { font-size: 18px; color: #6b7280; max-width: 600px; margin: 0 auto; line-height: 1.5; }

            .agent-section { margin-bottom: 48px; }
            .agent-section-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #e5e7eb; }
            .agent-section-badge { padding: 6px 14px; border-radius: 9999px; font-size: 14px; font-weight: 600; color: white; letter-spacing: 0.3px; }
            .agent-section-count { font-size: 14px; color: #9ca3af; }

            .eval-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; }

            .eval-card {
                background: white;
                border-radius: 12px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                transition: transform 0.2s, box-shadow 0.2s;
                border: 1px solid #e5e7eb;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }
            .eval-card:hover { transform: translateY(-4px); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); }

            .card-header { padding: 16px; border-bottom: 1px solid #f3f4f6; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
            .provider-badge { padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
            .provider-cloud { background: #dbeafe; color: #1d4ed8; }
            .provider-local { background: #dcfce7; color: #166534; }
            .provider-unknown { background: #f3f4f6; color: #6b7280; }
            .status-indicator { height: 8px; width: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
            .status-success { background: #10b981; box-shadow: 0 0 0 2px #d1fae5; }
            .status-missing { background: #cbd5e0; }

            .card-body { padding: 20px; flex: 1; }
            .model-name { font-size: 16px; font-weight: 700; color: #1f2937; margin-bottom: 8px; word-break: break-all; line-height: 1.3; }
            .prompt-label { display: inline-block; font-size: 12px; color: #6b7280; background: #f9fafb; border: 1px solid #e5e7eb; padding: 2px 8px; border-radius: 4px; font-family: monospace; }

            .card-footer { padding: 16px; background: #fff; border-top: 1px solid #f3f4f6; text-align: center; }
            .view-btn {
                display: inline-block;
                width: 100%;
                padding: 10px 0;
                background: #7c3aed;
                color: white;
                text-decoration: none;
                border-radius: 6px;
                font-weight: 500;
                font-size: 14px;
                transition: background 0.2s;
            }
            .view-btn:hover { background: #6d28d9; }
            .view-btn.disabled { background: #cbd5e0; cursor: not-allowed; pointer-events: none; }

            .empty-state { text-align: center; color: #6b7280; padding: 60px; grid-column: 1 / -1; }
        </style>
    </head>
    <body>
        <div class="container">
            <header>
                <h1>LLM Agent Evaluation Dashboard</h1>
                <p class="intro">
                    Browse evaluation results organized by agent, showing model, prompt, and whether the run used a local or cloud provider.
                </p>
            </header>
    """

    if not evaluations:
        html_content += """
        <div class="empty-state">
            <h3>No evaluations found</h3>
            <p>Run <code>evaluate_agent.py</code> to generate new reports.</p>
        </div>
        """

    for agent_name in agents_order:
        evs = agents_map[agent_name]
        color = get_agent_color(agent_name)
        count = len(evs)
        html_content += f"""
            <div class="agent-section">
                <div class="agent-section-header">
                    <span class="agent-section-badge" style="background: {color};">{agent_name}</span>
                    <span class="agent-section-count">{count} evaluation{"s" if count != 1 else ""}</span>
                </div>
                <div class="eval-grid">
        """

        for ev in evs:
            status_class = "status-success" if ev["HasReport"] else "status-missing"
            btn_class = "view-btn" if ev["HasReport"] else "view-btn disabled"
            btn_text = "View Report" if ev["HasReport"] else "No Report"

            provider = ev["Provider"]
            if provider == "unknown":
                provider_class = "provider-unknown"
                provider_label = "Unknown"
            elif "Local" in provider or provider == "unknown":
                provider_class = "provider-local"
                provider_label = provider
            else:
                provider_class = "provider-cloud"
                provider_label = provider

            prompt_html = ""
            if ev["Prompt"]:
                prompt_display = ev["Prompt"].replace("_", " ").title()
                prompt_html = f'<div style="margin-top: 10px;"><span class="prompt-label">{prompt_display}</span></div>'

            html_content += f"""
                <div class="eval-card">
                    <div class="card-header">
                        <span class="provider-badge {provider_class}">{provider_label}</span>
                        <span class="status-indicator {status_class}" title="{'Report available' if ev['HasReport'] else 'No report'}"></span>
                    </div>
                    <div class="card-body">
                        <div class="model-name">{ev['Model']}</div>
                        {prompt_html}
                    </div>
                    <div class="card-footer">
                        <a href="{ev['ReportLink']}" class="{btn_class}">{btn_text}</a>
                    </div>
                </div>
            """

        html_content += """
                </div>
            </div>
        """

    html_content += """
        </div>
    </body>
    </html>
    """

    with open(INDEX_FILE, "w", encoding="utf-8") as f:
        f.write(html_content)

    print(f"[+] Index generated at: {INDEX_FILE.absolute()}")

if __name__ == "__main__":
    generate_index_html()

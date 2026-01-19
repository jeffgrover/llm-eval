#!/usr/bin/env python3
import os
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

def get_display_name(agent_raw):
    return AGENT_DISPLAY_NAMES.get(agent_raw.lower(), agent_raw.title())

def parse_directory_name(dir_name):
    """
    Parses directory name to extract Agent, Model, and Prompt.
    Supports both '_' and '-' as separators.
    """
    # Detect separator
    sep = '_' if '_' in dir_name else '-'
    parts = dir_name.split(sep)
    
    if len(parts) < 3:
        return {
            "Agent": "Unknown", 
            "ModelPrompt": dir_name, 
            "Raw": dir_name
        }
    
    agent = parts[0]
    model_prompt = sep.join(parts[1:])
    
    return {
        "Agent": get_display_name(agent),
        "ModelPrompt": model_prompt,
        "Raw": dir_name
    }

def generate_index_html():
    if not EVALS_DIR.exists():
        print(f"[-] Directory '{EVALS_DIR}' not found.")
        return

    # Scan directories
    evaluations = []
    for item in EVALS_DIR.iterdir():
        if item.is_dir():
            summary_path = item / "summary.html"
            has_report = summary_path.exists()
            
            info = parse_directory_name(item.name)
            info["Path"] = item
            info["HasReport"] = has_report
            info["ReportLink"] = f"evals/{item.name}/summary.html"
            
            evaluations.append(info)
    
    # Sort by name
    evaluations.sort(key=lambda x: x["Raw"])

    # HTML Template
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Local LLM Evaluations</title>
        <style>
            body {{ font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; background: #f5f3ff; color: #1d1d1f; }}
            .container {{ max-width: 1200px; margin: 0 auto; }}
            
            header {{ text-align: center; margin-bottom: 40px; padding: 40px 0; }}
            h1 {{ margin: 0 0 16px 0; font-size: 32px; font-weight: 700; letter-spacing: -1px; color: #1a202c; }}
            p.intro {{ font-size: 18px; color: #6b7280; max-width: 600px; margin: 0 auto; line-height: 1.5; }}
            
            .eval-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; }}
            
            .eval-card {{ 
                background: white; 
                border-radius: 12px; 
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); 
                transition: transform 0.2s, box-shadow 0.2s; 
                border: 1px solid #e9d5ff;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }}
            .eval-card:hover {{ transform: translateY(-4px); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); border-color: #8b5cf6; }}
            
            .card-header {{ background: #faf5ff; padding: 16px; border-bottom: 1px solid #f3e8ff; display: flex; align-items: center; justify-content: space-between; }}
            .agent-badge {{ background: #8b5cf6; color: white; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }}
            .status-indicator {{ height: 8px; width: 8px; border-radius: 50%; display: inline-block; }}
            .status-success {{ background: #10b981; box-shadow: 0 0 0 2px #d1fae5; }}
            .status-missing {{ background: #cbd5e0; }}
            
            .card-body {{ padding: 20px; flex: 1; }}
            .model-name {{ font-size: 14px; font-weight: 600; color: #4b5563; margin-bottom: 8px; word-break: break-all; }}
            .path-name {{ font-size: 12px; color: #9ca3af; font-family: monospace; margin-bottom: 16px; }}
            
            .card-footer {{ padding: 16px; background: #fff; border-top: 1px solid #f3e8ff; text-align: center; }}
            .view-btn {{ 
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
            }}
            .view-btn:hover {{ background: #6d28d9; }}
            .view-btn.disabled {{ background: #cbd5e0; cursor: not-allowed; pointer-events: none; }}
            
            .empty-state {{ text-align: center; color: #6b7280; padding: 60px; grid-column: 1 / -1; }}
        </style>
    </head>
    <body>
        <div class="container">
            <header>
                <h1>Local LLM Evaluation Dashboard</h1>
                <p class="intro">
                    Welcome to the central hub for local agent evaluations. 
                    Browse the results of various Agent, Model, and Prompt combinations executed on this machine.
                </p>
            </header>
            
            <div class="eval-grid">
    """
    
    if not evaluations:
        html_content += """
        <div class="empty-state">
            <h3>No evaluations found</h3>
            <p>Run <code>evaluate_agent.py</code> to generate new reports.</p>
        </div>
        """
    
    for ev in evaluations:
        status_class = "status-success" if ev["HasReport"] else "status-missing"
        btn_class = "view-btn" if ev["HasReport"] else "view-btn disabled"
        btn_text = "View Report" if ev["HasReport"] else "No Report"
        
        html_content += f"""
        <div class="eval-card">
            <div class="card-header">
                <span class="agent-badge">{ev['Agent']}</span>
                <span class="status-indicator {status_class}" title="Report Available"></span>
            </div>
            <div class="card-body">
                <div class="model-name" title="{ev['ModelPrompt']}">{ev['ModelPrompt']}</div>
                <div class="path-name">{ev['Raw']}</div>
            </div>
            <div class="card-footer">
                <a href="{ev['ReportLink']}" class="{btn_class}">{btn_text}</a>
            </div>
        </div>
        """
        
    html_content += """
            </div>
        </div>
    </body>
    </html>
    """
    
    with open(INDEX_FILE, "w", encoding="utf-8") as f:
        f.write(html_content)
    
    print(f"[+] Index generated at: {INDEX_FILE.absolute()}")

if __name__ == "__main__":
    generate_index_html()

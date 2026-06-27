# LLM Agent Evaluation Suite

## Project Overview
A benchmarking framework for evaluating agentic CLI tools (Codex, Gemini CLI, Mistral Vibe, OpenCode, Crush, Pi Coding Agent) against both local LLMs (via LM Studio) and cloud API providers. Generates self-contained HTML reports with system info, model details, token metrics, and artifact previews.

## Architecture
- `evaluate_agent.py` - Main orchestrator: agent runners, metadata collection, HTML report generation
- `generate_index.py` - Dashboard generator that aggregates all evaluation results into `index.html`, computes deterministic prompt-specific scores, and renders comparison tabs plus the by-agent catalog
- `evals/` - Output directory; each run creates `{agent}_{model}_{prompt}/` with artifacts + `summary.html`
- `reference/` - Known-good prompt implementations and preview images shown at the top of the dashboard
- Prompt files (`*.txt`, `*.md`) at repo root define the coding tasks given to agents

## Key Patterns
- **AgentRunner** base class with `execute_agent()` overridden per agent (ClaudeRunner, GeminiRunner, etc.)
- **MetadataCollector** static methods gather hardware, software, model, and token usage info
- `_run_process()` streams agent stdout to both console and `CHAT_SESSION.TXT`
- ClaudeRunner uses `--output-format stream-json` to capture token usage, cost, and turn count into `CLAUDE_RESULT.JSON`
- Codex, Gemini, OpenCode, Pi, and Vibe runs use their respective `*_RESULT.JSON` files when available for dashboard token/cost/turn metrics
- `generate_index.py` separates scored views for elevator and office prompts; deterministic scoring favors reproducible file, browser-readiness, implementation-signal, completion, and efficiency checks
- Non-local mode (`--non-local`) bypasses LM Studio and uses agents' default cloud providers

## Commands
- Run an evaluation: `./evaluate_agent.py --model '<model>' --agent <agent> --prompt-file <file.txt> [--non-local]`
- Regenerate dashboard: `python3 generate_index.py`

## Code Style
- Python 3 with type hints (`Dict`, `List`, `Optional` from typing)
- f-strings for formatting, `Path` objects for file paths
- Inline HTML generation via f-strings in `generate_html_report()`
- No external dependencies beyond Python stdlib

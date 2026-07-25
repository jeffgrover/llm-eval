# LLM Agent Evaluation Suite

## Project Overview
A benchmarking framework for evaluating agentic CLI tools (Codex, Gemini CLI, Mistral Vibe, OpenCode, Crush, Pi Coding Agent, Qoder CLI) against both local LLMs (via LM Studio) and cloud API providers. Generates self-contained HTML reports with system info, model details, token metrics, and artifact previews.

## Architecture
- `evaluate_agent.py` - Thin CLI entry point and runner registry
- `evaluation_core.py` - Shared run lifecycle, metadata, workspace, LM Studio, and immutable local-provider configuration
- `evaluation_metrics.py` - Result/log token and cost normalization
- `evaluation_report.py` - HTML summary rendering and artifact previews
- `runner_events.py` - Pure vendor event normalization used by runner loops and fixture tests
- `runners/` - One adapter module per agent CLI
- `generate_index.py` - Dashboard generator that aggregates all evaluation results into `index.html`, computes deterministic prompt-specific scores, and renders comparison tabs plus the by-agent catalog
- `tests/fixtures/runner_events/` - Representative agent JSON/JSONL streams for parser contract tests
- `evals/` - Output directory; each run creates `{agent}_{model}_{prompt}/` with artifacts + `summary.html`
- `reference/` - Known-good prompt implementations and preview images shown at the top of the dashboard
- Prompt files (`*.txt`, `*.md`) at repo root define the coding tasks given to agents

## Key Patterns
- **AgentRunner** in `evaluation_core.py` owns orchestration; adapters override `execute_agent()` in `runners/`
- Frozen **LocalProviderConfig** values are selected by the CLI and injected into runners
- Agent configuration is scoped with `agent_configuration()` so temporary Pi/Vibe changes can be restored on failure
- **MetadataCollector** static methods gather hardware, software, model, and token usage info
- `_run_process()` streams agent stdout to both console and `CHAT_SESSION.TXT`
- Structured runner loops use pure parsers from `runner_events.py`
- ClaudeRunner uses `--output-format stream-json` to capture token usage, cost, and turn count into `CLAUDE_RESULT.JSON`
- Codex, Gemini, OpenCode, Pi, Qoder, and Vibe runs use their respective `*_RESULT.JSON` files when available for dashboard token/cost/turn metrics
- Qoder preserves `QODER_EVENTS.JSONL`; when its CLI reports zero usage, result metrics contain clearly labeled transcript-based token estimates and mark per-run USD cost unavailable
- `generate_index.py` separates scored views for elevator and office prompts; deterministic scoring favors reproducible file, browser-readiness, implementation-signal, completion, and efficiency checks
- Non-local mode (`--non-local`) bypasses LM Studio and uses agents' default cloud providers

## Commands
- Run an evaluation: `./evaluate_agent.py --model '<model>' --agent <agent> --prompt-file <file.txt> [--non-local]`
- Open the generated report: add `--open-report`
- Execute generated root-level Python: add `--execute-generated-python`
- Regenerate dashboard: `python3 generate_index.py`
- Run tests: `python3 -m unittest discover -s tests -v`

## Code Style
- Python 3 with type hints (`Dict`, `List`, `Optional` from typing)
- f-strings for formatting, `Path` objects for file paths
- HTML report rendering is isolated in `evaluation_report.py`
- No external dependencies beyond Python stdlib

# LLM Agent Evaluation Suite

## Project Overview
A benchmarking framework for evaluating agentic CLI tools (Claude Code, Gemini CLI, Mistral Vibe, OpenCode, Crush, Pi Coding Agent) against both local LLMs (via LM Studio) and cloud API providers. Generates self-contained HTML reports with system info, model details, token metrics, and artifact previews.

## Architecture
- `evaluate_agent.py` - Thin CLI entry point and runner registry
- `evaluation_core.py` - Shared lifecycle, metadata, workspace, LM Studio, and immutable provider configuration
- `evaluation_metrics.py` - Token/cost/cache normalization from result files and logs
- `evaluation_report.py` - Self-contained HTML report rendering
- `runner_events.py` - Pure vendor JSON/JSONL normalization
- `runners/` - One adapter module per agent CLI
- `generate_index.py` - Dashboard generator that aggregates all evaluation results into `index.html`
- `tests/fixtures/runner_events/` - Representative event streams for contract tests
- `evals/` - Output directory; each run creates `{agent}_{model}_{prompt}/` with artifacts + `summary.html`
- Prompt files (`*.txt`) at repo root define the coding tasks given to agents

## Key Patterns
- **AgentRunner** owns orchestration and adapters in `runners/` override `execute_agent()`
- Frozen local-provider configuration is selected once and injected into runners
- Temporary Pi/Vibe configuration is scoped so restoration occurs on failure
- **MetadataCollector** static methods gather hardware, software, model, and token usage info
- `_run_process()` streams agent stdout to both console and `CHAT_SESSION.TXT`
- Structured event loops use the pure parsers in `runner_events.py`
- ClaudeRunner uses `--output-format stream-json` to capture token usage, cost, and turn count into `CLAUDE_RESULT.JSON`
- Non-local mode (`--non-local`) bypasses LM Studio and uses agents' default cloud providers

## Commands
- Run an evaluation: `./evaluate_agent.py --model '<model>' --agent <agent> --prompt-file <file.txt> [--non-local]`
- Open a report after the run: add `--open-report`
- Execute generated Python artifacts: add `--execute-generated-python`
- Regenerate dashboard: `python3 generate_index.py`
- Run tests: `python3 -m unittest discover -s tests -v`

## Code Style
- Python 3 with type hints (`Dict`, `List`, `Optional` from typing)
- f-strings for formatting, `Path` objects for file paths
- HTML generation is isolated in `evaluation_report.py`
- No external dependencies beyond Python stdlib

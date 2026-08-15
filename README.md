# LLM Agent Evaluation Suite 🚀

**[View the live dashboard](https://jeffgrover.github.io/llm-eval/)**

This suite provides tools to automate the benchmarking of agentic CLI tools against both local LLMs (via LM Studio) and cloud API providers (Anthropic, Google, Groq, Cerebras, etc.). It captures detailed performance metrics, server logs, command outputs, and generated artifacts, then builds self-contained run reports plus a scored comparison dashboard.

## Reference Implementations

The best results produced so far for each prompt. Click a preview to launch the live simulation.

| [Elevator Simulation](reference/elevator/index.html) | [Office Building Simulation](reference/office/index.html) |
| :---: | :---: |
| [![Elevator preview](reference/elevator/preview.png)](reference/elevator/index.html) | [![Office preview](reference/office/preview.png)](reference/office/index.html) |

## Current Benchmark Focus

- **Elevator prompt**: the main local-model benchmark. It asks agents to build a browser-only Three.js elevator simulation.
- **Office prompt v3**: the main frontier/cloud benchmark. It asks agents to build a richer office-day simulation with persistent agents, schedules, navigation, and elevator behavior.

The generated dashboard keeps these prompt families separate so local elevator runs and frontier office runs can be compared without one burying the other.

## 1. Local Provider Setup

By default, local evaluations use LM Studio on `http://localhost:1234/v1`.
The evaluator asks LM Studio to unload other models and load the requested model
before the run. It prefers LM Studio's REST API and falls back to the `lms` CLI
when the REST API is unavailable.

For an oMLX server, start oMLX with its default OpenAI-compatible endpoint
(`http://localhost:8000/v1`) and pass `--provider omlx`:

```bash
./evaluate_agent.py --agent pi-wiggum --model <omlx-model-id> \
  --prompt-file elevator_prompt_wiggum.txt --provider omlx
```

The model ID must match one returned by `http://localhost:8000/v1/models`.
The evaluator reads the API key from oMLX's `~/.omlx/settings.json`; set
`OMLX_BASE_URL` or `OMLX_API_KEY` to override the detected settings.

For a llama.cpp-compatible server at `http://localhost:8080/v1`, use
`--provider llama-server`. Passing `--provider` bypasses LM Studio model
loading; the selected server is expected to be running already.

### LM Studio Setup

First, you'll need a platform to host your local models.

1.  **Download LM Studio**: Visit [lmstudio.ai](https://lmstudio.ai/) and install the latest version.
2.  **Turn on API Server**:
    -   Open LM Studio and navigate to the **Local Server** (↔️) tab.
    -   Click **Start Server**. This exposes an OpenAI-compatible API at `http://localhost:1234/v1`.
3.  **Hardware Tips**:
    -   Leave memory beyond the model weights for the KV cache, prompt-evaluation buffers, the operating system, and the agent CLI. A model that merely loads may still run out of memory when a long agent prompt begins processing.
    -   Four-bit GGUF quantizations are a practical starting point for larger local models. Prefer a slightly smaller quantization when the largest file leaves little inference headroom.
    -   Use the load controls described below to reduce context length or prompt-evaluation batch size on memory-constrained systems.

### Choosing a Model

Use a chat/instruct model that supports tool calling through an OpenAI-compatible
chat-completions endpoint. Exact model availability changes quickly, so the
[live dashboard](https://jeffgrover.github.io/llm-eval/) is the best record of
models that have actually been exercised by this suite. The `--model` value
must match the identifier advertised by the selected provider's `/v1/models`
endpoint.

### Choosing an Agent Harness

Harness choice can materially change a model's score, so choose the comparison
you actually want:

| Harness | Best use in this suite | Main tradeoff |
| :--- | :--- | :--- |
| **Pi** | Clean, low-overhead model baseline | Minimal guidance assumes the model already knows how to plan and use tools well. |
| **OpenCode** | Balanced general-purpose baseline | More orchestration and prompt/tool policy than Pi, but still relatively portable across model families. |
| **Crush** | Typed repositories where prescriptive workflow and first-class LSP tools may help | A larger, more directive prompt and broad tool surface can burden smaller/local models; 8K context is insufficient for current releases. |
| **Claude Code / Codex** | Measure the integrated vendor agent experience | Model and harness are co-designed, so results are less useful as a harness-neutral model comparison. |

In shorthand, prompt prescriptiveness is roughly **Pi < OpenCode < Crush**.
Use more than one harness when the goal is to distinguish raw model capability
from the benefit of a particular agent's scaffolding.

---

## 2. Agent CLI Installation

Install the agents you wish to evaluate. Each has its own setup requirements:

| Agent | CLI Name | Setup Instructions |
| :--- | :--- | :--- |
| **Mistral Vibe** | `vibe` | [mistralai/mistral-vibe](https://github.com/mistralai/mistral-vibe) |
| **Claude Code** | `claude` | [Anthropic Claude Code Docs](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code) |
| **Codex CLI** | `codex` | [OpenAI Codex CLI](https://github.com/openai/codex) |
| **Gemini / Antigravity CLI** | `agy` | Invoked through the Antigravity-compatible CLI; accepted evaluator names are `gemini`, `agy`, and `antigravity` |
| **Crush** | `crush` | [charmbracelet/crush](https://github.com/charmbracelet/crush) |
| **OpenCode** | `opencode` | [opencode-ai/opencode](https://github.com/opencode-ai/opencode) |
| **Pi Coding Agent** | `pi` | [badlogic/pi-mono](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) |
| **Pi Wiggum Repair Loop** | `pi-wiggum` | Uses `pi` with evaluator-owned static/runtime repair attempts |
| **Qoder CLI** | `qodercli` | [Qoder CLI Quick Start](https://docs.qoder.com/en/cli/quick-start); verify with `qodercli --version` |

---

## 3. Running Evaluations

Once LM Studio is running and your agent is installed, you can perform an experiment.

### Basic Command
Run the evaluation script by specifying the model key (as it appears in `lms ls`) and the agent type:

```bash
./evaluate_agent.py --model <model-key> --agent vibe --prompt-file prompt.txt
```

### Parameters
-   `--model`: The LM Studio model identifier (or cloud model name when using `--non-local`).
    For Antigravity's effort-qualified Gemini models, names such as `gemini-3.7-flash`
    resolve to the exact `Gemini 3.7 Flash (High)` model name. Append `-medium` or
    `-low` to select another effort-qualified model.
-   `--agent`: One of `vibe`, `gemini`, `agy`, `antigravity`, `claude`, `codex`, `opencode`, `crush`, `pi`, `pi-wiggum`, or `qoder`.
-   `--prompt-file`: Path to a text file containing the initial prompt for the agent.
-   `--non-local`: (Optional) Skip LM Studio and use the agent's default cloud provider instead.
-   `--provider`: (Optional) Select `omlx`, `llama-server`, or an agent-specific provider.
-   `--headless`: Do not open the generated report. This is the default.
-   `--open-report`: Open `summary.html` in the default browser after the run.
-   `--execute-generated-python`: Execute root-level Python artifacts and capture their output in `OUTPUT.TXT`. This is disabled by default.
-   `--restore-agent-config`: Restore Vibe's original `active_model` after the run. Pi's temporary provider file is always restored or removed.
-   `--lms-context-length`: Reload the LM Studio model with an explicit context length. OpenCode is given the same advertised context limit.
-   `--lms-eval-batch-size`: Set LM Studio llama.cpp's prompt-evaluation batch size. Smaller values can reduce peak memory during prompt ingestion.
-   `--lms-flash-attention`: Enable Flash Attention when LM Studio loads a compatible llama.cpp model.
-   `--lms-cpu-kv-cache`: Keep the KV cache in system memory rather than offloading it to the GPU. On unified-memory systems this changes placement/accounting, not the total physical-memory requirement.
-   `--max-seconds`: Stop an agent run after this total wall time (default `3600`; `0` disables). For Pi Wiggum this applies to each repair attempt inside its separate four-hour cap.
-   `--max-idle-seconds`: Stop after this long without stdout or stderr from the agent process (default `900`; `0` disables). Any output resets the inactivity timer.
-   `--max-turns`: Stop after this many streamed assistant turns (default `200`; `0` disables).
-   `--max-total-tokens`: Stop after this many accumulated input/output tokens when live usage is available (default `5000000`; `0` disables).
-   `--max-cost-usd`: Stop at this reported live cost (default `$10`; `0` disables).
-   `--doom-loop-repeats`: Stop a short repeating tool cycle after this many repetitions (default `12`; `0` disables).
-   `--doom-loop-max-cycle-length`: Longest repeating tool sequence to inspect (default `4`).
-   `--doom-loop-min-calls`: Minimum consecutive tool calls required before declaring a loop (default `24`).

LM Studio load behavior for the four `--lms-*` options applies when the
evaluator is managing an LM Studio model. Supplying any explicit load option
forces an already-loaded target model to be unloaded and reloaded so LM Studio
does not silently retain its previous GUI settings. When supported, LM Studio's
effective load configuration is printed after loading. The context-length value
also configures OpenCode's provider metadata when OpenCode is pointed at another
local provider.

For a large model with limited inference headroom, a conservative invocation is:

```bash
LLM_EVAL_LOCAL_OUTPUT_LIMIT=2048 ./evaluate_agent.py \
  --model <model-key> \
  --agent opencode \
  --prompt-file elevator_prompt_v3.txt \
  --lms-context-length 16384 \
  --lms-eval-batch-size 64
```

OpenCode's default local limits are 32,768 context tokens and 16,384 output
tokens. Override them with `LLM_EVAL_LOCAL_CONTEXT_LIMIT` and
`LLM_EVAL_LOCAL_OUTPUT_LIMIT`. An explicit `--lms-context-length` takes
precedence over `LLM_EVAL_LOCAL_CONTEXT_LIMIT` for OpenCode so the client and
server agree on the usable context window.

OpenCode results also record the finish reason, tool-call count, generated
artifact names, and diagnostic warnings. A clean process exit is therefore
still flagged when the model exhausts its output allowance, emits no tool
calls, or claims completion without producing artifact files.

### Runaway-agent safeguards

Normal evaluations have a hard wall-clock ceiling, a reset-on-output inactivity
limit, live turn/token/cost ceilings, and a repeated tool-cycle detector. The detector normalizes tool name
and target (for example `read:elevator.js` and `edit:elevator.js`) while ignoring
changing file contents, then stops short cycles that repeat exactly at the tail
of the event stream. The tool-cycle check is enabled for structured adapters
that expose tool names and arguments during the run, including OpenCode,
Claude, Pi, and Qoder. Live token and cost ceilings apply only when the CLI reports
those values before completion.

A safety stop kills the spawned process group but does not delete the run
workspace. The result JSON records `terminal_reason`, a human-readable message,
and detector/limit evidence; `summary.html` displays it as a prominent
diagnostic. The dashboard treats the run as partial/failed and caps a detected
doom loop at 35 points. Use any corresponding value of `0` to disable a limit
for an intentional long-running experiment. Pi Wiggum uses the configured wall
and inactivity limits for each attempt and remains governed by its separate
evaluator-owned repair-loop cap.

The script creates a uniquely named workspace in `evals/`, captures logs and
artifacts, and writes `summary.html`. Browser opening and generated Python
execution are separate opt-in post-processing steps:

```bash
./evaluate_agent.py --model <model-key> --agent vibe \
  --prompt-file prompt.txt --open-report

./evaluate_agent.py --model <model-key> --agent vibe \
  --prompt-file prompt.txt --execute-generated-python
```

### Codex CLI
Codex currently runs through your ChatGPT account service, so use it with `--non-local`:

```bash
./evaluate_agent.py --model gpt-5.5 --agent codex --prompt-file elevator_prompt.txt --non-local
```

Codex runs are saved with `CHAT_SESSION.TXT`, raw `CODEX_EVENTS.JSONL`, `CODEX_LAST_MESSAGE.TXT`, and aggregated token metrics in `CODEX_RESULT.JSON`.

### OpenCode

For each run, the evaluator creates an isolated `opencode.json` in the run
workspace and selects `<provider>/<model>` when the provider can be resolved.
For local OpenAI-compatible providers, the catalog is populated dynamically
from the server's `/v1/models` response, with the explicitly requested model
retained as a fallback if discovery fails. This allows newly loaded LM Studio
models to work without maintaining a hard-coded OpenCode model list.

OpenCode normally starts background title generation alongside the main build
request. The evaluator disables that title agent for unattended runs to avoid a
second concurrent inference request and its additional prompt/KV memory
pressure. The generated `opencode.json`, readable transcript, normalized usage,
and detected provider/model are retained in the run directory.

In non-local mode, pass a complete OpenCode model reference such as
`provider/model`, or use a bare model name already declared in the user's global
OpenCode configuration. `--provider <name>` can explicitly select an existing
custom provider.

### Crush

The Crush adapter is validated against Crush 0.87.0. Local runs receive an
isolated `crush.json` that selects the requested provider/model, advertises the
same context/output limits used by the evaluator, disables provider-list
updates and telemetry, and permits the current built-in tools for unattended
execution. Non-local runs use the user's configured providers and accept either
a bare model ID or an explicit `provider/model` reference.

Each run retains readable output in `CHAT_SESSION.TXT`, Crush's machine-readable
session export in `CRUSH_SESSION.JSON`, and normalized tokens, cost, turns, tool
calls, finish reasons, selected provider/model, CLI version, artifacts, and
warnings in `CRUSH_RESULT.JSON`. These counters feed both `summary.html` and the
central dashboard. Current Crush has substantial system/tool prompt overhead;
in validation, an 8,192-token local context failed before the one-line user
prompt could run, so use at least the evaluator's 32K default.

### Qoder CLI

Qoder is a cloud-only runner, so use it with `--non-local` and one of the model
names shown by `qodercli --list-models`:

```bash
./evaluate_agent.py --model '<qoder-model>' --agent qoder \
  --prompt-file office_prompt_v3.md --non-local
```

Qoder runs save the readable transcript in `CHAT_SESSION.TXT`, the complete
stream in `QODER_EVENTS.JSONL`, and normalized metrics in `QODER_RESULT.JSON`.
The currently tested Qoder CLI (1.1.5) reports zero for its token and USD-cost
fields, including in its diagnostic logs. Until Qoder supplies real counters, the evaluator derives
clearly labeled token estimates from the model-visible stream (using four
characters per token and cumulative input across turns). Per-run USD cost is
shown as unavailable, not as a measured zero; Qoder-hosted usage is billed in
Credits rather than exposed as a per-run USD amount. If a future Qoder version
returns real usage, those values automatically take precedence over the
estimator.

### Pi Wiggum Repair Loop
`pi-wiggum` invokes Pi non-interactively, then lets the evaluator run the static and runtime checkers. Failed checker output is fed back to Pi for another repair attempt until the checks pass or the 4-hour wall-clock cap is reached. Each attempt uses `--max-seconds` and `--max-idle-seconds`, so active long-running attempts are distinct from silent, likely stuck processes:

```bash
./evaluate_agent.py --model <model-key> --agent pi-wiggum --prompt-file elevator_prompt_wiggum.txt
```

Runs are saved under `evals/pi-wiggum_<model>_<prompt>/` with combined `CHAT_SESSION.TXT`, raw per-attempt `PI_WIGGUM_ATTEMPT_###.JSONL`, and aggregate metrics/status in `PI_WIGGUM_RESULT.JSON`.

---

## 4. Exploring Results

After running one or more experiments, generate the centralized dashboard to browse and compare results.

1.  **Generate Index**:
    ```bash
    ./generate_index.py
    ```
    To add browser-runtime verification before generating the dashboard, install
    the Node dependency once and run the checker before regenerating:
    ```bash
    npm install
    npx playwright install chromium
    npm run runtime-check
    ./generate_index.py
    ```
    The runtime checker first runs a dependency-free static JavaScript preflight
    for syntax, likely unresolved references, and duplicate top-level `let` /
    `const` / `class` declarations across classic scripts, then uses
    Playwright to load each artifact in Chromium. It writes `runtime_check.json` into each
    evaluated run directory. Running it with no arguments (or `-h`/`--help`)
    prints usage instead of checking everything — pass `--all` explicitly to
    process every run. To verify only one run, pass its directory name (a bare
    run name resolves under `evals/` automatically, or you can give a full
    path):
    ```bash
    npm install
    npx playwright install chromium
    node runtime_check.js <run-directory>
    # equivalent: node runtime_check.js evals/<run-directory>
    ./generate_index.py
    ```
    For a faster static-only pass that catches common `ReferenceError` failures
    such as undeclared animation-loop variables or duplicate global constants:
    ```bash
    npm run static-check
    node static_check.js evals/<run-directory>
    ```
    `npm install` and `npx playwright install chromium` are one-time setup
    steps on a machine. After that, rerun only `node runtime_check.js ...` and
    `./generate_index.py` when new evals arrive.
2.  **View Dashboard**: Open the generated `index.html` in your favorite browser, or visit the **[live dashboard on GitHub Pages](https://jeffgrover.github.io/llm-eval/)**.
    ```bash
    open index.html
    ```

The dashboard starts with reference previews and then provides three tabs:

-   **Elevator Prompt Scores**: deterministic scores and comparisons for elevator prompt runs.
-   **Office Prompt Scores**: deterministic scores and comparisons for office prompt runs.
-   **By Agent**: the catalog view grouped by agent, with provider, prompt, score, and report links.

The scoring is intentionally deterministic. It does not claim to be a full qualitative judge; it rewards reproducible signals, with functional browser behavior weighted most heavily:

-   runtime verification for no startup errors, a visible nonblank canvas, animation frames, scene complexity, and visible changes over time
-   hard caps that prevent browser-dead, blank, missing-file, or unverified runs from ranking as excellent
-   required files and expected script structure
-   prompt-specific implementation cues
-   run completion and machine-readable result metrics
-   token/turn efficiency, intentionally weighted lower than functionality

Click **View Report** on any card to see the full breakdown, including:
-   **Prompt Trace**: Exactly what was sent (including newlines).
-   **Token Metrics**: Input/Output tokens and TPS (Tokens Per Second), labeled when a runner only exposes estimates.
-   **Software Env**: Versions of LMS, CLI, and Hardware specs.
-   **Artifact Viewer**: Side-by-side view of generated code, server logs (`SERVER.LOG`), and execution results (`OUTPUT.TXT`).

---

## Technical Details

-   **Report Isolation**: Reports embed textual and small HTML artifacts with base64 encoding and inline local JavaScript for `file://` previews. Images and oversized artifacts remain beside `summary.html`.
-   **Naming Convention**: Directories are segmented as `evals/{agent}_{model}_{prompt}` for easy searching.
-   **Dashboard Regeneration**: `generate_index.py` is dependency-free and writes the static `index.html` home page.

## Architecture

The evaluator is split by responsibility:

-   `evaluate_agent.py` parses CLI options, selects a runner, and starts the evaluation.
-   `evaluation_core.py` owns the shared run lifecycle, workspace handling, metadata collection, LM Studio integration, and immutable local-provider configuration.
-   `evaluation_metrics.py` normalizes token, cost, cache, and turn metrics from runner result files and fallback logs.
-   `evaluation_report.py` renders the self-contained `summary.html` report and artifact navigation.
-   `run_safety.py` owns configurable hard limits and vendor-neutral repeating tool-cycle detection.
-   `runner_events.py` normalizes vendor-specific JSON/JSONL events into runner-level text, usage, provider, model, and error fields, including Crush session exports and Qoder's explicit estimated-usage fallback.
-   `runners/` contains one CLI adapter per agent. Each adapter owns only its command/configuration and vendor-specific execution flow.
-   `tests/fixtures/runner_events/` contains representative CLI event streams used by parser contract tests.

Local provider selection produces a frozen configuration object that is passed
to each runner; selecting oMLX or llama-server no longer mutates process-wide
provider globals. Temporary configuration changes are scoped to agent execution
so Pi cleanup and requested Vibe restoration also happen on failure.

OpenCode local-provider configuration discovers model IDs from `/v1/models`,
disables concurrent title generation, and records consistent context/output
limits. LM Studio load settings are sent through `/api/v1/models/load`; explicit
settings cause a reload and request `echo_load_config` for diagnostic output.

## Development and Tests

The Python implementation uses only the standard library. Run the unit and
event-contract suite with:

```bash
python3 -m unittest discover -s tests -v
python3 -m py_compile evaluate_agent.py evaluation_core.py \
  evaluation_metrics.py evaluation_report.py runner_events.py runners/*.py
```

When an agent changes its JSON event schema, update its fixture under
`tests/fixtures/runner_events/` and the corresponding normalization function in
`runner_events.py` together. This keeps schema changes reviewable without
requiring the external CLI during tests.

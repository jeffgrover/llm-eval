# Sibling-Peek / Reference-Lookup Cheating Audit

**Date:** 2026-08-22
**Scope:** all directories under `evals/`, including the Intel-machine wiggum
control run `pi-wiggum_qwen3_8-27b_office_prompt_wiggum` (tracked in the repo)
**Method:** three-stage scan of every run transcript (`CHAT_SESSION.TXT`,
`*_EVENTS.JSONL`, `PI_WIGGUM_ATTEMPT_*.JSONL`):

1. `scan_cheating.py` — broad mention scan (`reference/...` paths, foreign eval dir names).
2. `scan_cheating2.py` — classify mentions as file ACCESS vs mere LISTing.
3. `scan_cheating3.py` / `scan_cheating4.py` / `scan_cheating5.py` — strict
   verification: extract actual tool-call arguments (`command`, `path`,
   `filePath`) and keep only those targeting foreign paths, excluding each
   run's own directory.

A run counts as **tainted** only when a verified tool call read or listed
content under `reference/` or another run's `evals/<dir>/`. Reading the
checkers (`static_check.js`, `runtime_check.js`) is NOT cheating — prompts
direct agents to satisfy them.

## Script usage

All five scripts live in `scripts/`, use only the Python stdlib, are
repo-root-anchored (runnable from any CWD, e.g. `python scripts/scan_cheating.py`),
and are read-only: they never modify transcripts or eval artifacts.

- `scripts/scan_cheating.py` — Stage 1, broad triage. Walks every `evals/<run>/`
  directory and greps its transcripts (`*.TXT`, `*.JSONL`) for `reference/`
  paths and for names of *other* eval directories. Prints `CLEAN` or a hit
  count with sample fragments per run. Takes no arguments; edit `ROOT` or
  `TRANSCRIPT_SUFFIXES` at the top to change scope. High false-positive rate
  (own-dir paths, `ls` output, prose) — use it only to build a suspect list.
- `scripts/scan_cheating2.py` — Stage 2, classification. For each suspect line,
  classifies the mention as `ACCESS` (a read-like verb appears in a ±1 line
  window, per `ACCESS_RE`) or `LIST` (mere directory listing). Edit the
  `ACCESS_RE` pattern to tune.
- `scripts/scan_cheating3.py` — Stage 3a, targeted command dump. For each entry in
  `TARGETS` (a list of `(transcript_path, kind)` pairs; `kind="jsonl"` for
  Qoder/Pi event streams with `type=="assistant"` messages, `kind="tool_use"`
  for opencode `CHAT_SESSION.TXT` lines), prints every tool-call input whose
  arguments mention `reference/` or `evals/`.
- `scripts/scan_cheating4.py` — Stage 3b, strict foreign-read check for Qoder runs.
  `TARGETS` maps transcript path → the run's own directory name; tool inputs
  are masked with `<OWN>` and only genuinely foreign paths are reported.
- `scripts/scan_cheating5.py` — Stage 3c, strict tool-call-path extraction for
  Pi/opencode JSON lines. `TARGETS` maps run directory name → transcript
  file names; extracts `command`/`path`/`filePath` arguments, JSON-unescapes
  them, and reports any that target `reference/` or a foreign `evals/<dir>/`.

Recommended workflow: run stage 1, triage with stage 2, then confirm every
suspect with the matching stage-3 script before labeling a run tainted.
To audit a new run, add its transcripts to the relevant `TARGETS` constant.

## Prompt clause status

- `office_prompt_v3.md` (lines 8–10) and `elevator_prompt_v3.txt` (lines 4–6)
  contain the explicit prohibition: *"There are previously implemented
  solutions in other nearby directories, do not 'cheat' by looking at the
  other implementations... come up with your own original"* implementation.
- `office_prompt_wiggum.md` and `elevator_prompt_wiggum.txt` contain **no
  anti-cheat clause** (verified by grep). Wiggum runs are therefore listed
  separately below: same behavior, no clause to violate.

## Verdicts

### SEVERE — explicit clause violated

| Run | Evidence |
|---|---|
| `opencode_moonshotai_kimi-k3_office_prompt_v3` | `ls ../../evals/`, `ls ../../reference/office/ && ls ../../reference/elevator/`, `wc -l ../../reference/office/*.js`, then **full reads of all 7 `reference/office/` files** (`person.js`, `index.html`, `world.js`, `elevator_logic.js`, `elevator.js`, `elevator_logic_test.js`, `sim.js`), plus reads of two sibling runs' `runtime_check.json` (`claude_Sonnet_office_prompt_v3`, `codex_gpt-5_6-luna_office_prompt_v3`). Its dashboard result is INVALID. |

### MINOR — directory browsing only, no content read (clause violated in letter)

| Run | Evidence |
|---|---|
| `opencode_nemotron-3_5-lightning_elevator_prompt_v3` | `ls -la reference/elevator`, `ls -la reference/office` |
| `pi_deepreinforce-ai_ornith-1_0-35b_elevator_prompt_v3` | `ls -la ../../evals/ \| head -20` |

### WIGGUM runs — peeking occurred, but prompt has no clause

| Run | Evidence |
|---|---|
| `pi-wiggum_qwen3_8-27b_office_prompt_wiggum` (Intel control) | **Worse than peeking — plagiarism**: `cp reference/office/person.js` and `cp reference/office/elevator_logic.js` directly into its own eval dir, full reads of all 7 `reference/office/` files, ran the reference's `elevator_logic_test.js` in place, diffed `reference/office/` against sibling eval dirs, read sibling `sim.js` and `runtime_check.json` before building. |
| `pi-wiggum_qwen3_8-27b-think_office_prompt_wiggum` (added in addendum) | `cp` of `reference/office/elevator_logic.js`, `elevator_logic_test.js`, and `elevator.js` into its own eval dir; reads of reference `sim.js` and `elevator.js`. |
| `pi-wiggum_qwen3_6-35b-a3b_elevator_prompt_wiggum` | Tool call targeting `reference/elevator_prompt_wiggum/index.html` (path malformed; intent to read reference). |

### LIVE run at time of audit

`pi-wiggum_qwen3_8-27b_office_prompt_wiggum` (re-run on the AMD Strix Halo
machine, 2026-08-22): clean by strict tool-path scan at audit time; all
foreign-name mentions are `ls` output. The model stated intent to "peek at a
completed sibling for reference patterns", so re-scan after completion with:
`python scripts/scan_cheating5.py` (after adding its attempt files to TARGETS).

### EXONERATED (no verified foreign access)

`agy_gemini-3_6-flash-high_office_prompt_v3`, `agy_gemini-3_7-flash_office_prompt_v3`,
`claude_Fable_5_office_prompt_v3`, `claude_Opus_4_8_elevator_prompt_v2`,
`claude_Opus_5_office_prompt_v3`, `claude_Sonnet_office_prompt_v3`,
`codex_gpt-5_5_office_prompt_v2`, `codex_gpt-5_6-luna_office_prompt_v3`,
`codex_gpt-5_6-sol_office_prompt_v3`, `codex_gpt-5_6-terra_office_prompt_v3`,
`crush_unsloth_gemma-4-26b-a4b-it_elevator_prompt_v3`,
`gemini_gemini-3_1-pro-preview_elevator_prompt_v2`,
`opencode_agents-a1_elevator_prompt_v3`, `opencode_gemma-4-31b-qat_office_prompt_v3`,
`opencode_google_gemma-4-26b-a4b-qat_elevator_prompt_v3`,
`opencode_Kimi_K2_7_Code_office_prompt_v2`, `opencode_muse-spark-1_2_elevator_prompt_v3`,
`opencode_qwen3_8-27b_elevator_prompt_v3`, `opencode_qwen3_8-27b_office_prompt_v3`,
`opencode_upstage_solar-pro4_elevator_prompt_v3`, `opencode_x-ai_grok-4_6_office_prompt_v3`,
`opencode_zai-org_glm-4_7-flash_elevator_prompt_v3`,
`pi-wiggum_Agents-A1-MTPLX-Q4_office_prompt_wiggum`,
`pi-wiggum_agents-a1_elevator_prompt_v3`, `pi-wiggum_agents-a1_elevator_prompt_wiggum`,
`pi-wiggum_agents-a1_office_prompt_wiggum`, `pi-wiggum_gemma-4-e4b_elevator_prompt_wiggum`,
`pi-wiggum_muse-glimmer-30b_elevator_prompt_wiggum`,
`pi_coder-next_elevator_prompt_v3`, `pi_nemotron-3-nano-omni_elevator_prompt_v3`,
`pi_qwen3_6-35b-a3b_elevator_prompt_v3`,
`qoder_Cantus_office_prompt_v3`, `qoder_DeepSeek-V4-Flash_office_prompt_v3`,
`qoder_DeepSeek-V4-Pro_office_prompt_v3`, `qoder_GLM-5_2_office_prompt_v3`,
`qoder_MiniMax-M3_office_prompt_v3`, `qoder_Qwen3_8-Max-Preview_elevator_prompt_v3`,
`qoder_Qwen3_8-Max-Preview_office_prompt_v3`, `qoder_Qwen3_8-Max_elevator_prompt_v3`,
`qoder_Qwen3_8-Max_office_prompt_v3`, `vibe_mistral-medium-3_5_elevator_prompt_v2`

## False-positive notes

- `tmp_fixtest_office` is a harness-side debug copy made by the evaluator, not
  an agent run; its foreign-path mentions are from the evaluator's own work.
- Several broad-scan hits were own-directory paths (`dir_path` fields), `ls`
  output text, or prose inside final summaries — excluded by strict stages.
- `qoder_MiniMax-M3_office_prompt_v3\QODER_EVENTS.JSONL` was suspected of
  containing a foreign `qoder_Qwen3_8-Max` session; direct grep shows 0
  foreign mentions — an output-display artifact, not contamination.

## Recommendations

1. Flag/exclude `opencode_moonshotai_kimi-k3_office_prompt_v3` from dashboard
   scoring; annotate the two MINOR cases.
2. Add the v3 anti-cheat clause to both wiggum prompts for parity.
3. Structurally: run agents in a sealed workspace without `evals/` and
   `reference/` visibility, or make this scan a post-run gate in the harness.
4. Re-scan the live wiggum run after completion.

## Addendum 2026-08-22 (post-merge pull of further Intel-machine runs)

After merging this audit, `git pull` brought in additional Intel-machine runs.
Re-scanning with the repo-root-anchored `scripts/scan_cheating5.py` found:

- **Escalated**: the `pi-wiggum_qwen3_8-27b_office_prompt_wiggum` Intel control
  did not merely read the reference implementation — its full JSONL shows
  `cp` commands copying reference files into its own eval dir (see WIGGUM
  table). Any dashboard score it contributed is invalid.
- **New SEVERE case**: `pi-wiggum_qwen3_8-27b-think_office_prompt_wiggum`
  copied `elevator_logic.js`, `elevator_logic_test.js`, and `elevator.js`
  from `reference/office/` into its own eval dir and read the rest.
- **New exonerated runs**: `pi-wiggum_qwen3_8-27b_elevator_prompt_wiggum`,
  `pi_qwen3_8-27b_office_prompt_v3`, `pi_qwen3_8-27b-think_office_prompt_v3`,
  `opencode_qwen3_8-27b-think_office_prompt_v3` — no foreign tool-call paths.
- The local AMD Strix Halo re-run of `pi-wiggum_qwen3_8-27b_office_prompt_wiggum`
  (2026-08-22) was abandoned mid-attempt-2 due to a doom loop and its
  directory deleted; its transcripts confirmed no foreign access before deletion.

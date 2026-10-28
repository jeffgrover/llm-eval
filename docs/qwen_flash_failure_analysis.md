# Qwen Flash office run investigation

Investigated October 10, 2026; updated October 27 after the thinking-off rerun
and reconciliation with current main. The regular Flash evidence is retained.
The Swift directory was overwritten by the user's rerun; the original Swift
figures below are observations recorded during the investigation, not results
that can still be reconstructed from that directory.

| Run | Outcome | Output tokens | Reasoning tokens (included in output) |
| --- | --- | ---: | ---: |
| `pi_qwen3_8-flash-next-gsq-rco_office_prompt_v3` | 17 turns; about 3h 45m; five JavaScript files; no `index.html` or `sim.js` | 63,635 | 39,042 |
| `pi_swift-1_5-qwen3_8-flash-next-gsq-rco-abliterated_office_prompt_v3` | One response lasting 6,097 seconds; no app files; `stopReason=length` | 32,768 | 32,768 |

The original investigation read each run's `PI_EVENTS.JSONL`, `SERVER.LOG`,
`PI_RESULT.JSON`, and directory contents. Swift repeatedly revisits the same room geometry in
its reasoning. The regular model spends 3,727 seconds on the response preceding
its first write, including 18,323 reasoning tokens. Its final response ends with
`stopReason=stop`, 7,187 reasoning tokens and 23 visible output tokens: it says
it will write `sim.js`, then stops without a tool call. It does **not** hit the
32,768 output limit on that response. A subsequent server request is Pi context
summarization, not a simulation write.

Both decode at approximately 4.7–5.4 tokens/second in the captured server logs.
Long reasoning therefore costs tens of minutes per response. Neither failed
because the evaluator denied a write or because a browser could not load a
completed app: neither created the required entry point.

## Earlier reasoning fix

Commit `985d8a2` already marked Pi custom models as reasoning-capable, enabled
`supportsReasoningEffort` at the model level, and added `--thinking-level`.
Both failed runs actually sent `reasoning_effort: "medium"`. The provider-level
`supportsReasoningEffort: false` is overridden by the model-level `true`; the
captured requests confirm the override worked.

`docs/b70-agentic-tuning-report.html` and `docs/qwen38_lms_defaults_tuned.json`
document a separate **27B** model profile with an 8,192-token server reasoning
ceiling. The JSON is an investigation artifact, not configuration applied by
the runner. The Flash trace's 18,323-token reasoning response proves that ceiling
was not enforced in the regular run. Forwarding an effort setting does not
establish a hard token ceiling.

The older report explicitly warns that `none` did not work for its 27B model.
That finding should not be generalized to Flash or replaced by the new result.
The current loaded Swift model reports reasoning options `off`/`on`; its
configuration and quantization differ from the older 27B profile.

## Fixes and verification

- For Qwen3.8 **Flash** models on LM Studio, configure Pi's
  `thinkingLevelMap.off = "none"`. Pi otherwise omits the effort parameter for
  `--thinking-level off`, leaving the server's default thinking enabled.
  Other model families and endpoints retain their existing configuration.
- Preserve reasoning-token counts, final stop reason, and provider errors.
  A final `length`, `error`, or `aborted` response is a failure even when Pi
  exits with code zero. Only the final response determines this classification,
  allowing a subsequent successful response to recover an earlier error.
- For `office_prompt_v3`, mark missing or empty required files as a failed
  evaluation. File presence is a minimum contract, not browser validation.

Direct bounded probes against loaded Swift:

- `chat_template_kwargs.enable_thinking=false`: still generated 13 reasoning
  tokens on a trivial READY request.
- `reasoning_effort="none"`: generated READY with zero reasoning tokens.

An isolated Pi smoke test using the patched configuration and
`--thinking off` wrote the exact requested HTML file and returned DONE across
two turns, using 55 output tokens and **zero** reasoning tokens. Results are
saved in `docs/qwen_flash_smoke.json`. Temporary Pi settings were removed;
global settings and benchmark artifacts were not replaced. This verifies the
configuration and tool-write path, not the full office simulation or the
unloaded regular Flash model. Its saved `finish_reason` field is the historical
smoke-test format; current runner results expose `finish_reasons` for the shared
report and dashboard readers. Pi Wiggum also aggregates reasoning counts across
attempts. Main already includes provider error/retry handling from PR #43; these
changes retain that behavior and add output-limit and missing-artifact checks.

## Thinking-off rerun

The Swift rerun sent `reasoning_effort="none"` and recorded zero reasoning
tokens, confirming the switch works on the real office prompt. It nevertheless
completed 93 turns without writing any application files. It repeatedly inspected
its own logs, Pi sessions, and repository checkers, and the existing safety monitor
stopped it with `terminal_reason="doom_loop"`. The result records 3,527,703 input
tokens and 7,049 output tokens. The retained Swift directory contains this rerun.

The control fix did not fix task completion. The regular Flash's historical
`PI_RESULT.JSON` still says success because it predates the missing-artifact
check; its absent `index.html` and `sim.js` show why that label was incorrect.
Historical logs and reports have not been rewritten to imply a new evaluation.

## Next evaluation

To explicitly disable thinking on Swift, use `--thinking-level off` and an explicit
time limit. This is a verified control, not a recommendation that off improves
coding quality. The existing
`pi-wiggum` runner can run static/browser checkers and request repairs; it uses
a separate evaluation directory from the original Pi run:

```powershell
python3 evaluate_agent.py --agent pi-wiggum --model swift-1.5-qwen3.8-flash-next-gsq-rco-abliterated --prompt-file office_prompt_wiggum.md --thinking-level off --max-seconds 3600
```

This is a different, iterative evaluation protocol. A successful full run is
still needed before claiming the model can complete the simulation. The same
off mapping is configured for regular Flash, but its runtime behavior needs
verification when that model is loaded. Reducing the output cap alone cannot
fix a model that spends its entire response on reasoning.

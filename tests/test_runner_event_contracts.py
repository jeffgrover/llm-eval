import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from runner_events import (
    QoderUsageEstimator,
    codex_usage_from_obj,
    extract_codex_readable_event,
    extract_codex_session_id,
    find_codex_usage_objects,
    normalize_qoder_result,
    normalize_crush_session,
    parse_claude_event,
    parse_gemini_transcript,
    parse_opencode_event,
    parse_pi_event,
    parse_qoder_event,
    parse_vibe_event,
)
from runners import CrushRunner


FIXTURE_DIR = Path(__file__).parent / "fixtures" / "runner_events"


def read_jsonl(name):
    return [
        json.loads(line)
        for line in (FIXTURE_DIR / name).read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


class RunnerEventContractTests(unittest.TestCase):
    def test_gemini_transcript_contract(self):
        stats = parse_gemini_transcript(read_jsonl("gemini_transcript.jsonl"))

        self.assertEqual(
            stats,
            {
                "input_tokens": 2,
                "output_tokens": 6,
                "total_tokens": 8,
                "cached": 0,
                "tool_calls": 1,
                "num_turns": 1,
            },
        )

    def test_claude_stream_contract(self):
        parsed = [
            parse_claude_event(event)
            for event in read_jsonl("claude_stream.jsonl")
        ]

        self.assertEqual(parsed[1].text, "Working\n[Tool: Write] index.html\n")
        self.assertEqual(parsed[2].text, "\nComplete\n")
        self.assertEqual(parsed[2].result["usage"]["input_tokens"], 10)

    def test_qoder_stream_contract_and_estimated_usage(self):
        events = read_jsonl("qoder_stream.jsonl")
        estimator = QoderUsageEstimator.from_prompt("Build it")
        parsed = []
        for event in events:
            estimator.observe(event)
            parsed.append(parse_qoder_event(event))

        result = normalize_qoder_result(
            parsed[-1].result,
            estimator.result(),
            events[0]["qodercli_version"],
        )

        self.assertEqual(parsed[1].text, "abcd")
        self.assertEqual(parsed[3].text, "complete")
        self.assertEqual(result["input_tokens"], 6)
        self.assertEqual(result["output_tokens"], 3)
        self.assertEqual(result["total_tokens"], 9)
        self.assertEqual(result["num_turns"], 2)
        self.assertTrue(result["token_counts_estimated"])
        self.assertFalse(result["cost_available"])
        self.assertEqual(result["qodercli_version"], "1.1.5")

    def test_qoder_prefers_real_usage_when_the_cli_provides_it(self):
        result = normalize_qoder_result(
            {
                "usage": {"input_tokens": 10, "output_tokens": 2},
                "total_cost_usd": 0.01,
            },
            {"input_tokens": 99, "output_tokens": 99, "total_tokens": 198},
        )

        self.assertNotIn("input_tokens", result)
        self.assertFalse(result["token_counts_estimated"])
        self.assertTrue(result["cost_available"])

    def test_vibe_stream_contract(self):
        parsed = [
            parse_vibe_event(event)
            for event in read_jsonl("vibe_stream.jsonl")
        ]

        self.assertEqual(parsed[0].text, "")
        self.assertTrue(parsed[0].log_raw)
        self.assertEqual(
            [event.text for event in parsed[1:]],
            ["First response", "Second response"],
        )
        self.assertEqual(sum(event.turn_completed for event in parsed), 2)

    def test_opencode_stream_contract(self):
        parsed = [
            parse_opencode_event(event)
            for event in read_jsonl("opencode_stream.jsonl")
        ]
        usage = parsed[2].usage

        self.assertEqual(parsed[0].text, "Working")
        self.assertEqual(parsed[1].text, "\n[Tool: write]\n")
        self.assertEqual(parsed[1].tool_calls, 1)
        self.assertEqual(usage["input_tokens"], 12)
        self.assertEqual(usage["cache_read_tokens"], 3)
        self.assertEqual(usage["cost_usd"], 0.02)
        self.assertEqual(parsed[2].finish_reason, "stop")
        self.assertEqual(parsed[3].error, "provider failed")

    def test_pi_stream_contract(self):
        parsed = [
            parse_pi_event(event)
            for event in read_jsonl("pi_stream.jsonl")
        ]
        completed = parsed[2]

        self.assertEqual(parsed[0].text, "Working")
        self.assertEqual(parsed[1].text, "\n[Tool: write]\n")
        self.assertTrue(completed.turn_completed)
        self.assertEqual(completed.provider_id, "test-provider")
        self.assertEqual(completed.model_id, "test-model")
        self.assertEqual(completed.usage["input_tokens"], 20)
        self.assertEqual(completed.usage["cost_usd"], 0.03)
        self.assertTrue(parsed[3].log_raw)

    def test_codex_stream_contract(self):
        events = read_jsonl("codex_stream.jsonl")

        self.assertEqual(extract_codex_session_id(events[0]), "thread-test")
        self.assertEqual(extract_codex_readable_event(events[1]), "Working")
        usage_objects = find_codex_usage_objects(events[2])
        usage = codex_usage_from_obj(usage_objects[0])
        self.assertEqual(
            usage,
            {
                "input_tokens": 30,
                "output_tokens": 9,
                "total_tokens": 39,
                "reasoning_tokens": 3,
                "cache_read_tokens": 5,
            },
        )

    def test_crush_command_contract(self):
        fixture = json.loads(
            (FIXTURE_DIR / "crush_command.json").read_text(encoding="utf-8")
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            prompt_path = Path(temp_dir) / "prompt.txt"
            prompt_path.write_text("build it", encoding="utf-8")
            runner = CrushRunner(
                "crush",
                "test-model",
                prompt_path,
                headless=True,
                non_local=True,
            )
            runner.work_dir = Path(temp_dir)

            with (
                mock.patch.object(runner, "_run_process", return_value=0) as run_process,
                mock.patch.object(runner, "_read_last_session", return_value={}),
                mock.patch.object(runner, "_crush_version", return_value="v0.87.0"),
            ):
                runner.execute_agent()

            call = run_process.call_args
            argv = call.args[0]
            self.assertEqual(argv[0], runner.agent_binary)
            self.assertEqual(argv[1:5], fixture["argv_tail_prefix"])
            self.assertEqual(argv[5], "--data-dir")
            self.assertTrue(argv[6])
            self.assertEqual(call.kwargs["input_text"], "build it")
            self.assertEqual(
                call.kwargs["display_cmd"],
                "crush run --quiet --model test-model "
                "--data-dir <isolated> < prompt",
            )

    def test_crush_session_contract(self):
        session = json.loads(
            (FIXTURE_DIR / "crush_session.json").read_text(encoding="utf-8")
        )

        result = normalize_crush_session(
            session, process_returncode=0, crush_version="v0.87.0"
        )

        self.assertEqual(result["input_tokens"], 120)
        self.assertEqual(result["output_tokens"], 30)
        self.assertEqual(result["total_tokens"], 150)
        self.assertEqual(result["cost_usd"], 0.0125)
        self.assertEqual(result["num_turns"], 2)
        self.assertEqual(result["tool_calls"], 1)
        self.assertEqual(result["finish_reasons"], ["tool_use", "stop"])
        self.assertEqual(result["provider_id"], "lmstudio")
        self.assertEqual(result["model_id"], "test-model")
        self.assertFalse(result["is_error"])


if __name__ == "__main__":
    unittest.main()

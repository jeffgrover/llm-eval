import json
import unittest
from pathlib import Path

from run_safety import (
    DoomLoopDetector,
    RunSafetyLimits,
    RunSafetyMonitor,
    normalize_tool_observation,
)
from runner_events import extract_opencode_tool_call


FIXTURE_PATH = (
    Path(__file__).parent
    / "fixtures"
    / "doom_loops"
    / "opencode_solar_cycle.jsonl"
)


class RunSafetyTests(unittest.TestCase):
    def test_file_signature_ignores_edit_contents(self):
        first = normalize_tool_observation(
            "edit",
            {"filePath": "/tmp/eval/elevator.js", "newString": "first"},
        )
        second = normalize_tool_observation(
            "edit",
            {"filePath": "/tmp/eval/elevator.js", "newString": "second"},
        )

        self.assertEqual(first.signature, second.signature)
        self.assertNotIn("first", first.signature)

    def test_solar_read_edit_cycle_triggers_after_twelve_repetitions(self):
        events = [
            json.loads(line)
            for line in FIXTURE_PATH.read_text(encoding="utf-8").splitlines()
        ]
        monitor = RunSafetyMonitor(RunSafetyLimits(), Path("/tmp/eval"))
        termination = None

        for event in events * 12:
            tool_call = extract_opencode_tool_call(event)
            self.assertIsNotNone(tool_call)
            termination = monitor.observe_tool(*tool_call)

        self.assertIsNotNone(termination)
        self.assertEqual(termination.reason, "doom_loop")
        self.assertEqual(termination.evidence["cycle_length"], 2)
        self.assertEqual(termination.evidence["repetitions"], 12)
        self.assertEqual(termination.evidence["consecutive_tool_calls"], 24)

    def test_cycle_does_not_trigger_when_targets_keep_changing(self):
        detector = DoomLoopDetector(RunSafetyLimits())

        for index in range(60):
            observation = normalize_tool_observation(
                "edit", {"filePath": f"/tmp/eval/file-{index}.js"}
            )
            self.assertIsNone(detector.observe(observation))

    def test_turn_token_and_cost_limits_are_structured(self):
        cases = (
            (
                RunSafetyLimits(max_turns=2, max_total_tokens=0, max_cost_usd=0),
                {"input_tokens": 1},
                "turn_limit",
                2,
            ),
            (
                RunSafetyLimits(max_turns=0, max_total_tokens=10, max_cost_usd=0),
                {"input_tokens": 6, "output_tokens": 4},
                "token_limit",
                1,
            ),
            (
                RunSafetyLimits(max_turns=0, max_total_tokens=0, max_cost_usd=0.5),
                {"cost_usd": 0.5},
                "cost_limit",
                1,
            ),
        )

        for limits, usage, reason, observations in cases:
            with self.subTest(reason=reason):
                monitor = RunSafetyMonitor(limits)
                termination = None
                for _ in range(observations):
                    termination = monitor.observe_turn(usage)
                self.assertIsNotNone(termination)
                self.assertEqual(termination.reason, reason)


if __name__ == "__main__":
    unittest.main()

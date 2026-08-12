"""Runaway-agent safeguards and repeating tool-cycle detection."""

import hashlib
import json
import math
import re
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional


DEFAULT_MAX_SECONDS = 3600.0
DEFAULT_MAX_IDLE_SECONDS = 900.0
DEFAULT_MAX_TURNS = 200
DEFAULT_MAX_TOTAL_TOKENS = 5_000_000
DEFAULT_MAX_COST_USD = 10.0
DEFAULT_DOOM_LOOP_REPEATS = 12
DEFAULT_DOOM_LOOP_MAX_CYCLE_LENGTH = 4
DEFAULT_DOOM_LOOP_MIN_CALLS = 24


@dataclass(frozen=True)
class RunSafetyLimits:
    """Configurable hard limits and repeating-cycle thresholds for one run."""

    max_seconds: float = DEFAULT_MAX_SECONDS
    max_idle_seconds: float = DEFAULT_MAX_IDLE_SECONDS
    max_turns: int = DEFAULT_MAX_TURNS
    max_total_tokens: int = DEFAULT_MAX_TOTAL_TOKENS
    max_cost_usd: float = DEFAULT_MAX_COST_USD
    doom_loop_repeats: int = DEFAULT_DOOM_LOOP_REPEATS
    doom_loop_max_cycle_length: int = DEFAULT_DOOM_LOOP_MAX_CYCLE_LENGTH
    doom_loop_min_calls: int = DEFAULT_DOOM_LOOP_MIN_CALLS

    @property
    def process_timeout(self) -> Optional[float]:
        """Return the subprocess timeout, or ``None`` when disabled."""
        return self.max_seconds if self.max_seconds > 0 else None

    @property
    def process_idle_timeout(self) -> Optional[float]:
        """Return the output-inactivity timeout, or ``None`` when disabled."""
        return self.max_idle_seconds if self.max_idle_seconds > 0 else None


@dataclass(frozen=True)
class RunTermination:
    """A structured reason for stopping an agent before normal completion."""

    reason: str
    message: str
    evidence: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "reason": self.reason,
            "message": self.message,
            "evidence": dict(self.evidence),
        }


class RunSafetyTermination(Exception):
    """Control signal raised by a stream callback to stop its subprocess."""

    def __init__(self, termination: RunTermination):
        super().__init__(termination.message)
        self.termination = termination


@dataclass(frozen=True)
class ToolObservation:
    """The stable, vendor-neutral identity of one completed tool call."""

    name: str
    target: str

    @property
    def signature(self) -> str:
        return f"{self.name}:{self.target}"


def _display_path(value: str, work_dir: Optional[Path]) -> str:
    if not value:
        return "unknown"
    path = Path(value)
    if work_dir and path.is_absolute():
        try:
            return str(path.relative_to(work_dir.resolve()))
        except ValueError:
            pass
    return str(path)


def normalize_tool_observation(
    name: str,
    tool_input: Any,
    work_dir: Optional[Path] = None,
) -> ToolObservation:
    """Build a compact signature that ignores changing file contents."""
    normalized_name = str(name or "unknown").strip().lower()
    args = tool_input if isinstance(tool_input, dict) else {}

    target = ""
    for key in ("filePath", "file_path", "path", "filepath"):
        value = args.get(key)
        if isinstance(value, str) and value:
            target = _display_path(value, work_dir)
            break

    if not target:
        command = args.get("command") or args.get("cmd")
        if isinstance(command, str) and command:
            compact = re.sub(r"\s+", " ", command).strip()
            target = compact[:160]

    if not target and args:
        encoded = json.dumps(
            args,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        )
        digest = hashlib.sha256(encoded.encode("utf-8")).hexdigest()[:12]
        target = f"input-{digest}"

    return ToolObservation(normalized_name, target or "unknown")


class DoomLoopDetector:
    """Detect a short tool-call cycle repeated at the tail of a rolling window."""

    def __init__(self, limits: RunSafetyLimits):
        self.limits = limits
        window_size = max(
            limits.doom_loop_min_calls,
            limits.doom_loop_repeats * limits.doom_loop_max_cycle_length,
            1,
        )
        self.history: Deque[ToolObservation] = deque(maxlen=window_size)

    def observe(self, observation: ToolObservation) -> Optional[RunTermination]:
        self.history.append(observation)
        signatures = [item.signature for item in self.history]
        max_period = min(
            max(self.limits.doom_loop_max_cycle_length, 0),
            len(signatures),
        )
        if max_period == 0 or self.limits.doom_loop_repeats <= 0:
            return None

        for period in range(1, max_period + 1):
            repeats = max(
                self.limits.doom_loop_repeats,
                math.ceil(max(self.limits.doom_loop_min_calls, 1) / period),
            )
            observed_calls = period * repeats
            if len(signatures) < observed_calls:
                continue
            cycle = signatures[-period:]
            if signatures[-observed_calls:] != cycle * repeats:
                continue

            cycle_text = " → ".join(cycle)
            return RunTermination(
                reason="doom_loop",
                message=(
                    "Suspected doom loop: "
                    f"{cycle_text} repeated {repeats} times "
                    f"across {observed_calls} consecutive tool calls."
                ),
                evidence={
                    "detector": "repeating_tool_cycle",
                    "cycle": cycle,
                    "cycle_length": period,
                    "repetitions": repeats,
                    "consecutive_tool_calls": observed_calls,
                },
            )
        return None


class RunSafetyMonitor:
    """Combine repeating-cycle detection with turn, token, and cost ceilings."""

    def __init__(self, limits: RunSafetyLimits, work_dir: Optional[Path] = None):
        self.limits = limits
        self.work_dir = work_dir
        self.detector = DoomLoopDetector(limits)
        self.turns = 0
        self.total_tokens = 0
        self.cost_usd = 0.0
        self.termination: Optional[RunTermination] = None

    def observe_tool(
        self, name: str, tool_input: Any
    ) -> Optional[RunTermination]:
        if self.termination:
            return self.termination
        observation = normalize_tool_observation(name, tool_input, self.work_dir)
        self.termination = self.detector.observe(observation)
        return self.termination

    def observe_turn(self, usage: Dict[str, float]) -> Optional[RunTermination]:
        if self.termination:
            return self.termination
        self.turns += 1
        self.total_tokens += int(usage.get("input_tokens", 0) or 0)
        self.total_tokens += int(usage.get("output_tokens", 0) or 0)
        self.cost_usd += float(usage.get("cost_usd", 0) or 0)

        checks = (
            (
                self.limits.max_turns,
                self.turns,
                "turn_limit",
                "turns",
            ),
            (
                self.limits.max_total_tokens,
                self.total_tokens,
                "token_limit",
                "accumulated tokens",
            ),
            (
                self.limits.max_cost_usd,
                self.cost_usd,
                "cost_limit",
                "reported USD cost",
            ),
        )
        for limit, observed, reason, label in checks:
            if limit > 0 and observed >= limit:
                self.termination = RunTermination(
                    reason=reason,
                    message=f"Run stopped after reaching {observed:g} {label} (limit {limit:g}).",
                    evidence={"observed": observed, "limit": limit, "metric": label},
                )
                return self.termination
        return None

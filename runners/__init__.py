"""Agent-specific CLI adapters."""

from .claude import ClaudeRunner
from .codex import CodexRunner
from .crush import CrushRunner
from .gemini import GeminiRunner
from .opencode import OpenCodeRunner
from .pi import PiRunner
from .pi_wiggum import PiWiggumRunner
from .vibe import VibeRunner

__all__ = [
    "ClaudeRunner",
    "CodexRunner",
    "CrushRunner",
    "GeminiRunner",
    "OpenCodeRunner",
    "PiRunner",
    "PiWiggumRunner",
    "VibeRunner",
]

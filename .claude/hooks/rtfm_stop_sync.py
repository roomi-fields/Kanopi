#!/usr/bin/env python3
"""RTFM UserPromptSubmit/Stop hook — stub. Logic lives in rtfm.plugin.hook_runtime.

Do not edit: rewritten automatically when the installed rtfm-ai package
ships a newer version (rtfm.plugin.hooks.HOOK_STUB_VERSION=1).
"""
import os, sys
from pathlib import Path

PROJECT_ROOT = Path(os.environ.get("CLAUDE_PROJECT_DIR") or Path(__file__).resolve().parents[2])


try:
    from rtfm.plugin.hook_runtime import heartbeat
    heartbeat(PROJECT_ROOT)
except Exception:
    pass

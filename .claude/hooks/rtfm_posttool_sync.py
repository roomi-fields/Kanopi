#!/usr/bin/env python3
"""RTFM PostToolUse hook — enqueue the just-written file for ingestion.

Reads the edited file path from the hook payload (stdin JSON), maps it to a
configured source (corpus + root), and enqueues ONE P1 ingest job. The
worker does the actual parse/index. Non-destructive: only ever adds a job.
"""
import json, os, sys, time
from pathlib import Path

PROJECT_ROOT = Path(os.environ.get("CLAUDE_PROJECT_DIR") or Path(__file__).resolve().parents[2])


def _log(msg):
    try:
        ts = time.strftime("%H:%M:%S")
        with open(PROJECT_ROOT / ".rtfm" / "rtfm.log", "a") as f:
            f.write(f"[{ts}]       hook | {msg}\n")
    except Exception:
        pass


def _edited_path(payload):
    ti = payload.get("tool_input") or {}
    p = ti.get("file_path") or ti.get("path") or ti.get("notebook_path")
    if not p:
        return None
    try:
        return Path(p).resolve()
    except Exception:
        return None


def main():
    rtfm_dir = PROJECT_ROOT / ".rtfm"
    db_path = rtfm_dir / "library.db"
    if not db_path.exists():
        return

    try:
        payload = json.load(sys.stdin)
    except Exception:
        return
    fpath = _edited_path(payload)
    if not fpath or not fpath.is_file():
        return

    # Only enqueue files RTFM can actually parse.
    try:
        from rtfm.parsers.base import ParserRegistry
        import rtfm.parsers  # noqa: F401 — register all parsers
        if ParserRegistry.get_parser(fpath) is None:
            return
    except Exception:
        return

    cfg = {}
    cfg_path = rtfm_dir / "config.json"
    if cfg_path.exists():
        try:
            cfg = json.loads(cfg_path.read_text())
        except Exception:
            pass
    sources = cfg.get("sources") or [
        {"path": str(PROJECT_ROOT), "corpus": cfg.get("corpus", "default")}]

    # Pick the most specific (deepest-rooted) source that contains the file
    # and whose extension filter (if any) admits it.
    best = None  # (root, corpus, depth)
    for src in sources:
        try:
            root = Path(src.get("path", ".")).resolve()
        except Exception:
            continue
        try:
            fpath.relative_to(root)
        except ValueError:
            continue
        exts = src.get("extensions")
        if exts:
            allowed = {e.strip().lower() if e.strip().startswith(".")
                       else f".{e.strip().lower()}" for e in exts.split(",")}
            if fpath.suffix.lower() not in allowed:
                continue
        depth = len(root.parts)
        if best is None or depth > best[2]:
            best = (root, src.get("corpus", cfg.get("corpus", "default")), depth)

    if best is None:
        return
    root, corpus, _ = best
    rel = str(fpath.relative_to(root))

    try:
        from rtfm.core.queue import Queue
        from rtfm.cli_worker import ensure_worker_running
        q = Queue(str(db_path))
        try:
            q.enqueue("ingest", {"root": str(root), "corpus": corpus,
                                 "filepath": rel})
        finally:
            q.close()
        ensure_worker_running(rtfm_dir)
        _log(f"enqueued ingest [{corpus}] {rel}")
    except Exception as e:
        _log(f"enqueue ERROR: {e}")


if __name__ == "__main__":
    main()

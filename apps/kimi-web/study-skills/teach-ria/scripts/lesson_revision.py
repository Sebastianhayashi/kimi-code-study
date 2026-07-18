#!/usr/bin/env python3
"""Guard and atomically publish one Kimi Study lesson revision."""

from __future__ import annotations

import argparse
import html
import os
import re
import sys
from pathlib import Path

from lesson_quality import inspect_lesson_html, validate_lesson_html


LESSON_PATH = re.compile(r"lessons/[A-Za-z0-9][A-Za-z0-9._-]*\.html")
DRAFT_PATH = re.compile(r"\.study-drafts/[A-Za-z0-9][A-Za-z0-9._-]*\.html")
REVISION = re.compile(r"fnv1a32:[0-9a-f]{8}")


def lesson_revision(source: str) -> str:
    value = 0x811C9DC5
    for byte in source.encode("utf-8"):
        value ^= byte
        value = (value * 0x01000193) & 0xFFFFFFFF
    return f"fnv1a32:{value:08x}"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def visible_title(source: str) -> str:
    match = re.search(r"<title>(.*?)</title>", source, re.I | re.S)
    if match is None:
        match = re.search(r"<h1\b[^>]*>(.*?)</h1\s*>", source, re.I | re.S)
    if match is None:
        return ""
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", match.group(1)))).strip()


def workspace_path(workspace: Path, value: str, pattern: re.Pattern[str]) -> Path:
    workspace = workspace.resolve()
    if pattern.fullmatch(value) is None:
        raise ValueError(f"unsafe lesson revision path: {value}")
    resolved = (workspace / value).resolve()
    try:
        resolved.relative_to(workspace)
    except ValueError as error:
        raise ValueError(f"lesson revision path leaves workspace: {value}") from error
    return resolved


def assert_revision(target: Path, expected: str) -> str:
    if REVISION.fullmatch(expected) is None:
        raise ValueError("expected lesson revision is malformed")
    current = lesson_revision(read_text(target))
    if current != expected:
        raise ValueError(f"stale lesson revision: expected {expected}, found {current}")
    return current


def publish_candidate(workspace: Path, lesson: str, candidate: str, expected: str) -> str:
    target = workspace_path(workspace, lesson, LESSON_PATH)
    draft = workspace_path(workspace, candidate, DRAFT_PATH)
    if target.name != draft.name:
        raise ValueError("candidate filename must preserve lesson identity")
    assert_revision(target, expected)

    current_source = read_text(target)
    candidate_source = read_text(draft)
    errors = validate_lesson_html(candidate_source, lesson)
    if errors:
        raise ValueError(f"candidate lesson failed quality gates: {errors[0]}")
    if visible_title(candidate_source) != visible_title(current_source):
        raise ValueError("candidate lesson title must match the published lesson")

    current_anchors = set(inspect_lesson_html(current_source)["anchors"])
    candidate_anchors = set(inspect_lesson_html(candidate_source)["anchors"])
    if candidate_anchors != current_anchors:
        raise ValueError("candidate source anchors must exactly match the published lesson")

    # Re-check immediately before replace; another operation may have won
    # while the candidate was being validated.
    assert_revision(target, expected)
    with draft.open("rb") as handle:
        os.fsync(handle.fileno())
    os.replace(draft, target)
    directory = os.open(target.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    return lesson_revision(read_text(target))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=Path.cwd())
    parser.add_argument("--lesson", required=True)
    parser.add_argument("--expect")
    parser.add_argument("--candidate")
    args = parser.parse_args()
    workspace = args.workspace.expanduser().resolve()
    try:
        target = workspace_path(workspace, args.lesson, LESSON_PATH)
        if args.candidate is None:
            revision = lesson_revision(read_text(target))
            if args.expect is not None:
                assert_revision(target, args.expect)
        else:
            if args.expect is None:
                raise ValueError("--candidate requires --expect")
            revision = publish_candidate(workspace, args.lesson, args.candidate, args.expect)
    except (OSError, UnicodeError, ValueError) as error:
        print(f"Lesson revision refused: {error}", file=sys.stderr)
        return 1
    print(revision)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

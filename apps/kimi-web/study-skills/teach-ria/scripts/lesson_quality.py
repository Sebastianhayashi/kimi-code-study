#!/usr/bin/env python3
"""Deterministic structural gates for learner-facing Chinese lesson HTML."""

from __future__ import annotations

import html
import re
from collections import defaultdict


SECTION_GROUPS: dict[str, tuple[str, ...]] = {
    "learning-objective": ("learning-objective",),
    "core-concept": ("core-concept",),
    "plain-explanation": ("plain-explanation",),
    "source-example": ("source-example", "original-case"),
    "application-example": ("application-example", "transfer-example"),
    "misconception": ("misconception", "boundary-misconception"),
    "lesson-summary": ("lesson-summary",),
    "self-check": ("self-check", "practice-feedback"),
    "source-anchors": ("source-anchors",),
}

AI_FILLER_PATTERNS = tuple(
    re.compile(pattern)
    for pattern in (
        r"在当今快速发展的时代",
        r"让我们(?:一起|来)(?:深入|共同)?(?:探索|学习|开启)",
        r"开启.{0,12}(?:学习|知识)之旅",
        r"(?:综上所述|总而言之)",
        r"不难发现",
        r"至关重要",
    )
)

GENERIC_ANCHORS = {"原文", "材料", "资料", "来源", "见原文", "参考资料"}
ATTRIBUTE_RE = re.compile(
    r"(?P<name>[a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?P<quote>['\"])(?P<value>.*?)(?P=quote)",
    re.DOTALL,
)


def _attributes(fragment: str) -> dict[str, str]:
    return {
        match.group("name").lower(): html.unescape(match.group("value")).strip()
        for match in ATTRIBUTE_RE.finditer(fragment)
    }


def _visible_text(source: str) -> str:
    cleaned = re.sub(r"<!--.*?-->", " ", source, flags=re.DOTALL)
    cleaned = re.sub(r"<(?:script|style)\b.*?</(?:script|style)\s*>", " ", cleaned, flags=re.I | re.S)
    cleaned = re.sub(r"<[^>]+>", " ", cleaned)
    return re.sub(r"\s+", " ", html.unescape(cleaned)).strip()


def _section(source: str, section_id: str) -> tuple[int, str]:
    match = re.search(
        rf"<(?P<tag>[a-z][\w:-]*)\b[^>]*\bid=['\"]{re.escape(section_id)}['\"][^>]*>"
        rf"(?P<body>.*?)</(?P=tag)\s*>",
        source,
        re.IGNORECASE | re.DOTALL,
    )
    if match is None:
        return (-1, "")
    return (match.start(), _visible_text(match.group("body")))


def _evidence_elements(source: str) -> list[dict[str, str]]:
    elements: list[dict[str, str]] = []
    pattern = re.compile(
        r"<(?P<tag>[a-z][\w:-]*)\b(?P<attrs>[^>]*\bdata-evidence\s*=\s*['\"][^'\"]+['\"][^>]*)>"
        r"(?P<body>.*?)</(?P=tag)\s*>",
        re.IGNORECASE | re.DOTALL,
    )
    for match in pattern.finditer(source):
        attrs = _attributes(match.group("attrs"))
        elements.append({
            "kind": attrs.get("data-evidence", ""),
            "anchor": attrs.get("data-source-anchor", ""),
            "text": _visible_text(match.group("body")),
        })
    return elements


def inspect_lesson_html(source: str) -> dict[str, object]:
    sections: dict[str, str] = {}
    positions: dict[str, int] = {}
    for canonical, aliases in SECTION_GROUPS.items():
        candidates = [(_section(source, alias), alias) for alias in aliases]
        present = [(position, text, alias) for (position, text), alias in candidates if position >= 0]
        if present:
            position, text, _ = min(present, key=lambda item: item[0])
            positions[canonical] = position
            sections[canonical] = text
        else:
            positions[canonical] = -1
            sections[canonical] = ""

    evidence = _evidence_elements(source)
    source_evidence = [item for item in evidence if item["kind"] == "source"]
    teaching_examples = [item for item in evidence if item["kind"] == "teaching-example"]
    anchors = [item["anchor"] for item in source_evidence if item["anchor"]]
    visible = _visible_text(source)
    cjk_count = len(re.findall(r"[\u3400-\u9fff]", visible))
    readable_count = len(re.findall(r"[\w\u3400-\u9fff]", visible))

    blocks: list[str] = []
    for match in re.finditer(r"<(?:p|li)\b[^>]*>(.*?)</(?:p|li)\s*>", source, re.I | re.S):
        block = _visible_text(match.group(1))
        if len(block) >= 40:
            blocks.append(block)

    return {
        "sections": sections,
        "positions": positions,
        "sourceEvidence": source_evidence,
        "teachingExamples": teaching_examples,
        "anchors": anchors,
        "visibleText": visible,
        "cjkCount": cjk_count,
        "cjkRatio": cjk_count / max(readable_count, 1),
        "blocks": blocks,
    }


def validate_lesson_html(source: str, label: str = "lesson") -> list[str]:
    errors: list[str] = []
    report = inspect_lesson_html(source)
    sections = report["sections"]
    assert isinstance(sections, dict)

    if not re.search(r"<html\b[^>]*\blang=['\"]zh(?:-CN)?['\"]", source, re.I):
        errors.append(f"{label}: html language must be zh-CN")
    if len(re.findall(r"<h1\b", source, re.I)) != 1:
        errors.append(f"{label}: exactly one visible h1 is required")
    for canonical in SECTION_GROUPS:
        text = str(sections.get(canonical, ""))
        if not text:
            errors.append(f"{label}: missing lesson quality section {canonical}")
        elif len(text) < 16:
            errors.append(f"{label}: lesson quality section {canonical} is too thin")

    if int(report["cjkCount"]) < 120 or float(report["cjkRatio"]) < 0.45:
        errors.append(f"{label}: learner-facing content is not substantial natural Chinese")

    visible = str(report["visibleText"])
    for pattern in AI_FILLER_PATTERNS:
        if pattern.search(visible):
            errors.append(f"{label}: contains generic AI-style filler matched by {pattern.pattern}")

    source_evidence = report["sourceEvidence"]
    teaching_examples = report["teachingExamples"]
    assert isinstance(source_evidence, list) and isinstance(teaching_examples, list)
    if not source_evidence:
        errors.append(f"{label}: requires at least one source-grounded evidence block")
    if not teaching_examples:
        errors.append(f"{label}: requires a teaching example explicitly separated from source facts")

    anchor_section = str(sections.get("source-anchors", ""))
    for item in source_evidence:
        anchor = str(item.get("anchor", "")).strip()
        if not anchor or anchor in GENERIC_ANCHORS or "{" in anchor or "TODO" in anchor.upper():
            errors.append(f"{label}: source evidence has a missing or unstable anchor")
        elif anchor not in anchor_section:
            errors.append(f"{label}: source anchor {anchor!r} is absent from source-anchors")

    positions = report["positions"]
    assert isinstance(positions, dict)
    quick_order = [positions[key] for key in SECTION_GROUPS if int(positions[key]) >= 0]
    if quick_order != sorted(quick_order):
        errors.append(f"{label}: lesson quality sections are not in a coherent learning order")
    return errors


def find_repeated_blocks(documents: dict[str, str]) -> list[str]:
    owners: dict[str, set[str]] = defaultdict(set)
    for label, source in documents.items():
        report = inspect_lesson_html(source)
        for block in report["blocks"]:
            owners[re.sub(r"\s+", " ", str(block)).strip()].add(label)
    return [
        f"repeated learner-facing block across {', '.join(sorted(labels))}: {block[:80]}"
        for block, labels in sorted(owners.items())
        if len(labels) > 1
    ]

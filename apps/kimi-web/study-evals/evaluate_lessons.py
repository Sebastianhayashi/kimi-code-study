#!/usr/bin/env python3
"""Run the small deterministic Kimi Study Chinese lesson quality evaluation."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
QUALITY_MODULE_DIR = ROOT.parent / "study-skills" / "teach-quick" / "scripts"
sys.path.insert(0, str(QUALITY_MODULE_DIR))
from lesson_quality import find_repeated_blocks, inspect_lesson_html, validate_lesson_html


EXPECTED_CATEGORIES = {
    "产品说明",
    "非虚构文章",
    "技术指南",
    "政策说明",
    "培训材料",
}


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path}: JSON root must be an object")
    return value


def _validate_plan(plan: dict[str, Any], coverage_anchors: set[str], label: str) -> tuple[list[str], int]:
    errors: list[str] = []
    if plan.get("schemaVersion") != 1:
        errors.append(f"{label}: unsupported plan schema")
    lessons = plan.get("lessons")
    deferrals = plan.get("visibleDeferrals", [])
    if not isinstance(lessons, list) or len(lessons) < 2:
        return errors + [f"{label}: plan needs at least two progressive lessons"], 0
    if not isinstance(deferrals, list):
        return errors + [f"{label}: visibleDeferrals must be an array"], 0

    covered: set[str] = set()
    seen_titles: set[str] = set()
    for index, lesson in enumerate(lessons, start=1):
        if not isinstance(lesson, dict):
            errors.append(f"{label}: lesson {index} must be an object")
            continue
        if lesson.get("order") != index:
            errors.append(f"{label}: lesson order must be contiguous")
        title = str(lesson.get("title", "")).strip()
        objective = str(lesson.get("objective", "")).strip()
        anchors = lesson.get("sourceAnchors")
        if not title or title in seen_titles:
            errors.append(f"{label}: lesson {index} has a missing or duplicate title")
        seen_titles.add(title)
        if len(objective) < 12:
            errors.append(f"{label}: lesson {index} objective is not observable")
        if not isinstance(anchors, list) or not all(isinstance(anchor, str) for anchor in anchors):
            errors.append(f"{label}: lesson {index} sourceAnchors are invalid")
        else:
            covered.update(anchors)

    for item in deferrals:
        if not isinstance(item, dict) or not str(item.get("reason", "")).strip():
            errors.append(f"{label}: every deferral needs a visible reason")
            continue
        anchors = item.get("sourceAnchors", [])
        if isinstance(anchors, list):
            covered.update(anchor for anchor in anchors if isinstance(anchor, str))

    missing = coverage_anchors - covered
    if missing:
        errors.append(f"{label}: outline omits source anchor {sorted(missing)[0]}")
    unknown = covered - coverage_anchors
    if unknown:
        errors.append(f"{label}: outline invents source anchor {sorted(unknown)[0]}")
    return errors, len(coverage_anchors & covered)


def evaluate(fixtures_root: Path = ROOT / "fixtures") -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    lesson_documents: dict[str, str] = {}
    categories: set[str] = set()
    total_outline_anchors = 0
    covered_outline_anchors = 0
    total_required_facts = 0
    covered_required_facts = 0
    invalid_anchors = 0
    forbidden_claims = 0

    for fixture_dir in sorted(path for path in fixtures_root.iterdir() if path.is_dir()):
        errors: list[str] = []
        try:
            expected = _read_json(fixture_dir / "expected.json")
            plan = _read_json(fixture_dir / "plan.json")
            source = (fixture_dir / "source.md").read_text(encoding="utf-8")
            lesson_path = fixture_dir / str(expected.get("lessonPath", "lesson.html"))
            lesson = lesson_path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            results.append({
                "id": fixture_dir.name,
                "category": "unknown",
                "passed": False,
                "errors": [str(error)],
            })
            continue

        fixture_id = str(expected.get("id", fixture_dir.name))
        category = str(expected.get("category", ""))
        categories.add(category)
        if expected.get("schemaVersion") != 1:
            errors.append("expected.json: unsupported schema")
        if fixture_id != fixture_dir.name:
            errors.append("expected.json: id must match fixture directory")

        coverage_anchors = set(expected.get("coverageAnchors", []))
        if not coverage_anchors or not all(isinstance(anchor, str) for anchor in coverage_anchors):
            errors.append("expected.json: coverageAnchors are missing")
            coverage_anchors = set()
        for anchor in coverage_anchors:
            if anchor not in source:
                errors.append(f"source.md: declared anchor is absent: {anchor}")

        plan_errors, covered = _validate_plan(plan, coverage_anchors, "plan.json")
        errors.extend(plan_errors)
        total_outline_anchors += len(coverage_anchors)
        covered_outline_anchors += covered

        errors.extend(validate_lesson_html(lesson, "lesson.html"))
        report = inspect_lesson_html(lesson)
        lesson_documents[fixture_id] = lesson
        used_anchors = set(report["anchors"])
        allowed_anchors = set(expected.get("allowedLessonAnchors", []))
        unknown_anchors = used_anchors - allowed_anchors
        invalid_anchors += len(unknown_anchors)
        for anchor in sorted(unknown_anchors):
            errors.append(f"lesson.html: invented or disallowed source anchor {anchor}")

        source_evidence = " ".join(
            str(item.get("text", "")) for item in report["sourceEvidence"]
        )
        required_facts = expected.get("requiredSourcePhrases", [])
        total_required_facts += len(required_facts)
        for fact in required_facts:
            if not isinstance(fact, str) or fact not in source:
                errors.append(f"expected source fact is absent from source.md: {fact}")
            elif fact not in source_evidence:
                errors.append(f"lesson source evidence omits required fact: {fact}")
            else:
                covered_required_facts += 1

        sections = report["sections"]
        objective = str(sections.get("learning-objective", ""))
        self_check = str(sections.get("self-check", ""))
        for keyword in expected.get("objectiveKeywords", []):
            if keyword not in objective or keyword not in self_check:
                errors.append(f"self-check is not aligned to objective keyword: {keyword}")

        visible = str(report["visibleText"])
        for claim in expected.get("forbiddenClaims", []):
            if isinstance(claim, str) and claim in visible:
                forbidden_claims += 1
                errors.append(f"lesson contains unsupported claim: {claim}")

        results.append({
            "id": fixture_id,
            "category": category,
            "passed": not errors,
            "generatedLessons": 1,
            "outlineAnchors": len(coverage_anchors),
            "requiredSourceFacts": len(required_facts),
            "errors": errors,
        })

    global_errors = [
        f"missing required fixture category: {category}"
        for category in sorted(EXPECTED_CATEGORIES - categories)
    ]
    global_errors.extend(
        f"cross-fixture repetition: {error}"
        for error in find_repeated_blocks(lesson_documents)
    )
    passed = sum(1 for result in results if result["passed"])
    return {
        "schemaVersion": 1,
        "method": "offline synthetic fixtures; deterministic structural and grounding proxy",
        "fixtureCount": len(results),
        "passedFixtures": passed if not global_errors else 0,
        "categories": sorted(categories),
        "metrics": {
            "outlineAnchorCoverage": {
                "covered": covered_outline_anchors,
                "total": total_outline_anchors,
            },
            "requiredSourceFactCoverage": {
                "covered": covered_required_facts,
                "total": total_required_facts,
            },
            "invalidSourceAnchors": invalid_anchors,
            "unsupportedForbiddenClaims": forbidden_claims,
            "repeatedBlocks": len(global_errors) - len(EXPECTED_CATEGORIES - categories),
        },
        "globalErrors": global_errors,
        "results": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixtures", type=Path, default=ROOT / "fixtures")
    args = parser.parse_args()
    report = evaluate(args.fixtures.expanduser().resolve())
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["passedFixtures"] == len(EXPECTED_CATEGORIES) else 1


if __name__ == "__main__":
    raise SystemExit(main())

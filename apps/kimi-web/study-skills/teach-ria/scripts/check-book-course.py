#!/usr/bin/env python3
"""Check the fidelity gates for a whole-book teach course."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lesson_quality import find_repeated_blocks, validate_lesson_html


PLACEHOLDER = re.compile(r"\{[^}]*\}|\b(?:TBD|TODO)\b", re.IGNORECASE)
BRIEF_SECTIONS = (
    "Primary capability slice",
    "Learning objective",
    "Source anchors",
    "RIA grounding",
    "Core concept",
    "Plain explanation",
    "Original source case",
    "Reasoning chain",
    "Transfer example",
    "Boundary or misconception",
    "Lesson summary",
    "Practice and feedback",
    "Retrieval connection",
    "Explicit exclusions",
    "Publication check",
)
HTML_SECTIONS = (
    "learning-objective",
    "core-concept",
    "plain-explanation",
    "ria-connection",
    "original-case",
    "reasoning-chain",
    "transfer-example",
    "boundary-misconception",
    "lesson-summary",
    "practice-feedback",
    "retrieval-connection",
    "explicit-exclusions",
    "source-anchors",
)

APPROVAL_PATTERN = re.compile(
    r"actor=(user|auto_policy|system);\s*policy=([^;]+);\s*revision=([^;]+);\s*at=(.+)"
)


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return ""


def field(source: str, label: str) -> str:
    match = re.search(
        rf"^-\s*{re.escape(label)}:\s*(.+?)\s*$",
        source,
        re.MULTILINE | re.IGNORECASE,
    )
    return match.group(1).strip() if match else ""


def section(source: str, heading: str) -> str:
    match = re.search(
        rf"^##\s+{re.escape(heading)}\s*$\n(.*?)(?=^##\s|\Z)",
        source,
        re.MULTILINE | re.DOTALL | re.IGNORECASE,
    )
    return match.group(1).strip() if match else ""


def markdown_rows(source: str, heading: str) -> list[list[str]]:
    rows: list[list[str]] = []
    for line in section(source, heading).splitlines():
        if not line.strip().startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if not cells or cells[0].lower() in {
            "id",
            "range",
            "slice id",
            "sequence",
            "capability id",
            "mission outcome",
            "ria unit id",
            "candidate id",
        }:
            continue
        if all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells):
            continue
        rows.append(cells)
    return rows


def checked_audit(source: str, heading: str, minimum: int, errors: list[str]) -> None:
    body = section(source, heading)
    checks = re.findall(r"^-\s*\[([ xX])\]\s+(.+)$", body, re.MULTILINE)
    if len(checks) < minimum:
        errors.append(f"{heading}: expected at least {minimum} checklist items")
        return
    unchecked = [label for mark, label in checks if mark.lower() != "x"]
    if unchecked:
        errors.append(f"{heading}: unchecked item: {unchecked[0]}")


def non_placeholder(value: str) -> bool:
    return bool(value.strip()) and not PLACEHOLDER.search(value)


def valid_approval(value: str, expected_revision: str | None = None) -> bool:
    match = APPROVAL_PATTERN.fullmatch(value.strip())
    if not match:
        return False
    policy = match.group(2).strip()
    revision = match.group(3).strip()
    timestamp = match.group(4).strip()
    if not policy or not revision or "T" not in timestamp:
        return False
    return expected_revision is None or revision == expected_revision


def normalized(value: str) -> str:
    value = re.sub(r"[*_`]", "", value)
    return re.sub(r"\s+", " ", value).strip().casefold()


def resolve_workspace_path(workspace: Path, value: str) -> Path:
    path = Path(value).expanduser()
    return path.resolve() if path.is_absolute() else (workspace / path).resolve()


def validate_ria_distillation(
    workspace: Path,
    state_text: str,
    distillation: Path,
    errors: list[str],
) -> tuple[str, set[str]]:
    if not distillation.exists():
        errors.append(f"missing required file: {distillation}")
        return "", set()

    source = read_text(distillation)
    if field(state_text, "RIA distillation").lower() != "complete":
        errors.append("BOOK-READING-STATE.md: RIA distillation must be complete")
    if field(source, "Status").lower() != "approved":
        errors.append("RIA-DISTILLATION.md: Status must be approved")
    revision = field(source, "Revision")
    if not non_placeholder(revision):
        errors.append("RIA-DISTILLATION.md: Revision is missing")
    if not valid_approval(field(source, "Approval provenance"), revision):
        errors.append("RIA-DISTILLATION.md: approval provenance is invalid or stale")
    if not valid_approval(field(state_text, "RIA approval"), revision):
        errors.append("BOOK-READING-STATE.md: RIA approval is invalid or stale")
    coverage = re.search(r"(\d{1,3})", field(source, "Reading coverage"))
    if not coverage or int(coverage.group(1)) != 100:
        errors.append("RIA-DISTILLATION.md: Reading coverage must be 100%")
    for label in (
        "Candidate extraction",
        "Triple verification",
        "RIA++ units",
        "Relationship index",
    ):
        if field(source, label).lower() != "complete":
            errors.append(f"RIA-DISTILLATION.md: {label} must be complete")
    if field(source, "Pressure tests").lower() != "passed":
        errors.append("RIA-DISTILLATION.md: Pressure tests must be passed")
    if field(source, "Unresolved distillation gaps").strip().lower() not in {"none", "无"}:
        errors.append("RIA-DISTILLATION.md: unresolved distillation gaps must be none")
    count_value = field(source, "Verified unit count")
    if not re.fullmatch(r"\d+", count_value):
        errors.append("RIA-DISTILLATION.md: Verified unit count must be an integer")
        expected_count = None
    else:
        expected_count = int(count_value)

    rows = markdown_rows(source, "Verified unit register")
    if expected_count is not None and len(rows) != expected_count:
        errors.append(
            "RIA-DISTILLATION.md: Verified unit count does not match the register "
            f"({expected_count} declared, {len(rows)} rows)"
        )

    unit_ids: set[str] = set()
    for number, row in enumerate(rows, start=1):
        if len(row) < 7:
            errors.append(f"RIA-DISTILLATION.md: verified unit row {number} has fewer than 7 columns")
            continue
        unit_id, unit_type, anchors, unit_file, test_file, result_file, result = row[:7]
        if not re.fullmatch(r"RIA-[A-Z0-9.-]+", unit_id) or unit_id in unit_ids:
            errors.append(f"RIA-DISTILLATION.md: invalid or duplicate unit ID in row {number}")
        unit_ids.add(unit_id)
        if not all(non_placeholder(value) for value in (unit_type, anchors, unit_file, test_file, result_file)):
            errors.append(f"RIA-DISTILLATION.md: incomplete verified unit row {unit_id or number}")
        if result.lower() != "passed":
            errors.append(f"RIA-DISTILLATION.md: unit {unit_id or number} has not passed")

        unit_path = resolve_workspace_path(workspace, unit_file)
        test_path = resolve_workspace_path(workspace, test_file)
        result_path = resolve_workspace_path(workspace, result_file)
        for path, label in ((unit_path, "RIA++ file"), (test_path, "test file"), (result_path, "test result")):
            if not path.is_file():
                errors.append(f"RIA-DISTILLATION.md: {label} does not exist: {path}")

        unit_text = read_text(unit_path)
        for prefix in ("R", "I", "A1", "A2", "E", "B"):
            if not re.search(rf"^##\s+{re.escape(prefix)}\s+[—-]", unit_text, re.MULTILINE):
                errors.append(f"{unit_path}: missing RIA++ section {prefix}")

        try:
            test_data = json.loads(read_text(test_path))
        except (json.JSONDecodeError, TypeError):
            errors.append(f"{test_path}: invalid JSON")
            test_data = {}
        cases = test_data.get("test_cases", []) if isinstance(test_data, dict) else []
        case_types = [case.get("type") for case in cases if isinstance(case, dict)]
        if case_types.count("should_trigger") < 3:
            errors.append(f"{test_path}: expected at least 3 should_trigger cases")
        if case_types.count("should_not_trigger") < 2:
            errors.append(f"{test_path}: expected at least 2 should_not_trigger cases")
        if case_types.count("edge_case") < 1:
            errors.append(f"{test_path}: expected at least 1 edge_case")
        if not any(
            case.get("type") == "should_not_trigger" and case.get("cross_unit_confusion") is True
            for case in cases
            if isinstance(case, dict)
        ):
            errors.append(f"{test_path}: missing cross-unit confusion trap")
        if field(read_text(result_path), "Status").lower() != "passed":
            errors.append(f"{result_path}: Status must be passed")

    rejected_rows = markdown_rows(source, "Rejected candidate register")
    seen_rejected_ids: set[str] = set()
    for number, row in enumerate(rejected_rows, start=1):
        if len(row) < 5:
            errors.append(f"RIA-DISTILLATION.md: rejected row {number} has fewer than 5 columns")
            continue
        candidate_id, anchors, failed_check, reason, audit_file = row[:5]
        if not non_placeholder(candidate_id) or candidate_id in seen_rejected_ids:
            errors.append(f"RIA-DISTILLATION.md: invalid or duplicate rejected ID in row {number}")
        seen_rejected_ids.add(candidate_id)
        if not all(non_placeholder(value) for value in (anchors, failed_check, reason, audit_file)):
            errors.append(f"RIA-DISTILLATION.md: incomplete rejected row {candidate_id or number}")
        if failed_check.upper() not in {"V1", "V2", "V3", "V1/V2", "V1/V3", "V2/V3", "V1/V2/V3"}:
            errors.append(f"RIA-DISTILLATION.md: rejected row {candidate_id or number} has invalid failed check")
        if not resolve_workspace_path(workspace, audit_file).is_file():
            errors.append(f"RIA-DISTILLATION.md: rejection audit file does not exist: {audit_file}")

    for filename in (
        "frameworks.md",
        "principles.md",
        "cases.md",
        "counter-examples.md",
        "glossary.md",
    ):
        relative = f"source/ria/candidates/{filename}"
        if not (workspace / relative).is_file():
            errors.append(f"RIA-DISTILLATION.md: missing completed extraction pass: {relative}")

    for relative in ("source/ria/INDEX.md", "source/ria/GLOSSARY.md"):
        if not (workspace / relative).is_file():
            errors.append(f"RIA-DISTILLATION.md: missing required linked artifact: {relative}")
    index_text = read_text(workspace / "source/ria/INDEX.md")
    for unit_id in unit_ids:
        if unit_id not in index_text:
            errors.append(f"source/ria/INDEX.md: missing verified unit {unit_id}")

    checked_audit(source, "Integrity audit", 10, errors)
    return revision, unit_ids


def validate_blueprint(
    mission: Path,
    state: Path,
    overview: Path,
    distillation: Path,
    blueprint: Path,
    teaching_map: Path,
    errors: list[str],
) -> tuple[str, str, set[str], list[str], set[str]]:
    for path in (mission, state, overview, blueprint, teaching_map):
        if not path.exists():
            errors.append(f"missing required file: {path}")

    if errors:
        return "", "", set(), [], set()

    mission_hash = hashlib.sha256(mission.read_bytes()).hexdigest()
    mission_text = read_text(mission)
    state_text = read_text(state)
    blueprint_text = read_text(blueprint)
    map_text = read_text(teaching_map)

    ria_revision, ria_unit_ids = validate_ria_distillation(
        mission.parent,
        state_text,
        distillation,
        errors,
    )

    if field(state_text, "Status").lower() != "approved":
        errors.append("BOOK-READING-STATE.md: Status must be approved")
    coverage = re.search(r"(\d{1,3})", field(state_text, "Coverage"))
    if not coverage or int(coverage.group(1)) != 100:
        errors.append("BOOK-READING-STATE.md: Coverage must be 100%")
    if field(state_text, "Unresolved gaps").strip().lower() not in {"none", "无"}:
        errors.append("BOOK-READING-STATE.md: Unresolved gaps must be none")
    if field(state_text, "Whole-book overview").lower() != "complete":
        errors.append("BOOK-READING-STATE.md: Whole-book overview must be complete")
    if field(state_text, "Curriculum blueprint").lower() != "complete":
        errors.append("BOOK-READING-STATE.md: Curriculum blueprint must be complete")
    if field(state_text, "Teaching map").lower() != "complete":
        errors.append("BOOK-READING-STATE.md: Teaching map must be complete")
    if field(state_text, "Teaching unlocked").lower() != "yes":
        errors.append("BOOK-READING-STATE.md: Teaching unlocked must be yes")
    reading_revision = field(state_text, "Reading certificate revision")
    if not non_placeholder(reading_revision):
        errors.append("BOOK-READING-STATE.md: reading certificate revision is missing")
    if not valid_approval(field(state_text, "Overview approval"), reading_revision):
        errors.append("BOOK-READING-STATE.md: overview approval provenance is invalid or stale")

    source_file_value = field(state_text, "File")
    if not non_placeholder(source_file_value):
        errors.append("BOOK-READING-STATE.md: source File is missing")
    elif not resolve_workspace_path(mission.parent, source_file_value).is_file():
        errors.append(f"BOOK-READING-STATE.md: source File does not exist: {source_file_value}")

    reading_rows = markdown_rows(state_text, "Reading ledger")
    required_ranges = {
        normalized(row[0]): row[0]
        for row in reading_rows
        if len(row) >= 4
        and row[2].lower() == "read"
        and normalized(row[1]) != "administrative"
    }

    if field(blueprint_text, "Status").lower() != "approved":
        errors.append("CURRICULUM-BLUEPRINT.md: Status must be approved")
    blueprint_coverage = re.search(r"(\d{1,3})", field(blueprint_text, "Reading coverage"))
    if not blueprint_coverage or int(blueprint_coverage.group(1)) != 100:
        errors.append("CURRICULUM-BLUEPRINT.md: Reading coverage must be 100%")
    if field(blueprint_text, "Unresolved source gaps").strip().lower() not in {"none", "无"}:
        errors.append("CURRICULUM-BLUEPRINT.md: Unresolved source gaps must be none")
    blueprint_hash = field(blueprint_text, "Mission SHA-256").lower()
    if blueprint_hash != mission_hash:
        errors.append(
            "CURRICULUM-BLUEPRINT.md: mission hash is stale "
            f"(expected {mission_hash})"
        )
    revision = field(blueprint_text, "Revision")
    if not non_placeholder(revision):
        errors.append("CURRICULUM-BLUEPRINT.md: Revision is missing")
    if not valid_approval(field(blueprint_text, "Approval provenance"), revision):
        errors.append("CURRICULUM-BLUEPRINT.md: approval provenance is invalid or stale")
    if not valid_approval(field(state_text, "Course approval"), revision):
        errors.append("BOOK-READING-STATE.md: course approval is invalid or stale")
    if field(blueprint_text, "RIA revision") != ria_revision:
        errors.append("CURRICULUM-BLUEPRINT.md: RIA revision does not match approved distillation")

    ria_coverage_rows = markdown_rows(blueprint_text, "RIA unit coverage")
    covered_ria_ids: set[str] = set()
    for number, row in enumerate(ria_coverage_rows, start=1):
        if len(row) < 4:
            errors.append(f"CURRICULUM-BLUEPRINT.md: RIA coverage row {number} has fewer than 4 columns")
            continue
        unit_id, disposition, destination, rationale = row[:4]
        if unit_id in covered_ria_ids or unit_id not in ria_unit_ids:
            errors.append(f"CURRICULUM-BLUEPRINT.md: invalid or duplicate RIA unit ID {unit_id!r}")
        covered_ria_ids.add(unit_id)
        if disposition.lower() not in {"teach", "reference", "defer"}:
            errors.append(f"CURRICULUM-BLUEPRINT.md: RIA unit {unit_id} has invalid disposition")
        if not non_placeholder(destination) or not non_placeholder(rationale):
            errors.append(f"CURRICULUM-BLUEPRINT.md: incomplete RIA coverage row {unit_id or number}")
    missing_ria_ids = ria_unit_ids - covered_ria_ids
    if missing_ria_ids:
        errors.append(
            "CURRICULUM-BLUEPRINT.md: verified RIA unit has no course disposition: "
            f"{sorted(missing_ria_ids)[0]}"
        )

    rows = markdown_rows(blueprint_text, "Source disposition ledger")
    if not rows:
        errors.append("CURRICULUM-BLUEPRINT.md: source disposition ledger has no rows")
    seen_ids: set[str] = set()
    blueprint_ranges: set[str] = set()
    teach_destinations: dict[str, set[str]] = {}
    for number, row in enumerate(rows, start=1):
        if len(row) < 8:
            errors.append(f"CURRICULUM-BLUEPRINT.md: ledger row {number} has fewer than 8 columns")
            continue
        source_id, ledger_range, anchor, unit, preserved, disposition, destination, rationale = row[:8]
        if not non_placeholder(source_id) or source_id in seen_ids:
            errors.append(f"CURRICULUM-BLUEPRINT.md: invalid or duplicate source ID in row {number}")
        seen_ids.add(source_id)
        blueprint_ranges.add(normalized(ledger_range))
        if not all(
            non_placeholder(value)
            for value in (ledger_range, anchor, unit, preserved, destination, rationale)
        ):
            errors.append(f"CURRICULUM-BLUEPRINT.md: incomplete ledger row {source_id or number}")
        if disposition.lower() not in {"teach", "reference", "defer"}:
            errors.append(
                f"CURRICULUM-BLUEPRINT.md: {source_id or number} has invalid disposition "
                f"{disposition!r}"
            )
        if disposition.lower() == "teach":
            teach_destinations[source_id] = set(re.findall(r"\bS[\w.-]+\b", destination))
            if not teach_destinations[source_id]:
                errors.append(f"CURRICULUM-BLUEPRINT.md: teach row {source_id} has no slice destination")
        elif disposition.lower() == "reference":
            reference_paths = re.findall(r"reference/[^\s,;|]+", destination)
            if not reference_paths:
                errors.append(f"CURRICULUM-BLUEPRINT.md: reference row {source_id} has no reference path")
            for reference_path in reference_paths:
                if not resolve_workspace_path(mission.parent, reference_path).is_file():
                    errors.append(
                        f"CURRICULUM-BLUEPRINT.md: reference destination does not exist: "
                        f"{reference_path}"
                    )

    for normalized_range, display_range in required_ranges.items():
        if normalized_range not in blueprint_ranges:
            errors.append(
                f"CURRICULUM-BLUEPRINT.md: reading-ledger range has no disposition row: "
                f"{display_range}"
            )

    capability_rows = markdown_rows(blueprint_text, "Capability architecture")
    if not capability_rows:
        errors.append("CURRICULUM-BLUEPRINT.md: capability architecture has no rows")

    slice_rows = markdown_rows(blueprint_text, "Lesson slice register")
    if not slice_rows:
        errors.append("CURRICULUM-BLUEPRINT.md: lesson slice register has no rows")
    slice_ids: set[str] = set()
    slice_source_ids: set[str] = set()
    for number, row in enumerate(slice_rows, start=1):
        if len(row) < 6:
            errors.append(f"CURRICULUM-BLUEPRINT.md: lesson slice row {number} has fewer than 6 columns")
            continue
        slice_id = row[0]
        if not non_placeholder(slice_id) or slice_id in slice_ids:
            errors.append(f"CURRICULUM-BLUEPRINT.md: invalid or duplicate slice ID in row {number}")
        slice_ids.add(slice_id)
        slice_source_ids.update(re.findall(r"\b[A-Z][A-Z0-9.-]+\b", row[2]))

    for source_id, destinations in teach_destinations.items():
        if source_id not in slice_source_ids:
            errors.append(f"CURRICULUM-BLUEPRINT.md: teach row {source_id} is absent from the slice register")
        unknown = destinations - slice_ids
        if unknown:
            errors.append(
                f"CURRICULUM-BLUEPRINT.md: teach row {source_id} points to unknown slice "
                f"{sorted(unknown)[0]}"
            )

    mission_successes = [
        match.group(1).strip()
        for match in re.finditer(
            r"^-\s+(.+)$",
            section(mission_text, "Success looks like"),
            re.MULTILINE,
        )
    ]
    outcome_rows = markdown_rows(blueprint_text, "Mission outcome coverage")
    covered_outcomes: dict[str, list[str]] = {
        normalized(row[0]): row for row in outcome_rows if len(row) >= 4
    }
    for outcome in mission_successes:
        row = covered_outcomes.get(normalized(outcome))
        if not row:
            errors.append(f"CURRICULUM-BLUEPRINT.md: mission outcome is not mapped: {outcome}")
            continue
        if not all(non_placeholder(value) for value in row[1:4]):
            errors.append(f"CURRICULUM-BLUEPRINT.md: incomplete mission outcome mapping: {outcome}")
        outcome_slices = set(re.findall(r"\bS[\w.-]+\b", row[2]))
        if not outcome_slices or outcome_slices - slice_ids:
            errors.append(f"CURRICULUM-BLUEPRINT.md: mission outcome has invalid slice mapping: {outcome}")

    checked_audit(blueprint_text, "Integrity audit", 10, errors)

    if field(map_text, "Status").lower() != "approved":
        errors.append("TEACHING-MAP.md: Status must be approved")
    if field(map_text, "Mission SHA-256").lower() != mission_hash:
        errors.append("TEACHING-MAP.md: mission hash does not match current MISSION.md")
    if field(map_text, "Blueprint revision") != revision:
        errors.append("TEACHING-MAP.md: Blueprint revision does not match the blueprint")

    map_rows = markdown_rows(map_text, "Learning path")
    map_slice_order = [row[1] for row in map_rows if len(row) >= 6 and non_placeholder(row[1])]
    map_slice_ids = set(map_slice_order)
    missing_slices = slice_ids - map_slice_ids
    if missing_slices:
        errors.append(f"TEACHING-MAP.md: missing blueprint slice {sorted(missing_slices)[0]}")

    return mission_hash, revision, slice_ids, map_slice_order, ria_unit_ids


def validate_brief(
    workspace: Path,
    brief: Path,
    mission_hash: str,
    blueprint_revision: str,
    slice_ids: set[str],
    map_slice_order: list[str],
    ria_unit_ids: set[str],
    errors: list[str],
) -> None:
    if not brief.exists():
        errors.append(f"missing lesson brief: {brief}")
        return

    source = read_text(brief)
    brief_status = field(source, "Status").lower()
    if brief_status not in {"ready", "published"}:
        errors.append(f"{brief}: Status must be ready or published")
    if field(source, "Mission SHA-256").lower() != mission_hash:
        errors.append(f"{brief}: mission hash does not match current MISSION.md")
    if field(source, "Blueprint revision") != blueprint_revision:
        errors.append(f"{brief}: Blueprint revision does not match the blueprint")
    brief_slice_id = field(source, "Slice ID")
    if not non_placeholder(brief_slice_id):
        errors.append(f"{brief}: Slice ID is missing")
    elif brief_slice_id not in slice_ids:
        errors.append(f"{brief}: Slice ID is absent from the curriculum blueprint")

    brief_ria_value = field(source, "RIA Unit IDs")
    if not non_placeholder(brief_ria_value):
        errors.append(f"{brief}: RIA Unit IDs is missing")
    elif brief_ria_value.lower() not in {"none", "无"}:
        brief_ria_ids = set(re.findall(r"RIA-[A-Z0-9.-]+", brief_ria_value))
        if not brief_ria_ids:
            errors.append(f"{brief}: RIA Unit IDs must contain verified IDs or `none`")
        unknown_ria_ids = brief_ria_ids - ria_unit_ids
        if unknown_ria_ids:
            errors.append(f"{brief}: unknown RIA Unit ID {sorted(unknown_ria_ids)[0]}")

    lesson_value = field(source, "Lesson")
    expected_lesson = f"lessons/{brief.stem}.html"
    if lesson_value != expected_lesson:
        errors.append(f"{brief}: Lesson must be {expected_lesson}")

    for heading in BRIEF_SECTIONS:
        body = section(source, heading)
        if not non_placeholder(body):
            errors.append(f"{brief}: section is missing or incomplete: {heading}")

    chain = section(source, "Reasoning chain")
    for label in (
        "Situation and facts",
        "Diagnosis",
        "Crux or mechanism",
        "Action or choice",
        "Result",
        "Limits or boundary",
    ):
        if not non_placeholder(field(chain, label)):
            errors.append(f"{brief}: Reasoning chain is missing {label}")

    practice = section(source, "Practice and feedback")
    for label in ("Task", "Observable response", "Evaluation criteria", "Immediate feedback or answer logic"):
        if not non_placeholder(field(practice, label)):
            errors.append(f"{brief}: Practice and feedback is missing {label}")

    checked_audit(source, "Publication check", 9, errors)

    if lesson_value:
        lesson_path = resolve_workspace_path(workspace, lesson_value)
        if lesson_path.exists() and lesson_path.stem != brief.stem:
            errors.append(f"{brief}: lesson filename does not match brief filename")
        if lesson_path.exists() and brief_status != "published":
            errors.append(f"{brief}: Status must be published when its lesson HTML exists")
        if not lesson_path.exists() and brief_status == "published":
            errors.append(f"{brief}: published brief has no lesson HTML")

    active_briefs: dict[str, list[Path]] = {}
    published_slices: set[str] = set()
    briefs_dir = workspace / "source" / "lesson-briefs"
    for candidate in sorted(briefs_dir.glob("*.md")) if briefs_dir.exists() else []:
        candidate_text = read_text(candidate)
        candidate_status = field(candidate_text, "Status").lower()
        candidate_slice = field(candidate_text, "Slice ID")
        if candidate_status not in {"ready", "published"} or not candidate_slice:
            continue
        active_briefs.setdefault(candidate_slice, []).append(candidate)
        if candidate_status == "published":
            candidate_lesson = resolve_workspace_path(workspace, field(candidate_text, "Lesson"))
            if candidate_lesson.is_file():
                published_slices.add(candidate_slice)

    duplicates = active_briefs.get(brief_slice_id, [])
    if len(duplicates) > 1:
        errors.append(f"{brief}: Slice ID is already used by another active brief")

    if brief_slice_id in map_slice_order:
        position = map_slice_order.index(brief_slice_id)
        missing_prior = [slice_id for slice_id in map_slice_order[:position] if slice_id not in published_slices]
        if missing_prior:
            errors.append(f"{brief}: prior slice is not published: {missing_prior[0]}")
        if brief_status == "ready":
            unused = [slice_id for slice_id in map_slice_order if slice_id not in published_slices]
            if unused and brief_slice_id != unused[0]:
                errors.append(f"{brief}: next unconsumed slice is {unused[0]}")


def html_section_text(source: str, section_id: str) -> str:
    match = re.search(
        rf"<(?P<tag>[a-z][\w:-]*)\b[^>]*\bid=[\"']{re.escape(section_id)}[\"'][^>]*>"
        rf"(?P<body>.*?)</(?P=tag)\s*>",
        source,
        re.IGNORECASE | re.DOTALL,
    )
    if not match:
        return ""
    body = re.sub(r"<(?:script|style)\b.*?</(?:script|style)\s*>", "", match.group("body"), flags=re.I | re.S)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", body))).strip()


def validate_lesson(workspace: Path, lesson: Path, brief: Path, errors: list[str]) -> None:
    if not lesson.exists():
        errors.append(f"missing lesson: {lesson}")
        return

    source = read_text(lesson)
    section_texts: dict[str, str] = {}
    for section_id in HTML_SECTIONS:
        section_texts[section_id] = html_section_text(source, section_id)
        if not section_texts[section_id]:
            errors.append(f"{lesson}: missing visible id=\"{section_id}\" section")
        elif len(section_texts[section_id]) < 20:
            errors.append(f"{lesson}: id=\"{section_id}\" section is too thin")

    brief_text = read_text(brief)
    anchor_ids = set(re.findall(r"\b[A-Z][A-Z0-9.-]+\b", section(brief_text, "Source anchors")))
    anchor_text = section_texts.get("source-anchors", "")
    for anchor_id in anchor_ids:
        if anchor_id not in anchor_text:
            errors.append(f"{lesson}: source-anchors section is missing {anchor_id}")

    if not re.search(r"href=[\"']\.\./index\.html(?:#[^\"']*)?[\"']", source, re.IGNORECASE):
        errors.append(f"{lesson}: missing Course home link to ../index.html")


def validate_lesson_index(workspace: Path, generation: dict, errors: list[str]) -> None:
    published_lessons = generation.get("publishedLessons")
    if not isinstance(published_lessons, int) or isinstance(published_lessons, bool) or published_lessons < 0:
        errors.append("STUDY-SNAPSHOT.json: publishedLessons must be a non-negative integer")
        return

    index_path = workspace / "lessons" / "index.json"
    if not index_path.is_file():
        if published_lessons > 0 or generation.get("status") in {"partially_ready", "ready"}:
            errors.append("lessons/index.json: required after lesson publication begins")
        return
    try:
        manifest = json.loads(read_text(index_path))
    except json.JSONDecodeError:
        errors.append("lessons/index.json: invalid JSON")
        return
    if not isinstance(manifest, dict):
        errors.append("lessons/index.json: root must be an object")
        return
    if manifest.get("schemaVersion") != 1 or manifest.get("contractRevision") != "kimi-study-lessons-v1":
        errors.append("lessons/index.json: unsupported lesson index contract")
        return
    lessons = manifest.get("lessons")
    if not isinstance(lessons, list):
        errors.append("lessons/index.json: lessons must be an array")
        return

    seen_paths: set[str] = set()
    published_documents: dict[str, str] = {}
    published_count = 0
    all_published = True
    for index, lesson in enumerate(lessons, start=1):
        if not isinstance(lesson, dict):
            errors.append(f"lessons/index.json: lesson {index} must be an object")
            continue
        order = lesson.get("order")
        path = lesson.get("path")
        title = lesson.get("title")
        status = lesson.get("status")
        if not isinstance(order, int) or isinstance(order, bool) or order != index:
            errors.append(f"lessons/index.json: lesson {index} has a non-contiguous order")
        if not isinstance(path, str) or not re.fullmatch(r"lessons/[A-Za-z0-9][A-Za-z0-9._-]*\.html", path):
            errors.append(f"lessons/index.json: lesson {index} has an unsafe path")
        elif path in seen_paths:
            errors.append(f"lessons/index.json: duplicate path {path}")
        else:
            seen_paths.add(path)
        if not isinstance(title, str) or not title.strip() or len(title) > 200 or "{" in title:
            errors.append(f"lessons/index.json: lesson {index} has an invalid title")
        if status not in {"planned", "published", "failed"}:
            errors.append(f"lessons/index.json: lesson {index} has an invalid status")
            all_published = False
        elif status == "published":
            published_count += 1
            if isinstance(path, str):
                lesson_path = workspace / path
                if not lesson_path.is_file():
                    errors.append(f"lessons/index.json: published lesson is missing: {path}")
                elif re.fullmatch(r"lessons/[A-Za-z0-9][A-Za-z0-9._-]*\.html", path):
                    lesson_source = read_text(lesson_path)
                    published_documents[path] = lesson_source
                    errors.extend(validate_lesson_html(lesson_source, path))
        else:
            all_published = False

    if published_count != published_lessons:
        errors.append("lessons/index.json: published count does not match STUDY-SNAPSHOT.json")
    if generation.get("status") == "ready" and not all_published:
        errors.append("lessons/index.json: ready generation requires every lesson to be published")
    errors.extend(
        f"lessons/index.json: {error}"
        for error in find_repeated_blocks(published_documents)
    )


def validate_study_snapshot(workspace: Path, errors: list[str]) -> None:
    path = workspace / "source" / "STUDY-SNAPSHOT.json"
    if not path.is_file():
        errors.append(f"missing required file: {path}")
        return
    try:
        snapshot = json.loads(read_text(path))
    except (json.JSONDecodeError, TypeError):
        errors.append("STUDY-SNAPSHOT.json: invalid JSON")
        return
    if not isinstance(snapshot, dict):
        errors.append("STUDY-SNAPSHOT.json: root must be an object")
        return
    if snapshot.get("schemaVersion") != 1 or snapshot.get("contractRevision") != "kimi-study-foundation-v1":
        errors.append("STUDY-SNAPSHOT.json: unsupported product contract")

    profile = snapshot.get("profile")
    source = snapshot.get("source")
    mission = snapshot.get("mission")
    plan = snapshot.get("plan")
    generation = snapshot.get("generation")
    approvals = snapshot.get("approvals")
    if not all(isinstance(value, dict) for value in (profile, source, mission, plan, generation)):
        errors.append("STUDY-SNAPSHOT.json: profile, source, Mission, plan, and generation must be objects")
        return

    mode = profile.get("mode")
    if mode not in {"deep", "deep_preprocessed"}:
        errors.append("STUDY-SNAPSHOT.json: deep profile mode is invalid")
    if profile.get("skill") != {"name": "teach-ria", "contractRevision": "teach-ria-v4"}:
        errors.append("STUDY-SNAPSHOT.json: teach-ria Skill pin is invalid")
    if profile.get("sourceRevision") != source.get("revision"):
        errors.append("STUDY-SNAPSHOT.json: profile and source revisions differ")
    if mode == "deep_preprocessed" and (
        profile.get("selectedBy") != "catalog"
        or not profile.get("packageRef")
        or source.get("packageRef") != profile.get("packageRef")
    ):
        errors.append("STUDY-SNAPSHOT.json: preprocessed package identity is invalid")

    reading = source.get("reading")
    ria = source.get("ria")
    if source.get("status") != "ready" or source.get("evidenceLevel") != "certified":
        errors.append("STUDY-SNAPSHOT.json: deep source is not certified and ready")
    if not isinstance(reading, dict) or reading.get("coveragePercent") != 100:
        errors.append("STUDY-SNAPSHOT.json: reading coverage must be 100%")
    elif reading.get("blockedRanges") != [] or not reading.get("certificateRevision"):
        errors.append("STUDY-SNAPSHOT.json: reading certification has gaps or no revision")
    ria_revision = field(read_text(workspace / "source" / "RIA-DISTILLATION.md"), "Revision")
    if not isinstance(ria, dict) or ria.get("status") != "ready" or ria.get("revision") != ria_revision:
        errors.append("STUDY-SNAPSHOT.json: RIA revision is not ready or current")

    questions = mission.get("questionsAsked")
    if mission.get("status") != "ready" or not isinstance(questions, int) or not 2 <= questions <= 4:
        errors.append("STUDY-SNAPSHOT.json: deep Mission requires 2-4 questions")
    if not str(mission.get("summary", "")).strip():
        errors.append("STUDY-SNAPSHOT.json: ready Mission requires a summary")

    blueprint_revision = field(read_text(workspace / "source" / "CURRICULUM-BLUEPRINT.md"), "Revision")
    if plan.get("status") != "ready" or plan.get("revision") != blueprint_revision:
        errors.append("STUDY-SNAPSHOT.json: plan revision is not ready or current")
    if plan.get("basedOnSourceRevision") != source.get("revision") or plan.get("basedOnMissionRevision") != mission.get("revision"):
        errors.append("STUDY-SNAPSHOT.json: plan is based on stale source or Mission evidence")
    if generation.get("status") != "not_started" and generation.get("planRevision") != plan.get("revision"):
        errors.append("STUDY-SNAPSHOT.json: generation points to a stale plan")
    validate_lesson_index(workspace, generation, errors)

    if not isinstance(approvals, list) or len(approvals) < 3:
        errors.append("STUDY-SNAPSHOT.json: deep readiness requires attributable approvals")
    else:
        for index, approval in enumerate(approvals):
            if not isinstance(approval, dict) or approval.get("actor") not in {"user", "auto_policy", "system"}:
                errors.append(f"STUDY-SNAPSHOT.json: approval {index} has an invalid actor")
                continue
            if not all(str(approval.get(key, "")).strip() for key in ("policyRevision", "approvedRevision", "approvedAt")):
                errors.append(f"STUDY-SNAPSHOT.json: approval {index} has incomplete provenance")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=Path.cwd())
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--brief", type=Path, help="Validate one lesson brief before HTML authoring")
    group.add_argument("--lesson", type=Path, help="Validate a lesson and its matching brief")
    args = parser.parse_args()

    workspace = args.workspace.expanduser().resolve()
    if not workspace.is_dir():
        parser.error(f"workspace is not a directory: {workspace}")

    source_dir = workspace / "source"
    errors: list[str] = []
    mission_hash, revision, slice_ids, map_slice_order, ria_unit_ids = validate_blueprint(
        workspace / "MISSION.md",
        source_dir / "BOOK-READING-STATE.md",
        source_dir / "BOOK-OVERVIEW.md",
        source_dir / "RIA-DISTILLATION.md",
        source_dir / "CURRICULUM-BLUEPRINT.md",
        source_dir / "TEACHING-MAP.md",
        errors,
    )
    validate_study_snapshot(workspace, errors)

    if args.brief:
        brief = resolve_workspace_path(workspace, str(args.brief))
        validate_brief(
            workspace,
            brief,
            mission_hash,
            revision,
            slice_ids,
            map_slice_order,
            ria_unit_ids,
            errors,
        )
    elif args.lesson:
        lesson = resolve_workspace_path(workspace, str(args.lesson))
        try:
            relative = lesson.relative_to(workspace).as_posix()
        except ValueError:
            errors.append("candidate lesson must stay inside the course workspace")
        else:
            if not re.fullmatch(
                r"(?:lessons|\.study-drafts)/[A-Za-z0-9][A-Za-z0-9._-]*\.html",
                relative,
            ):
                errors.append("candidate lesson path is unsafe")
            else:
                brief = source_dir / "lesson-briefs" / f"{lesson.stem}.md"
                validate_brief(
                    workspace,
                    brief,
                    mission_hash,
                    revision,
                    slice_ids,
                    map_slice_order,
                    ria_unit_ids,
                    errors,
                )
                validate_lesson(workspace, lesson, brief, errors)

    if errors:
        print("Book-course fidelity check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("Book-course fidelity gates pass.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

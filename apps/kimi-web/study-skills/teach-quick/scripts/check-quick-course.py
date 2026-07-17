#!/usr/bin/env python3
"""Validate Kimi Study quick-mode survey, plan, and product snapshot gates."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return ""


def field(source: str, label: str) -> str:
    match = re.search(rf"^-\s*{re.escape(label)}:\s*(.+?)\s*$", source, re.MULTILINE | re.IGNORECASE)
    return match.group(1).strip() if match else ""


def valid_approval(value: str, revision: str) -> bool:
    match = re.fullmatch(
        r"actor=(user|auto_policy|system);\s*policy=([^;]+);\s*revision=([^;]+);\s*at=(.+)",
        value,
    )
    return bool(match and match.group(2).strip() and match.group(3).strip() == revision and "T" in match.group(4))


def validate(workspace: Path) -> list[str]:
    errors: list[str] = []
    survey_path = workspace / "source/QUICK-SURVEY.md"
    plan_path = workspace / "source/QUICK-PLAN.md"
    snapshot_path = workspace / "source/STUDY-SNAPSHOT.json"
    for path in (workspace / "MISSION.md", survey_path, plan_path, snapshot_path):
        if not path.is_file():
            errors.append(f"missing required file: {path}")
    if errors:
        return errors

    survey = read_text(survey_path)
    survey_revision = field(survey, "Revision")
    source_revision = field(survey, "Source revision")
    coverage = re.search(r"(\d{1,3})", field(survey, "Survey coverage"))
    if field(survey, "Status").lower() != "complete":
        errors.append("QUICK-SURVEY.md: Status must be complete")
    if not coverage or int(coverage.group(1)) != 100:
        errors.append("QUICK-SURVEY.md: Survey coverage must be 100% of inventoried ranges")
    if field(survey, "Evidence level").lower() != "survey":
        errors.append("QUICK-SURVEY.md: Evidence level must be survey")
    if not survey_revision or not source_revision:
        errors.append("QUICK-SURVEY.md: source and survey revisions are required")
    if not valid_approval(field(survey, "Approval provenance"), survey_revision):
        errors.append("QUICK-SURVEY.md: approval provenance is invalid or stale")

    plan = read_text(plan_path)
    plan_revision = field(plan, "Revision")
    if field(plan, "Status").lower() != "ready":
        errors.append("QUICK-PLAN.md: Status must be ready")
    if field(plan, "Source revision") != source_revision:
        errors.append("QUICK-PLAN.md: Source revision is stale")
    if field(plan, "Survey revision") != survey_revision:
        errors.append("QUICK-PLAN.md: Survey revision is stale")
    if not re.fullmatch(r"\d+", field(plan, "Mission revision")):
        errors.append("QUICK-PLAN.md: Mission revision must be an integer")
    if not plan_revision or not valid_approval(field(plan, "Approval provenance"), plan_revision):
        errors.append("QUICK-PLAN.md: approval provenance is invalid or stale")
    checks = re.findall(r"^-\s*\[([ xX])\]", plan, re.MULTILINE)
    if len(checks) < 5 or any(mark.lower() != "x" for mark in checks):
        errors.append("QUICK-PLAN.md: every integrity check must pass")

    try:
        snapshot = json.loads(read_text(snapshot_path))
    except json.JSONDecodeError:
        errors.append("STUDY-SNAPSHOT.json: invalid JSON")
        return errors
    if not isinstance(snapshot, dict):
        return errors + ["STUDY-SNAPSHOT.json: root must be an object"]
    profile = snapshot.get("profile", {})
    source = snapshot.get("source", {})
    mission = snapshot.get("mission", {})
    plan_state = snapshot.get("plan", {})
    if snapshot.get("schemaVersion") != 1 or snapshot.get("contractRevision") != "kimi-study-foundation-v1":
        errors.append("STUDY-SNAPSHOT.json: unsupported product contract")
    if not isinstance(profile, dict) or profile.get("mode") != "quick" or profile.get("skill") != {
        "name": "teach-quick", "contractRevision": "teach-quick-v1"
    }:
        errors.append("STUDY-SNAPSHOT.json: quick profile pin is invalid")
    if not isinstance(source, dict) or source.get("revision") != source_revision:
        errors.append("STUDY-SNAPSHOT.json: source revision does not match survey")
    elif source.get("status") != "ready" or source.get("evidenceLevel") != "survey" or source.get("quickSurveyRevision") != survey_revision:
        errors.append("STUDY-SNAPSHOT.json: quick source evidence is not ready")
    elif "reading" in source or "ria" in source:
        errors.append("STUDY-SNAPSHOT.json: quick mode cannot contain deep evidence")
    if not isinstance(mission, dict) or mission.get("status") != "ready" or not isinstance(mission.get("questionsAsked"), int):
        errors.append("STUDY-SNAPSHOT.json: Mission is not ready")
    elif not 0 <= mission["questionsAsked"] <= 1 or not str(mission.get("summary", "")).strip():
        errors.append("STUDY-SNAPSHOT.json: quick Mission must use 0-1 questions and a summary")
    if not isinstance(plan_state, dict) or plan_state.get("status") != "ready" or plan_state.get("revision") != plan_revision:
        errors.append("STUDY-SNAPSHOT.json: plan revision is not ready")
    elif plan_state.get("basedOnSourceRevision") != source_revision or plan_state.get("basedOnMissionRevision") != mission.get("revision"):
        errors.append("STUDY-SNAPSHOT.json: plan is based on stale evidence")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=Path.cwd())
    args = parser.parse_args()
    workspace = args.workspace.expanduser().resolve()
    errors = validate(workspace)
    if errors:
        print("Quick-course gate failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("Quick-course gates pass.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

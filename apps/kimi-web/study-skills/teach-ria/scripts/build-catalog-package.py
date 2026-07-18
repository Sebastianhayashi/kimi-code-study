#!/usr/bin/env python3
"""Build a content-addressed, source-only Kimi Study catalog package manifest."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


CHECKER_PATH = Path(__file__).resolve().parent / "check-book-course.py"
SPEC = importlib.util.spec_from_file_location("check_book_course", CHECKER_PATH)
CHECKER = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(CHECKER)

MATERIAL_ID = re.compile(r"^[a-z0-9][a-z0-9/_-]{2,100}$")
REQUIRED_ARTIFACTS = (
    "source/BOOK-READING-STATE.md",
    "source/BOOK-OVERVIEW.md",
    "source/RIA-DISTILLATION.md",
    "source/ria/INDEX.md",
)


def digest_bytes(data: bytes) -> str:
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def digest_file(path: Path) -> str:
    return digest_bytes(path.read_bytes())


def parse_approval(value: str) -> dict[str, str] | None:
    match = CHECKER.APPROVAL_PATTERN.fullmatch(value.strip())
    if not match or not CHECKER.valid_approval(value):
        return None
    return {
        "actor": match.group(1),
        "policyRevision": match.group(2).strip(),
        "approvedRevision": match.group(3).strip(),
        "approvedAt": match.group(4).strip(),
    }


def build_manifest(workspace: Path, material_id: str, title: str) -> tuple[dict[str, object] | None, list[str]]:
    errors: list[str] = []
    state_path = workspace / "source/BOOK-READING-STATE.md"
    overview_path = workspace / "source/BOOK-OVERVIEW.md"
    distillation_path = workspace / "source/RIA-DISTILLATION.md"
    index_path = workspace / "source/ria/INDEX.md"
    for path in (state_path, overview_path, distillation_path, index_path):
        if not path.is_file():
            errors.append(f"missing required file: {path}")
    if not MATERIAL_ID.fullmatch(material_id):
        errors.append("material id must use lowercase letters, digits, slash, underscore, or dash")
    if not title.strip():
        errors.append("title is required")
    if errors:
        return None, errors

    state = CHECKER.read_text(state_path)
    coverage = re.search(r"(\d{1,3})", CHECKER.field(state, "Coverage"))
    if not coverage or int(coverage.group(1)) != 100:
        errors.append("BOOK-READING-STATE.md: Coverage must be 100%")
    if CHECKER.field(state, "Unresolved gaps").strip().lower() not in {"none", "无"}:
        errors.append("BOOK-READING-STATE.md: Unresolved gaps must be none")
    if CHECKER.field(state, "Whole-book overview").lower() != "complete":
        errors.append("BOOK-READING-STATE.md: Whole-book overview must be complete")
    reading_revision = CHECKER.field(state, "Reading certificate revision")
    overview_approval = parse_approval(CHECKER.field(state, "Overview approval"))
    if not reading_revision or overview_approval is None or overview_approval["approvedRevision"] != reading_revision:
        errors.append("BOOK-READING-STATE.md: overview approval is missing or stale")

    ria_revision, _ = CHECKER.validate_ria_distillation(
        workspace, state, distillation_path, errors
    )
    ria_approval = parse_approval(CHECKER.field(state, "RIA approval"))
    if ria_approval is None or ria_approval["approvedRevision"] != ria_revision:
        errors.append("BOOK-READING-STATE.md: RIA approval is missing or stale")

    source_value = CHECKER.field(state, "File")
    source_path = CHECKER.resolve_workspace_path(workspace, source_value) if source_value else workspace / "missing"
    if not source_path.is_file():
        errors.append(f"source file does not exist: {source_value}")
    if errors:
        return None, errors

    artifacts = {relative: digest_file(workspace / relative) for relative in REQUIRED_ARTIFACTS}
    payload: dict[str, object] = {
        "schemaVersion": 1,
        "contractRevision": "kimi-study-package-v1",
        "materialId": material_id,
        "title": title.strip(),
        "sourceRevision": digest_file(source_path),
        "reading": {
            "coveragePercent": 100,
            "blockedRanges": [],
            "certificateRevision": reading_revision,
        },
        "ria": {"status": "ready", "revision": ria_revision},
        "artifacts": artifacts,
        "approvals": [overview_approval, ria_approval],
    }
    author = CHECKER.field(state, "Author")
    edition = CHECKER.field(state, "Edition/year")
    if author:
        payload["author"] = author
    if edition:
        payload["edition"] = edition
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    package_revision = digest_bytes(canonical)
    payload["packageRevision"] = package_revision
    payload["packageRef"] = f"catalog://{material_id}@{package_revision}"
    payload["builtAt"] = datetime.now(timezone.utc).isoformat()
    return payload, []


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--material-id", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    workspace = args.workspace.expanduser().resolve()
    manifest, errors = build_manifest(workspace, args.material_id, args.title)
    if errors or manifest is None:
        print("Catalog package build failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    output = args.output.expanduser().resolve() if args.output else workspace / "source/STUDY-PACKAGE.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

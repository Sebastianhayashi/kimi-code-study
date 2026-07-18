#!/usr/bin/env python3
"""Build a deterministic, installable Kimi Study ``*.kstudy.zip`` package."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import mimetypes
import re
import stat
import sys
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any


CHECKER_PATH = Path(__file__).resolve().parent / "check-book-course.py"
SPEC = importlib.util.spec_from_file_location("check_book_course", CHECKER_PATH)
CHECKER = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(CHECKER)

MATERIAL_ID = re.compile(r"^[a-z0-9][a-z0-9._/-]{1,99}[a-z0-9]$")
SHA256 = re.compile(r"^[a-f0-9]{64}$")
REQUIRED_ARTIFACTS = (
    "source/BOOK-READING-STATE.md",
    "source/BOOK-OVERVIEW.md",
    "source/RIA-DISTILLATION.md",
    "source/ria/INDEX.md",
)
FORBIDDEN_PATHS = {
    "mission.md",
    "source/curriculum-blueprint.md",
    "source/teaching-map.md",
}
FORBIDDEN_SEGMENTS = {"lesson-briefs", "lessons", "learning-records"}
METADATA_REQUIRED = {
    "materialId",
    "materialKind",
    "title",
    "authors",
    "language",
    "topics",
    "description",
    "searchAliases",
}
METADATA_ALLOWED = METADATA_REQUIRED | {
    "subtitle",
    "publisher",
    "edition",
    "publicationYear",
    "isbn",
    "cover",
    "country",
    "educationStage",
    "grade",
    "subject",
    "semester",
    "curriculumStandard",
    "editionLabel",
}
RIGHTS_REQUIRED = {
    "source",
    "rightsHolder",
    "licenseType",
    "allowedTerritories",
    "sourceBytesMayBeStored",
    "sourceTextMayBeDisplayed",
    "derivativeCoursesAllowed",
    "coverMayBeDisplayed",
    "attributionRequired",
}
RIGHTS_ALLOWED = RIGHTS_REQUIRED | {"validUntil", "attributionText"}
IDENTITY_EXCLUDED = {"packageRevision", "packageRef", "builtAt", "signature", "signatures"}
FIXED_ZIP_TIME = (1980, 1, 1, 0, 0, 0)


def digest_bytes(data: bytes) -> str:
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def raw_digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def digest_file(path: Path) -> str:
    return digest_bytes(path.read_bytes())


def parse_json_object(path: Path, label: str, errors: list[str]) -> dict[str, Any] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        errors.append(f"{label} is not valid UTF-8 JSON: {error}")
        return None
    if not isinstance(value, dict):
        errors.append(f"{label} must be a JSON object")
        return None
    return value


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


def validate_material_id(value: str) -> bool:
    return bool(MATERIAL_ID.fullmatch(value)) and ".." not in value and "//" not in value and "@" not in value


def validate_string_array(value: object, *, allow_empty: bool) -> bool:
    return (
        isinstance(value, list)
        and (allow_empty or len(value) > 0)
        and all(isinstance(item, str) and bool(item.strip()) for item in value)
    )


def validate_metadata(
    metadata: dict[str, Any] | None,
    material_id: str,
    title: str,
    errors: list[str],
) -> None:
    if metadata is None:
        return
    missing = sorted(METADATA_REQUIRED - metadata.keys())
    unknown = sorted(metadata.keys() - METADATA_ALLOWED)
    if missing:
        errors.append(f"CATALOG-METADATA.json missing fields: {', '.join(missing)}")
    if unknown:
        errors.append(f"CATALOG-METADATA.json has unsupported fields: {', '.join(unknown)}")
    if metadata.get("materialId") != material_id:
        errors.append("CATALOG-METADATA.json materialId does not match --material-id")
    if metadata.get("title") != title.strip():
        errors.append("CATALOG-METADATA.json title does not match --title")
    if metadata.get("materialKind") not in {"textbook", "book"}:
        errors.append("CATALOG-METADATA.json materialKind must be textbook or book")
    if not validate_string_array(metadata.get("authors"), allow_empty=False):
        errors.append("CATALOG-METADATA.json authors must be a non-empty string array")
    if not validate_string_array(metadata.get("topics"), allow_empty=True):
        errors.append("CATALOG-METADATA.json topics must be a string array")
    if not validate_string_array(metadata.get("searchAliases"), allow_empty=True):
        errors.append("CATALOG-METADATA.json searchAliases must be a string array")
    for field in ("language", "description"):
        if not isinstance(metadata.get(field), str) or not metadata[field].strip():
            errors.append(f"CATALOG-METADATA.json {field} must be a non-empty string")
    year = metadata.get("publicationYear")
    if year is not None and (not isinstance(year, int) or isinstance(year, bool) or not 1000 <= year <= 9999):
        errors.append("CATALOG-METADATA.json publicationYear must be a four-digit integer")
    cover = metadata.get("cover")
    if cover is not None:
        if not isinstance(cover, dict) or set(cover) != {"path", "mediaType"}:
            errors.append("CATALOG-METADATA.json cover must contain only path and mediaType")
        elif not isinstance(cover.get("path"), str) or not cover["path"].startswith("source/assets/"):
            errors.append("CATALOG-METADATA.json cover path must be under source/assets/")
        elif not isinstance(cover.get("mediaType"), str) or not cover["mediaType"].startswith("image/"):
            errors.append("CATALOG-METADATA.json cover mediaType must be image/*")


def validate_rights(rights: dict[str, Any] | None, errors: list[str]) -> None:
    if rights is None:
        return
    missing = sorted(RIGHTS_REQUIRED - rights.keys())
    unknown = sorted(rights.keys() - RIGHTS_ALLOWED)
    if missing:
        errors.append(f"RIGHTS.json missing fields: {', '.join(missing)}")
    if unknown:
        errors.append(f"RIGHTS.json has unsupported fields: {', '.join(unknown)}")
    for field in ("source", "rightsHolder", "licenseType"):
        if not isinstance(rights.get(field), str) or not rights[field].strip():
            errors.append(f"RIGHTS.json {field} must be a non-empty string")
    if not validate_string_array(rights.get("allowedTerritories"), allow_empty=False):
        errors.append("RIGHTS.json allowedTerritories must be a non-empty string array")
    for field in (
        "sourceBytesMayBeStored",
        "sourceTextMayBeDisplayed",
        "derivativeCoursesAllowed",
        "coverMayBeDisplayed",
        "attributionRequired",
    ):
        if not isinstance(rights.get(field), bool):
            errors.append(f"RIGHTS.json {field} must be boolean")
    if rights.get("sourceBytesMayBeStored") is not True:
        errors.append("RIGHTS.json does not allow source bytes to be stored")
    if rights.get("derivativeCoursesAllowed") is not True:
        errors.append("RIGHTS.json does not allow derivative courses")
    if rights.get("attributionRequired") is True and not str(rights.get("attributionText", "")).strip():
        errors.append("RIGHTS.json attributionText is required when attributionRequired is true")
    valid_until = rights.get("validUntil")
    if valid_until is not None:
        try:
            expiry = date.fromisoformat(valid_until) if isinstance(valid_until, str) else None
        except ValueError:
            expiry = None
        if expiry is None:
            errors.append("RIGHTS.json validUntil must be an ISO date")
        elif expiry < datetime.now(timezone.utc).date():
            errors.append("RIGHTS.json rights grant has expired")


def is_forbidden(relative: str) -> bool:
    folded = relative.casefold()
    if folded in FORBIDDEN_PATHS:
        return True
    return any(segment.casefold() in FORBIDDEN_SEGMENTS for segment in Path(relative).parts)


def collect_source_files(workspace: Path, errors: list[str]) -> dict[str, bytes]:
    source_root = workspace / "source"
    files: dict[str, bytes] = {}
    if not source_root.is_dir():
        errors.append("missing source/ directory")
        return files
    for path in sorted(source_root.rglob("*"), key=lambda item: item.as_posix().encode("utf-8")):
        if path.is_symlink():
            errors.append(f"source package cannot contain symlink: {path}")
            continue
        if path.is_dir():
            continue
        if not path.is_file():
            errors.append(f"source package contains a non-regular file: {path}")
            continue
        relative = path.relative_to(workspace).as_posix()
        if relative == "source/STUDY-PACKAGE.json":
            continue
        if relative != relative.encode("utf-8").decode("utf-8") or "\\" in relative:
            errors.append(f"source package path is not portable: {relative}")
            continue
        if is_forbidden(relative):
            errors.append(f"source-only package contains forbidden user/course artifact: {relative}")
            continue
        files[relative] = path.read_bytes()
    for top_level in ("MISSION.md", "lessons", "learning-records"):
        if (workspace / top_level).exists():
            errors.append(f"source-only package contains forbidden user/course artifact: {top_level}")
    return files


def role_for(path: str) -> str:
    if path == "source/CATALOG-METADATA.json":
        return "catalog-metadata"
    if path == "source/RIGHTS.json":
        return "rights"
    if path == "source/BOOK-READING-STATE.md":
        return "reading-state"
    if path == "source/BOOK-OVERVIEW.md":
        return "reading-overview"
    if path == "source/RIA-DISTILLATION.md":
        return "ria-distillation"
    if path.startswith("source/original/"):
        return "original-source"
    if path.startswith("source/assets/"):
        return "cover" if "/cover." in path.casefold() else "source-asset"
    if path.startswith("source/ria/"):
        return "ria-artifact"
    return "source-artifact"


def descriptor(path: str, data: bytes, role: str | None = None, media_type: str | None = None) -> dict[str, object]:
    detected = media_type or mimetypes.guess_type(path)[0]
    result: dict[str, object] = {
        "path": path,
        "size": len(data),
        "sha256": raw_digest(data),
        "role": role or role_for(path),
    }
    if detected:
        result["mediaType"] = detected
    return result


def canonical_manifest_bytes(manifest: dict[str, object]) -> bytes:
    identity = {key: value for key, value in manifest.items() if key not in IDENTITY_EXCLUDED}
    return json.dumps(
        identity,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def _build_package(
    workspace: Path,
    material_id: str,
    title: str,
    *,
    built_at: str | None = None,
) -> tuple[dict[str, object] | None, dict[str, bytes], list[str]]:
    workspace = workspace.resolve()
    errors: list[str] = []
    if not validate_material_id(material_id):
        errors.append("material id must be a safe lowercase catalog identifier")
    if not title.strip():
        errors.append("title is required")

    state_path = workspace / "source/BOOK-READING-STATE.md"
    overview_path = workspace / "source/BOOK-OVERVIEW.md"
    distillation_path = workspace / "source/RIA-DISTILLATION.md"
    index_path = workspace / "source/ria/INDEX.md"
    metadata_path = workspace / "source/CATALOG-METADATA.json"
    rights_path = workspace / "source/RIGHTS.json"
    for path in (state_path, overview_path, distillation_path, index_path, metadata_path, rights_path):
        if not path.is_file():
            errors.append(f"missing required file: {path}")

    metadata = parse_json_object(metadata_path, "CATALOG-METADATA.json", errors) if metadata_path.is_file() else None
    rights = parse_json_object(rights_path, "RIGHTS.json", errors) if rights_path.is_file() else None
    validate_metadata(metadata, material_id, title, errors)
    validate_rights(rights, errors)
    if errors and (not state_path.is_file() or not distillation_path.is_file()):
        return None, {}, errors

    state = CHECKER.read_text(state_path) if state_path.is_file() else ""
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

    ria_revision, _ = CHECKER.validate_ria_distillation(workspace, state, distillation_path, errors)
    ria_approval = parse_approval(CHECKER.field(state, "RIA approval"))
    if ria_approval is None or ria_approval["approvedRevision"] != ria_revision:
        errors.append("BOOK-READING-STATE.md: RIA approval is missing or stale")

    source_value = CHECKER.field(state, "File")
    source_path = CHECKER.resolve_workspace_path(workspace, source_value) if source_value else workspace / "missing"
    source_root = (workspace / "source/original").resolve()
    try:
        source_path.resolve().relative_to(source_root)
    except (OSError, ValueError):
        errors.append("BOOK-READING-STATE.md: File must be under source/original/ for a v2 package")
    if not source_path.is_file() or source_path.is_symlink():
        errors.append(f"source file does not exist or is not regular: {source_value}")

    files = collect_source_files(workspace, errors)
    for required in (*REQUIRED_ARTIFACTS, "source/CATALOG-METADATA.json", "source/RIGHTS.json"):
        if required not in files:
            errors.append(f"package inventory is missing required file: {required}")
    source_relative = source_path.relative_to(workspace).as_posix() if source_path.is_file() else ""
    if source_relative not in files:
        errors.append("package inventory is missing the original source file")

    cover_descriptor: dict[str, object] | None = None
    if metadata is not None and isinstance(metadata.get("cover"), dict):
        cover_path = metadata["cover"].get("path")
        if isinstance(cover_path, str) and cover_path in files:
            cover_descriptor = descriptor(
                cover_path,
                files[cover_path],
                "cover",
                metadata["cover"].get("mediaType") if isinstance(metadata["cover"].get("mediaType"), str) else None,
            )
        else:
            errors.append("declared cover file is missing")
    if rights is not None and cover_descriptor is not None and rights.get("coverMayBeDisplayed") is not True:
        cover_descriptor = None

    if errors or metadata is None or rights is None or overview_approval is None or ria_approval is None:
        return None, files, errors

    inventory = [descriptor(path, data) for path, data in sorted(files.items(), key=lambda item: item[0].encode("utf-8"))]
    by_path = {item["path"]: item for item in inventory}
    payload: dict[str, object] = {
        "schemaVersion": 2,
        "contractRevision": "kimi-study-package-v2",
        "materialId": material_id,
        "materialKind": metadata["materialKind"],
        "title": title.strip(),
        "authors": metadata["authors"],
        "language": metadata["language"],
        "topics": metadata["topics"],
        "source": by_path[source_relative],
        "metadata": by_path["source/CATALOG-METADATA.json"],
        "rights": by_path["source/RIGHTS.json"],
        "reading": {
            "coveragePercent": 100,
            "blockedRanges": [],
            "certificateRevision": reading_revision,
        },
        "ria": {"status": "complete", "revision": ria_revision},
        "approvals": [overview_approval, ria_approval],
        "files": inventory,
    }
    for field in ("subtitle", "publisher", "edition", "publicationYear", "isbn"):
        if field in metadata:
            payload[field] = metadata[field]
    if cover_descriptor is not None:
        payload["cover"] = cover_descriptor
    package_revision = digest_bytes(canonical_manifest_bytes(payload))
    payload["packageRevision"] = package_revision
    payload["packageRef"] = f"catalog://{material_id}@{package_revision}"
    payload["builtAt"] = built_at or datetime.now(timezone.utc).isoformat()
    return payload, files, []


def build_manifest(
    workspace: Path,
    material_id: str,
    title: str,
    *,
    built_at: str | None = None,
) -> tuple[dict[str, object] | None, list[str]]:
    manifest, _files, errors = _build_package(workspace, material_id, title, built_at=built_at)
    return manifest, errors


def write_package_archive(output: Path, manifest: dict[str, object], files: dict[str, bytes]) -> None:
    manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")
    entries = {"source/STUDY-PACKAGE.json": manifest_bytes, **files}
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9, strict_timestamps=True) as archive:
        for path, data in sorted(entries.items(), key=lambda item: item[0].encode("utf-8")):
            info = zipfile.ZipInfo(path, FIXED_ZIP_TIME)
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            info.flag_bits |= 0x800
            archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def safe_slug(material_id: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", material_id).strip("-") or "material"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--material-id", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    workspace = args.workspace.expanduser().resolve()
    manifest, files, errors = _build_package(workspace, args.material_id, args.title)
    if errors or manifest is None:
        print("Catalog package build failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    output = args.output.expanduser().resolve() if args.output else workspace / f"{safe_slug(args.material_id)}.kstudy.zip"
    write_package_archive(output, manifest, files)
    print(f"Wrote {output}")
    print(f"Package reference: {manifest['packageRef']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

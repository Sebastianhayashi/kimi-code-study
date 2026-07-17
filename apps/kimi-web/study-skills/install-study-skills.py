#!/usr/bin/env python3
"""Install versioned Kimi Study skills without overwriting an unknown target."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path


SKILL_NAMES = ("teach-quick", "teach-ria")
IGNORED_NAMES = {"__pycache__", ".DS_Store"}


def relative_files(root: Path) -> list[Path]:
    return sorted(
        path.relative_to(root)
        for path in root.rglob("*")
        if path.is_file()
        and not any(part in IGNORED_NAMES for part in path.relative_to(root).parts)
        and path.suffix != ".pyc"
    )


def tree_digest(root: Path) -> str:
    digest = hashlib.sha256()
    for relative in relative_files(root):
        digest.update(relative.as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update((root / relative).read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def validate_source(source: Path, expected_name: str) -> None:
    contract_path = source / "CONTRACT.json"
    skill_path = source / "SKILL.md"
    if not contract_path.is_file() or not skill_path.is_file():
        raise RuntimeError(f"{expected_name}: missing CONTRACT.json or SKILL.md")
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    if contract.get("name") != expected_name:
        raise RuntimeError(f"{expected_name}: contract name mismatch")
    revision = contract.get("contractRevision")
    skill = skill_path.read_text(encoding="utf-8")
    if f"name: {expected_name}" not in skill or f"[contract:{revision}]" not in skill:
        raise RuntimeError(f"{expected_name}: SKILL.md does not advertise its contract revision")


def install_skill(source: Path, target: Path, replace: bool) -> str:
    expected = tree_digest(source)
    if target.exists() and target.is_dir() and tree_digest(target) == expected:
        return "current"
    if target.exists() and not replace:
        raise RuntimeError(f"refusing to overwrite mismatched skill: {target}")

    target.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{target.name}.staging-", dir=target.parent))
    backup: Path | None = None
    try:
        shutil.copytree(source, staging, dirs_exist_ok=True)
        if tree_digest(staging) != expected:
            raise RuntimeError(f"staged copy verification failed: {source}")
        if target.exists():
            backup = target.with_name(f".{target.name}.backup-{tree_digest(target)[:12]}")
            if backup.exists():
                raise RuntimeError(f"backup already exists: {backup}")
            os.replace(target, backup)
        os.replace(staging, target)
    except Exception:
        if backup is not None and backup.exists() and not target.exists():
            os.replace(backup, target)
        raise
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    return f"installed:{expected[:12]}"


def check_skill(source: Path, target: Path) -> bool:
    return target.is_dir() and tree_digest(source) == tree_digest(target)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--install", action="store_true")
    action.add_argument("--check", action="store_true")
    parser.add_argument("--replace", action="store_true", help="Back up and atomically replace mismatched skills")
    parser.add_argument("--destination", type=Path, default=Path.home() / ".agents" / "skills")
    args = parser.parse_args()
    if args.replace and not args.install:
        parser.error("--replace requires --install")

    source_root = Path(__file__).resolve().parent
    destination = args.destination.expanduser().resolve()
    failures = 0
    for name in SKILL_NAMES:
        source = source_root / name
        target = destination / name
        try:
            validate_source(source, name)
            if args.check:
                current = check_skill(source, target)
                print(f"{name}: {'current' if current else 'missing-or-mismatched'}")
                failures += 0 if current else 1
            else:
                print(f"{name}: {install_skill(source, target, args.replace)}")
        except (OSError, RuntimeError, json.JSONDecodeError) as error:
            failures += 1
            print(f"{name}: {error}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())

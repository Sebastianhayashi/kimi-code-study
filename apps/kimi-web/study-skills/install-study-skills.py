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


def skill_work_root(skills_destination: Path) -> Path:
    """Sibling of the skills root so discovery never scans install work products.

    target layout is ``<destination>/<skill-name>``; work lives at
    ``<destination.parent>/.kimi-study-skill-work`` (same filesystem as destination).
    """
    work = skills_destination.resolve().parent / ".kimi-study-skill-work"
    work.mkdir(mode=0o700, parents=True, exist_ok=True)
    return work


def assert_backup_outside_discovery(backup_dir: Path, skills_destination: Path) -> None:
    """Refuse backup paths that sit inside the skill discovery root."""
    dest = skills_destination.resolve()
    backup = backup_dir.expanduser().resolve()
    try:
        backup.relative_to(dest)
    except ValueError:
        return
    raise RuntimeError(
        f"backup-dir must not be inside the skill discovery root ({dest}): {backup}"
    )


def install_skill(
    source: Path,
    target: Path,
    replace: bool,
    *,
    backup_dir: Path | None = None,
) -> str:
    expected = tree_digest(source)
    if target.exists() and target.is_dir() and tree_digest(target) == expected:
        return "current"
    if target.exists() and not replace:
        raise RuntimeError(f"refusing to overwrite mismatched skill: {target}")

    skills_destination = target.parent
    skills_destination.mkdir(parents=True, exist_ok=True)
    work = skill_work_root(skills_destination)

    staging = Path(tempfile.mkdtemp(prefix=f"staging-{target.name}-", dir=work))
    backup: Path | None = None
    ephemeral_backup_root: Path | None = None
    staging_promoted = False
    installed = False
    try:
        # copytree requires dest to not exist; mkdtemp created an empty dir.
        shutil.rmtree(staging)
        shutil.copytree(source, staging)
        if tree_digest(staging) != expected:
            raise RuntimeError(f"staged copy verification failed: {source}")

        if target.exists():
            if backup_dir is not None:
                assert_backup_outside_discovery(backup_dir, skills_destination)
                keep = backup_dir.expanduser().resolve()
                keep.mkdir(parents=True, exist_ok=True)
                backup = keep / f"{target.name}.backup-{tree_digest(target)[:12]}"
            else:
                # Ephemeral rollback copy — outside the skills root; deleted after success.
                ephemeral_backup_root = Path(
                    tempfile.mkdtemp(prefix=f"backup-{target.name}-", dir=work),
                )
                backup = ephemeral_backup_root / target.name
            if backup.exists():
                raise RuntimeError(f"backup already exists: {backup}")
            os.replace(target, backup)

        os.replace(staging, target)
        staging_promoted = True
        installed = True
    except Exception:
        if backup is not None and backup.exists() and not target.exists():
            os.replace(backup, target)
        raise
    finally:
        if not staging_promoted and staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        # After a successful replace, drop the ephemeral old skill so discovery
        # can never see it (durable backups only live under --backup-dir).
        if installed and ephemeral_backup_root is not None:
            shutil.rmtree(ephemeral_backup_root, ignore_errors=True)
        elif not installed and ephemeral_backup_root is not None:
            # Restore already moved backup out; remove empty/leftover work dir.
            if backup is None or not backup.exists():
                shutil.rmtree(ephemeral_backup_root, ignore_errors=True)

    return f"installed:{expected[:12]}"


def check_skill(source: Path, target: Path) -> bool:
    return target.is_dir() and tree_digest(source) == tree_digest(target)


def discover_skill_md_paths(destination: Path) -> list[Path]:
    """Recursive SKILL.md discovery under a destination (mirrors server scan)."""
    if not destination.is_dir():
        return []
    return sorted(destination.rglob("SKILL.md"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--install", action="store_true")
    action.add_argument("--check", action="store_true")
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Atomically replace mismatched skills (rollback copy is outside the skills root)",
    )
    parser.add_argument(
        "--backup-dir",
        type=Path,
        default=None,
        help=(
            "Optional durable backup directory. Must NOT be inside --destination. "
            "When omitted, the previous skill is discarded after a successful replace."
        ),
    )
    parser.add_argument("--destination", type=Path, default=Path.home() / ".agents" / "skills")
    args = parser.parse_args()
    if args.replace and not args.install:
        parser.error("--replace requires --install")
    if args.backup_dir is not None and not args.install:
        parser.error("--backup-dir requires --install")

    source_root = Path(__file__).resolve().parent
    destination = args.destination.expanduser().resolve()
    if args.backup_dir is not None:
        assert_backup_outside_discovery(args.backup_dir, destination)

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
                print(
                    f"{name}: {install_skill(source, target, args.replace, backup_dir=args.backup_dir)}"
                )
        except (OSError, RuntimeError, json.JSONDecodeError) as error:
            failures += 1
            print(f"{name}: {error}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())

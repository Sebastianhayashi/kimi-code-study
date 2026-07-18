from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parent / "install-study-skills.py"
SPEC = importlib.util.spec_from_file_location("install_study_skills", MODULE_PATH)
INSTALLER = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(INSTALLER)


def write_minimal_skill(root: Path, name: str = "teach-quick", revision: str = "teach-quick-v2") -> Path:
    skill = root / name
    skill.mkdir(parents=True)
    (skill / "CONTRACT.json").write_text(
        json.dumps(
            {
                "name": name,
                "contractRevision": revision,
                "productContractRevision": "kimi-study-foundation-v1",
            }
        )
        + "\n",
        encoding="utf-8",
    )
    (skill / "SKILL.md").write_text(
        f'---\nname: {name}\ndescription: "[contract:{revision}] Test skill."\n---\n\n# {name}\n',
        encoding="utf-8",
    )
    return skill


class SkillInstallerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.destination = self.root / "skills"
        self.target = self.destination / "teach-quick"
        self.source.mkdir()
        (self.source / "SKILL.md").write_text("content\n", encoding="utf-8")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_install_is_verified_and_idempotent(self) -> None:
        self.assertTrue(INSTALLER.install_skill(self.source, self.target, False).startswith("installed:"))
        self.assertEqual(INSTALLER.install_skill(self.source, self.target, False), "current")
        self.assertTrue(INSTALLER.check_skill(self.source, self.target))

    def test_mismatch_is_not_overwritten_by_default(self) -> None:
        INSTALLER.install_skill(self.source, self.target, False)
        (self.target / "SKILL.md").write_text("different\n", encoding="utf-8")
        with self.assertRaisesRegex(RuntimeError, "refusing to overwrite"):
            INSTALLER.install_skill(self.source, self.target, False)

    def test_replace_leaves_no_backup_under_destination(self) -> None:
        INSTALLER.install_skill(self.source, self.target, False)
        (self.target / "SKILL.md").write_text("old\n", encoding="utf-8")
        (self.source / "SKILL.md").write_text("new\n", encoding="utf-8")
        INSTALLER.install_skill(self.source, self.target, True)

        self.assertEqual((self.target / "SKILL.md").read_text(encoding="utf-8"), "new\n")
        leftovers = [
            path
            for path in self.destination.rglob("*")
            if path.is_dir() and "backup" in path.name.lower()
        ]
        self.assertEqual(leftovers, [], f"discoverable backups under destination: {leftovers}")
        # No .backup-* entries of any kind under the skills root
        self.assertEqual(
            [p for p in self.destination.rglob("*") if "backup" in p.name.lower()],
            [],
        )

    def test_failed_replace_restores_previous_skill(self) -> None:
        INSTALLER.install_skill(self.source, self.target, False)
        (self.target / "SKILL.md").write_text("stable\n", encoding="utf-8")
        original_digest = INSTALLER.tree_digest(self.target)

        # Break staging by making copytree source unreadable after first install path —
        # inject a bad tree_digest mismatch: put a file then make install_skill see
        # a source that cannot stage (empty source dir fails relative_files empty ok).
        # Simulate failure after moving target to backup by patching os.replace.
        calls: list[tuple] = []
        real_replace = INSTALLER.os.replace

        def flaky_replace(src: Path | str, dst: Path | str) -> None:
            calls.append((Path(src), Path(dst)))
            # First replace: target -> backup (ok). Second: staging -> target (fail).
            # Third replace (backup restore) must succeed.
            if len(calls) == 2:
                raise OSError("simulated staging promotion failure")
            return real_replace(src, dst)

        INSTALLER.os.replace = flaky_replace  # type: ignore[method-assign]
        try:
            (self.source / "SKILL.md").write_text("should-not-land\n", encoding="utf-8")
            with self.assertRaises(OSError):
                INSTALLER.install_skill(self.source, self.target, True)
        finally:
            INSTALLER.os.replace = real_replace  # type: ignore[method-assign]

        self.assertTrue(self.target.is_dir())
        self.assertEqual((self.target / "SKILL.md").read_text(encoding="utf-8"), "stable\n")
        self.assertEqual(INSTALLER.tree_digest(self.target), original_digest)

    def test_recursive_skill_md_scan_only_current_skill(self) -> None:
        write_minimal_skill(self.destination, "teach-quick", "teach-quick-v2")
        # Simulate old installer pollution — must not be recreated by new installer,
        # and a destination scan after clean install must not see backups.
        pollution = self.destination / ".teach-quick.backup-deadbeef"
        pollution.mkdir()
        (pollution / "SKILL.md").write_text(
            '---\nname: teach-quick\ndescription: "[contract:teach-quick-v1] old"\n---\n',
            encoding="utf-8",
        )
        # Clean install with replace from a proper source should not create new
        # backups under destination; remove pollution as operators should.
        source = write_minimal_skill(self.root / "src2", "teach-quick", "teach-quick-v2")
        # First remove pollution (operator step) then install
        shutil_rm = __import__("shutil").rmtree
        shutil_rm(pollution)
        INSTALLER.install_skill(source, self.target, True)
        found = INSTALLER.discover_skill_md_paths(self.destination)
        self.assertEqual(found, [self.target / "SKILL.md"])
        text = found[0].read_text(encoding="utf-8")
        self.assertIn("[contract:teach-quick-v2]", text)
        self.assertNotIn("[contract:teach-quick-v1]", text)

    def test_explicit_backup_dir_outside_destination_kept(self) -> None:
        INSTALLER.install_skill(self.source, self.target, False)
        (self.target / "SKILL.md").write_text("v1\n", encoding="utf-8")
        (self.source / "SKILL.md").write_text("v2\n", encoding="utf-8")
        backup_dir = self.root / "durable-backups"
        INSTALLER.install_skill(self.source, self.target, True, backup_dir=backup_dir)
        self.assertEqual((self.target / "SKILL.md").read_text(encoding="utf-8"), "v2\n")
        backups = list(backup_dir.glob("teach-quick.backup-*"))
        self.assertEqual(len(backups), 1)
        self.assertEqual((backups[0] / "SKILL.md").read_text(encoding="utf-8"), "v1\n")
        # Still nothing under destination named backup
        self.assertEqual(
            [p for p in self.destination.rglob("*") if "backup" in p.name.lower()],
            [],
        )

    def test_backup_dir_inside_destination_rejected(self) -> None:
        INSTALLER.install_skill(self.source, self.target, False)
        (self.source / "SKILL.md").write_text("v2\n", encoding="utf-8")
        with self.assertRaisesRegex(RuntimeError, "backup-dir must not be inside"):
            INSTALLER.install_skill(
                self.source,
                self.target,
                True,
                backup_dir=self.destination / "sneaky-backups",
            )

    def test_install_replace_check_idempotent_loop(self) -> None:
        source = write_minimal_skill(self.root / "pack", "teach-quick", "teach-quick-v2")
        target = self.destination / "teach-quick"
        for _ in range(3):
            result = INSTALLER.install_skill(source, target, True)
            self.assertTrue(result.startswith("installed:") or result == "current")
            self.assertTrue(INSTALLER.check_skill(source, target))
        # second loop should all be current
        self.assertEqual(INSTALLER.install_skill(source, target, True), "current")
        self.assertEqual(INSTALLER.discover_skill_md_paths(self.destination), [target / "SKILL.md"])


if __name__ == "__main__":
    unittest.main()

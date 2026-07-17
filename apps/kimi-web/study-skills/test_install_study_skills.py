from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parent / "install-study-skills.py"
SPEC = importlib.util.spec_from_file_location("install_study_skills", MODULE_PATH)
INSTALLER = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(INSTALLER)


class SkillInstallerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.target = self.root / "skills" / "teach-quick"
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


if __name__ == "__main__":
    unittest.main()

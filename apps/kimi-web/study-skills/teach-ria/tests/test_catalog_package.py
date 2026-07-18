from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts/build-catalog-package.py"
SPEC = importlib.util.spec_from_file_location("build_catalog_package", MODULE_PATH)
PACKAGE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(PACKAGE)


class CatalogPackageTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.workspace = Path(self.temp.name)
        (self.workspace / "source/ria").mkdir(parents=True)
        (self.workspace / "book.pdf").write_bytes(b"book bytes")
        approval_reading = "actor=auto_policy; policy=kimi-study-auto-v1; revision=read-v1; at=2026-07-17T00:00:00Z"
        approval_ria = "actor=auto_policy; policy=kimi-study-auto-v1; revision=ria-v1; at=2026-07-17T00:00:00Z"
        (self.workspace / "source/BOOK-READING-STATE.md").write_text(
            f"""# State
- File: book.pdf
- Author: Example Author
- Edition/year: 2026
- Coverage: 100%
- Unresolved gaps: none
- Whole-book overview: complete
- Reading certificate revision: read-v1
- Overview approval: {approval_reading}
- RIA distillation: complete
- RIA approval: {approval_ria}
""",
            encoding="utf-8",
        )
        (self.workspace / "source/BOOK-OVERVIEW.md").write_text("# Overview\n", encoding="utf-8")
        (self.workspace / "source/RIA-DISTILLATION.md").write_text("- Revision: ria-v1\n", encoding="utf-8")
        (self.workspace / "source/ria/INDEX.md").write_text("# Index\n", encoding="utf-8")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_builds_source_only_content_addressed_manifest(self) -> None:
        with patch.object(PACKAGE.CHECKER, "validate_ria_distillation", return_value=("ria-v1", set())):
            manifest, errors = PACKAGE.build_manifest(
                self.workspace, "physics/common-v1", "Common Physics"
            )
        self.assertEqual(errors, [])
        assert manifest is not None
        self.assertTrue(str(manifest["packageRef"]).startswith("catalog://physics/common-v1@sha256:"))
        self.assertEqual(manifest["sourceRevision"], PACKAGE.digest_file(self.workspace / "book.pdf"))
        self.assertNotIn("mission", manifest)
        self.assertNotIn("plan", manifest)

    def test_incomplete_reading_cannot_be_packaged(self) -> None:
        state = self.workspace / "source/BOOK-READING-STATE.md"
        state.write_text(state.read_text(encoding="utf-8").replace("Coverage: 100%", "Coverage: 99%"), encoding="utf-8")
        with patch.object(PACKAGE.CHECKER, "validate_ria_distillation", return_value=("ria-v1", set())):
            manifest, errors = PACKAGE.build_manifest(self.workspace, "physics/common-v1", "Common Physics")
        self.assertIsNone(manifest)
        self.assertTrue(any("Coverage must be 100%" in error for error in errors))


if __name__ == "__main__":
    unittest.main()

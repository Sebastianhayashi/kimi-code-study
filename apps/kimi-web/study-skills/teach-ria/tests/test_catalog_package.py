from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
import zipfile
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
        (self.workspace / "source/original").mkdir(parents=True)
        (self.workspace / "source/original/book.pdf").write_bytes(b"book bytes")
        approval_reading = "actor=auto_policy; policy=kimi-study-auto-v1; revision=read-v1; at=2026-07-17T00:00:00Z"
        approval_ria = "actor=auto_policy; policy=kimi-study-auto-v1; revision=ria-v1; at=2026-07-17T00:00:00Z"
        (self.workspace / "source/BOOK-READING-STATE.md").write_text(
            f"""# State
- File: source/original/book.pdf
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
        self.write_metadata("book")
        self.write_rights()

    def tearDown(self) -> None:
        self.temp.cleanup()

    def write_metadata(self, kind: str, **updates: object) -> None:
        metadata: dict[str, object] = {
            "materialId": "physics/common-v1",
            "materialKind": kind,
            "title": "Common Physics",
            "authors": ["Example Author"],
            "language": "en",
            "topics": ["physics"],
            "description": "A complete physics source.",
            "searchAliases": ["physics"],
        }
        if kind == "textbook":
            metadata.update({"country": "CN", "educationStage": "high-school", "subject": "physics"})
        metadata.update(updates)
        (self.workspace / "source/CATALOG-METADATA.json").write_text(
            json.dumps(metadata, ensure_ascii=False), encoding="utf-8"
        )

    def write_rights(self, **updates: object) -> None:
        rights: dict[str, object] = {
            "source": "publisher grant",
            "rightsHolder": "Example Publisher",
            "licenseType": "licensed",
            "allowedTerritories": ["*"],
            "sourceBytesMayBeStored": True,
            "sourceTextMayBeDisplayed": True,
            "derivativeCoursesAllowed": True,
            "coverMayBeDisplayed": True,
            "attributionRequired": False,
        }
        rights.update(updates)
        (self.workspace / "source/RIGHTS.json").write_text(
            json.dumps(rights, ensure_ascii=False), encoding="utf-8"
        )

    def build(self, *, built_at: str = "2026-07-18T00:00:00Z") -> tuple[dict[str, object] | None, list[str]]:
        with patch.object(PACKAGE.CHECKER, "validate_ria_distillation", return_value=("ria-v1", set())):
            return PACKAGE.build_manifest(
                self.workspace,
                "physics/common-v1",
                "Common Physics",
                built_at=built_at,
            )

    def test_builds_book_v2_with_complete_inventory(self) -> None:
        manifest, errors = self.build()
        self.assertEqual(errors, [])
        assert manifest is not None
        self.assertEqual(manifest["schemaVersion"], 2)
        self.assertEqual(manifest["contractRevision"], "kimi-study-package-v2")
        self.assertEqual(manifest["materialKind"], "book")
        self.assertTrue(str(manifest["packageRef"]).startswith("catalog://physics/common-v1@sha256:"))
        paths = [item["path"] for item in manifest["files"]]
        self.assertEqual(paths, sorted(paths, key=lambda value: value.encode("utf-8")))
        self.assertIn("source/original/book.pdf", paths)
        self.assertNotIn("source/STUDY-PACKAGE.json", paths)
        self.assertEqual(len(paths), len(set(paths)))

    def test_builds_textbook_metadata_without_requiring_it_for_book(self) -> None:
        self.write_metadata("textbook")
        manifest, errors = self.build()
        self.assertEqual(errors, [])
        assert manifest is not None
        self.assertEqual(manifest["materialKind"], "textbook")

    def test_writes_stable_zip_entry_order_and_root(self) -> None:
        with patch.object(PACKAGE.CHECKER, "validate_ria_distillation", return_value=("ria-v1", set())):
            manifest, files, errors = PACKAGE._build_package(
                self.workspace,
                "physics/common-v1",
                "Common Physics",
                built_at="2026-07-18T00:00:00Z",
            )
        self.assertEqual(errors, [])
        assert manifest is not None
        output = self.workspace / "common.kstudy.zip"
        PACKAGE.write_package_archive(output, manifest, files)
        with zipfile.ZipFile(output) as archive:
            names = archive.namelist()
            self.assertEqual(names, sorted(names, key=lambda value: value.encode("utf-8")))
            self.assertTrue(all(name.startswith("source/") for name in names))
            loaded = json.loads(archive.read("source/STUDY-PACKAGE.json"))
        self.assertEqual(loaded["packageRef"], manifest["packageRef"])

    def test_built_at_does_not_change_content_identity(self) -> None:
        first, first_errors = self.build(built_at="2026-07-18T00:00:00Z")
        second, second_errors = self.build(built_at="2027-01-01T00:00:00Z")
        self.assertEqual(first_errors + second_errors, [])
        assert first is not None and second is not None
        self.assertNotEqual(first["builtAt"], second["builtAt"])
        self.assertEqual(first["packageRevision"], second["packageRevision"])
        self.assertEqual(first["packageRef"], second["packageRef"])

    def test_incomplete_reading_cannot_be_packaged(self) -> None:
        state = self.workspace / "source/BOOK-READING-STATE.md"
        state.write_text(state.read_text(encoding="utf-8").replace("Coverage: 100%", "Coverage: 99%"), encoding="utf-8")
        manifest, errors = self.build()
        self.assertIsNone(manifest)
        self.assertTrue(any("Coverage must be 100%" in error for error in errors))

    def test_missing_required_artifact_is_rejected(self) -> None:
        (self.workspace / "source/BOOK-OVERVIEW.md").unlink()
        manifest, errors = self.build()
        self.assertIsNone(manifest)
        self.assertTrue(any("BOOK-OVERVIEW.md" in error for error in errors))

    def test_mission_and_lessons_are_rejected(self) -> None:
        (self.workspace / "MISSION.md").write_text("not source bound", encoding="utf-8")
        (self.workspace / "lessons").mkdir()
        (self.workspace / "lessons/0001.html").write_text("lesson", encoding="utf-8")
        manifest, errors = self.build()
        self.assertIsNone(manifest)
        self.assertTrue(any("MISSION.md" in error for error in errors))
        self.assertTrue(any("lessons" in error for error in errors))

    def test_invalid_metadata_is_rejected(self) -> None:
        self.write_metadata("book", authors=[])
        manifest, errors = self.build()
        self.assertIsNone(manifest)
        self.assertTrue(any("authors" in error for error in errors))

    def test_denied_rights_are_rejected(self) -> None:
        self.write_rights(derivativeCoursesAllowed=False)
        manifest, errors = self.build()
        self.assertIsNone(manifest)
        self.assertTrue(any("derivative courses" in error for error in errors))

    def test_source_must_be_in_protocol_original_directory(self) -> None:
        state = self.workspace / "source/BOOK-READING-STATE.md"
        outside = self.workspace / "book.pdf"
        outside.write_bytes(b"outside")
        state.write_text(state.read_text(encoding="utf-8").replace("source/original/book.pdf", "book.pdf"), encoding="utf-8")
        manifest, errors = self.build()
        self.assertIsNone(manifest)
        self.assertTrue(any("source/original" in error for error in errors))

    def test_cross_language_canonical_fixture_has_fixed_digest(self) -> None:
        fixture = Path(__file__).parent / "fixtures/canonical-manifest-input.json"
        value = json.loads(fixture.read_text(encoding="utf-8"))
        self.assertEqual(
            PACKAGE.digest_bytes(PACKAGE.canonical_manifest_bytes(value)),
            "sha256:08705a8a405636f09003f644c923110b1ae9763fc6c16ae392524656de1ed3de",
        )


if __name__ == "__main__":
    unittest.main()

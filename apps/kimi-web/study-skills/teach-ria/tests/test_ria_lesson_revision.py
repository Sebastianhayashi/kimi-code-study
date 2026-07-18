from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = SKILL_ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

MODULE_PATH = SCRIPTS / "lesson_revision.py"
SPEC = importlib.util.spec_from_file_location("ria_lesson_revision", MODULE_PATH)
REVISION = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(REVISION)

FIXTURE_PATH = Path(__file__).resolve().parent / "test_ria_gate.py"
FIXTURE_SPEC = importlib.util.spec_from_file_location("ria_gate_fixture", FIXTURE_PATH)
FIXTURE = importlib.util.module_from_spec(FIXTURE_SPEC)
assert FIXTURE_SPEC and FIXTURE_SPEC.loader
FIXTURE_SPEC.loader.exec_module(FIXTURE)


class LessonRevisionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.workspace = Path(self.temp.name)
        (self.workspace / "lessons").mkdir()
        (self.workspace / ".study-drafts").mkdir()
        self.lesson = self.workspace / "lessons/0001-first.html"
        self.other_lesson = self.workspace / "lessons/0002-second.html"
        self.draft = self.workspace / ".study-drafts/0001-first.html"
        self.original = FIXTURE.quality_lesson_html()
        self.lesson.write_text(self.original, encoding="utf-8")
        self.other_lesson.write_text("untouched sibling lesson", encoding="utf-8")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def publish(self, candidate: str, expected: str | None = None) -> str:
        self.draft.write_text(candidate, encoding="utf-8")
        return REVISION.publish_candidate(
            self.workspace,
            "lessons/0001-first.html",
            ".study-drafts/0001-first.html",
            expected or REVISION.lesson_revision(self.original),
        )

    def test_revision_matches_browser_utf8_fnv_contract(self) -> None:
        self.assertEqual(REVISION.lesson_revision("<h1>第一课</h1>"), "fnv1a32:7735397a")

    def test_guarded_publish_replaces_only_the_current_lesson(self) -> None:
        candidate = self.original.replace(
            "常见误区",
            "容易踩坑的地方",
        )
        result = self.publish(candidate)
        self.assertEqual(self.lesson.read_text(encoding="utf-8"), candidate)
        self.assertEqual(
            self.other_lesson.read_text(encoding="utf-8"),
            "untouched sibling lesson",
        )
        self.assertEqual(result, REVISION.lesson_revision(candidate))
        self.assertFalse(self.draft.exists())

    def test_stale_base_keeps_the_published_lesson(self) -> None:
        with self.assertRaisesRegex(ValueError, "stale lesson revision"):
            self.publish(self.original, "fnv1a32:00000000")
        self.assertEqual(self.lesson.read_text(encoding="utf-8"), self.original)

    def test_changed_source_anchor_is_refused(self) -> None:
        with self.assertRaisesRegex(ValueError, "source anchors"):
            self.publish(FIXTURE.quality_lesson_html(anchor="伪造位置 §9"))
        self.assertEqual(self.lesson.read_text(encoding="utf-8"), self.original)

    def test_changed_title_is_refused(self) -> None:
        with self.assertRaisesRegex(ValueError, "title"):
            self.publish(self.original.replace(
                "<h1>根据证据完成一次判断</h1>",
                "<h1>另一节课</h1>",
            ))
        self.assertEqual(self.lesson.read_text(encoding="utf-8"), self.original)


if __name__ == "__main__":
    unittest.main()

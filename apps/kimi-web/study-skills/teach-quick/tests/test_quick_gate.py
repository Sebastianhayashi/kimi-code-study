from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "check-quick-course.py"
SPEC = importlib.util.spec_from_file_location("check_quick_course", MODULE_PATH)
CHECKER = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(CHECKER)


class QuickGateTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.workspace = Path(self.temp.name)
        (self.workspace / "source").mkdir()
        (self.workspace / "MISSION.md").write_text("# Mission\n\n## Why\nPass an exam.\n", encoding="utf-8")
        approval = "actor=auto_policy; policy=kimi-study-auto-v1; revision=survey-v1; at=2026-07-17T00:00:00Z"
        (self.workspace / "source/QUICK-SURVEY.md").write_text(
            f"""# Quick source survey

## Control
- Status: complete
- Revision: survey-v1
- Source revision: file:file-1
- Survey coverage: 100%
- Unresolved ranges: none
- Evidence level: survey
- Approval provenance: {approval}
""",
            encoding="utf-8",
        )
        (self.workspace / "source/QUICK-PLAN.md").write_text(
            """# Quick course plan

## Control
- Status: ready
- Revision: plan-v1
- Source revision: file:file-1
- Survey revision: survey-v1
- Mission revision: 1
- Approval provenance: actor=auto_policy; policy=kimi-study-auto-v1; revision=plan-v1; at=2026-07-17T00:00:00Z

## Integrity check
- [x] one
- [x] two
- [x] three
- [x] four
- [x] five
""",
            encoding="utf-8",
        )
        self.snapshot = {
            "schemaVersion": 1,
            "contractRevision": "kimi-study-foundation-v1",
            "courseId": "course-12345678",
            "profile": {
                "mode": "quick",
                "skill": {"name": "teach-quick", "contractRevision": "teach-quick-v2"},
                "sourceRevision": "file:file-1",
                "selectedBy": "user",
            },
            "source": {
                "kind": "upload",
                "sourceId": "file-1",
                "title": "Book.pdf",
                "revision": "file:file-1",
                "status": "ready",
                "evidenceLevel": "survey",
                "quickSurveyRevision": "survey-v1",
            },
            "mission": {"status": "ready", "revision": 1, "questionsAsked": 1, "summary": "Pass an exam."},
            "plan": {
                "status": "ready",
                "revision": "plan-v1",
                "basedOnSourceRevision": "file:file-1",
                "basedOnMissionRevision": 1,
                "chapterCount": 2,
                "pageCount": 4,
                "quizCount": 1,
            },
            "generation": {"status": "not_started", "publishedLessons": 0},
            "approvals": [],
            "updatedAt": "2026-07-17T00:00:00Z",
        }
        self._write_snapshot()

    def tearDown(self) -> None:
        self.temp.cleanup()

    def _write_snapshot(self) -> None:
        (self.workspace / "source/STUDY-SNAPSHOT.json").write_text(
            json.dumps(self.snapshot), encoding="utf-8"
        )

    def _publish_lesson_index(self, *, status: str = "partially_ready") -> None:
        lessons = self.workspace / "lessons"
        lessons.mkdir(exist_ok=True)
        (lessons / "0001-first.html").write_text("<h1>First lesson</h1>", encoding="utf-8")
        (lessons / "index.json").write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "contractRevision": "kimi-study-lessons-v1",
                    "lessons": [
                        {
                            "order": 1,
                            "path": "lessons/0001-first.html",
                            "title": "First lesson",
                            "status": "published",
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        self.snapshot["generation"] = {"status": status, "publishedLessons": 1}
        self._write_snapshot()

    def test_valid_quick_course_passes(self) -> None:
        self.assertEqual(CHECKER.validate(self.workspace), [])

    def test_revised_plan_and_snapshot_must_publish_the_same_revision(self) -> None:
        plan_path = self.workspace / "source/QUICK-PLAN.md"
        plan_path.write_text(
            plan_path.read_text(encoding="utf-8").replace("plan-v1", "plan-v2"),
            encoding="utf-8",
        )

        errors = CHECKER.validate(self.workspace)
        self.assertTrue(any("plan revision is not ready" in error for error in errors))

        self.snapshot["plan"]["revision"] = "plan-v2"
        self._write_snapshot()
        self.assertEqual(CHECKER.validate(self.workspace), [])

    def test_deep_claim_in_quick_snapshot_fails(self) -> None:
        self.snapshot["source"]["reading"] = {"coveragePercent": 100, "blockedRanges": []}
        self._write_snapshot()
        errors = CHECKER.validate(self.workspace)
        self.assertTrue(any("cannot contain deep evidence" in error for error in errors))

    def test_more_than_one_mission_question_fails(self) -> None:
        self.snapshot["mission"]["questionsAsked"] = 2
        self._write_snapshot()
        errors = CHECKER.validate(self.workspace)
        self.assertTrue(any("0-1 questions" in error for error in errors))

    def test_published_lesson_index_passes(self) -> None:
        self._publish_lesson_index()
        self.assertEqual(CHECKER.validate(self.workspace), [])

    def test_published_lessons_require_index(self) -> None:
        self.snapshot["generation"] = {"status": "partially_ready", "publishedLessons": 1}
        self._write_snapshot()
        errors = CHECKER.validate(self.workspace)
        self.assertTrue(any("required after lesson publication begins" in error for error in errors))

    def test_lesson_index_must_match_snapshot_and_files(self) -> None:
        self._publish_lesson_index()
        (self.workspace / "lessons/0001-first.html").unlink()
        self.snapshot["generation"]["publishedLessons"] = 2
        self._write_snapshot()
        errors = CHECKER.validate(self.workspace)
        self.assertTrue(any("published lesson is missing" in error for error in errors))
        self.assertTrue(any("published count does not match" in error for error in errors))


if __name__ == "__main__":
    unittest.main()

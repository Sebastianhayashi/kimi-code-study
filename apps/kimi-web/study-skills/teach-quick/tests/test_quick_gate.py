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


def quality_lesson_html(anchor: str = "测试材料 §1", marker: str = "状态判断") -> str:
    return f"""<!doctype html>
<html lang="zh-CN"><body>
<h1>{marker}：先看证据，再决定动作</h1>
<section id="learning-objective"><h2>学习目标</h2><p>完成本节后，你能依据材料中的状态信号和适用条件，判断下一步是否应该继续操作，并说明判断理由。</p></section>
<section id="core-concept"><h2>核心概念</h2><p>可靠判断不是记住一句口号，而是把可观察信号、材料给出的条件和允许采取的动作连成一条可核对的推理链。</p></section>
<section id="plain-explanation"><h2>通俗解释</h2><p>先确认眼前发生了什么，再到材料中找到对应条件，最后只选择材料允许的动作。任何一步缺少依据，都应停下来补证据。</p></section>
<section id="source-example"><h2>材料中的例子</h2><p data-evidence="source" data-source-anchor="{anchor}">材料中说明：测试状态出现后应先核对限制条件，再决定继续、等待或停止，不能跳过条件直接行动。</p></section>
<section id="application-example"><h2>教学示例</h2><p data-evidence="teaching-example">教学示例：把一个新的状态提示代入“信号—条件—动作”三步法。这个情境用于练习，不是材料中的真实案例。</p></section>
<section id="misconception"><h2>常见误区</h2><p>看到熟悉信号就凭经验行动是常见误区；如果适用条件已经变化，相同信号可能需要完全不同的处理方式。</p></section>
<section id="lesson-summary"><h2>本节总结</h2><p>保留这一条判断规则：描述信号，核对条件，再选择材料明确允许的动作；缺少证据时不要补写结论。</p></section>
<section id="self-check"><h2>自测题</h2><p>请判断：只有状态信号、没有适用条件时能否继续？答案是不能；合格回答应指出缺少哪项证据以及应先查哪里。</p></section>
<section id="source-anchors"><h2>材料依据</h2><p>{anchor}：本节关于状态、条件和动作顺序的直接依据，发布前已按该稳定位置重新核对。</p></section>
</body></html>"""


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
                "skill": {"name": "teach-quick", "contractRevision": "teach-quick-v4"},
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
        (lessons / "0001-first.html").write_text(quality_lesson_html(), encoding="utf-8")
        (lessons / "index.json").write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "contractRevision": "kimi-study-lessons-v1",
                    "lessons": [
                        {
                            "order": 1,
                            "path": "lessons/0001-first.html",
                            "title": "先看证据，再决定动作",
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

    def test_published_lesson_must_pass_chinese_grounding_gate(self) -> None:
        self._publish_lesson_index()
        (self.workspace / "lessons/0001-first.html").write_text(
            "<html><body><h1>Generic lesson</h1></body></html>",
            encoding="utf-8",
        )
        errors = CHECKER.validate(self.workspace)
        self.assertTrue(any("html language must be zh-CN" in error for error in errors))
        self.assertTrue(any("source-grounded evidence block" in error for error in errors))

    def test_repeated_paragraphs_across_lessons_fail(self) -> None:
        self._publish_lesson_index()
        lessons = self.workspace / "lessons"
        (lessons / "0002-second.html").write_text(
            quality_lesson_html(marker="第二个状态判断"),
            encoding="utf-8",
        )
        index_path = lessons / "index.json"
        manifest = json.loads(index_path.read_text(encoding="utf-8"))
        manifest["lessons"].append({
            "order": 2,
            "path": "lessons/0002-second.html",
            "title": "第二个状态判断",
            "status": "published",
        })
        index_path.write_text(json.dumps(manifest), encoding="utf-8")
        self.snapshot["generation"]["publishedLessons"] = 2
        self._write_snapshot()

        errors = CHECKER.validate(self.workspace)
        self.assertTrue(any("repeated learner-facing block" in error for error in errors))

    def test_v2_profile_cannot_claim_v4_lesson_contract(self) -> None:
        self.snapshot["profile"]["skill"]["contractRevision"] = "teach-quick-v2"
        self._write_snapshot()
        errors = CHECKER.validate(self.workspace)
        self.assertTrue(any("quick profile pin is invalid" in error for error in errors))

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

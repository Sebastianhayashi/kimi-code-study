from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "check-book-course.py"
SPEC = importlib.util.spec_from_file_location("check_book_course", MODULE_PATH)
CHECKER = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(CHECKER)


def quality_lesson_html(anchor: str = "测试材料 §1") -> str:
    return f"""<!doctype html>
<html lang="zh-CN"><body>
<h1>根据证据完成一次判断</h1>
<section id="learning-objective"><h2>学习目标</h2><p>完成本节后，你能依据材料中的信号和限制条件作出判断，并用一条完整推理链说明选择。</p></section>
<section id="core-concept"><h2>核心概念</h2><p>可靠判断要把可观察信号、适用条件和允许动作连接起来，不能只记住脱离边界的一句结论。</p></section>
<section id="plain-explanation"><h2>通俗解释</h2><p>先描述事实，再核对材料给出的条件，最后选择动作；任何一步缺少依据，都应该停下补证据。</p></section>
<section id="source-example"><h2>材料中的例子</h2><p data-evidence="source" data-source-anchor="{anchor}">材料中说明：出现测试信号后，应先核对限制条件，再决定继续、等待或停止，不能跳过条件直接行动。</p></section>
<section id="application-example"><h2>教学示例</h2><p data-evidence="teaching-example">教学示例：把新情境代入“信号—条件—动作”三步法。这个情境用于练习，不是材料中的真实案例。</p></section>
<section id="misconception"><h2>常见误区</h2><p>凭经验看到信号就行动会忽略边界；当条件变化时，相同信号可能对应不同处理方式。</p></section>
<section id="lesson-summary"><h2>本节总结</h2><p>记住这条规则：描述信号，核对条件，再采取材料允许的动作；没有依据时明确暂停。</p></section>
<section id="self-check"><h2>自测题</h2><p>请判断只有信号时能否行动。答案是不能；合格回答要指出缺少的条件以及下一步核对位置。</p></section>
<section id="source-anchors"><h2>材料依据</h2><p>{anchor}：本节关于信号、条件和动作顺序的直接依据，发布前已重新核对。</p></section>
</body></html>"""


class RiaGateTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.workspace = Path(self.temporary_directory.name)
        for directory in (
            "source/ria/candidates",
            "source/ria/units",
            "source/ria/tests",
            "source/ria/test-results",
        ):
            (self.workspace / directory).mkdir(parents=True, exist_ok=True)

        for filename in (
            "frameworks.md",
            "principles.md",
            "cases.md",
            "counter-examples.md",
            "glossary.md",
        ):
            (self.workspace / "source/ria/candidates" / filename).write_text(
                f"# {filename}\n",
                encoding="utf-8",
            )
        (self.workspace / "source/ria/INDEX.md").write_text("# RIA index\n\n- RIA-F01\n", encoding="utf-8")
        (self.workspace / "source/ria/GLOSSARY.md").write_text("# Glossary\n", encoding="utf-8")
        (self.workspace / "source/ria/units/RIA-F01.md").write_text(
            """# Method

## R — Reading
Source evidence at Chapter 1 and Chapter 3.

## I — Interpretation
Fresh explanation of the mechanism.

## A1 — Past application
A complete original case and result.

## A2 — Future trigger
Specific situations and neighboring distinctions.

## E — Execution
1. Take an observable action.

## B — Boundary
Do not use it outside these conditions.
""",
            encoding="utf-8",
        )
        self.test_path = self.workspace / "source/ria/tests/RIA-F01.json"
        self.test_data = {
            "skill": "method",
            "test_cases": [
                {"type": "should_trigger", "prompt": "one"},
                {"type": "should_trigger", "prompt": "two"},
                {"type": "should_trigger", "prompt": "three"},
                {"type": "should_not_trigger", "prompt": "trap"},
                {
                    "type": "should_not_trigger",
                    "prompt": "sibling",
                    "cross_unit_confusion": True,
                },
                {"type": "edge_case", "prompt": "edge"},
            ],
        }
        self._write_test_data()
        (self.workspace / "source/ria/test-results/RIA-F01.md").write_text(
            "# Results\n\n- Status: passed\n",
            encoding="utf-8",
        )
        self.distillation = self.workspace / "source/RIA-DISTILLATION.md"
        self.distillation.write_text(
            """# RIA distillation

## Control
- Status: approved
- Revision: ria-v1
- Source identity: Book, first edition, source/book.pdf
- Reading coverage: 100%
- Candidate extraction: complete
- Triple verification: complete
- RIA++ units: complete
- Relationship index: complete
- Pressure tests: passed
- Verified unit count: 1
- Unresolved distillation gaps: none
- Approval provenance: actor=auto_policy; policy=kimi-study-auto-v1; revision=ria-v1; at=2026-07-17T00:00:00Z

## Verified unit register
| RIA Unit ID | Type | Source anchors | RIA++ file | Test file | Test result file | Result |
|---|---|---|---|---|---|---|
| RIA-F01 | framework | Chapter 1; Chapter 3 | source/ria/units/RIA-F01.md | source/ria/tests/RIA-F01.json | source/ria/test-results/RIA-F01.md | passed |

## Integrity audit
- [x] Candidate extraction scanned every non-administrative reading-ledger range.
- [x] Framework, principle, case, counterexample, and glossary passes are complete.
- [x] Every candidate has stable source anchors and a bounded quotation.
- [x] Every candidate was checked independently against V1, V2, and V3.
- [x] Every rejection is retained with its evidence and reason.
- [x] Every verified unit has complete R, I, A1, A2, E, and B sections.
- [x] Every verified unit appears in the relationship index and shared glossary where relevant.
- [x] Every verified unit has trigger, non-trigger, cross-unit confusion, and boundary tests.
- [x] All pressure tests pass, including every non-trigger test.
- [x] Approval provenance names the actor, policy, exact RIA revision, and timestamp.
""",
            encoding="utf-8",
        )
        self.state = """- RIA distillation: complete
- RIA approval: actor=auto_policy; policy=kimi-study-auto-v1; revision=ria-v1; at=2026-07-17T00:00:00Z
"""

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def _write_test_data(self) -> None:
        self.test_path.write_text(json.dumps(self.test_data), encoding="utf-8")

    def test_complete_ria_gate_passes(self) -> None:
        errors: list[str] = []
        revision, unit_ids = CHECKER.validate_ria_distillation(
            self.workspace,
            self.state,
            self.distillation,
            errors,
        )
        self.assertEqual(errors, [])
        self.assertEqual(revision, "ria-v1")
        self.assertEqual(unit_ids, {"RIA-F01"})

    def test_cross_unit_confusion_trap_is_required(self) -> None:
        self.test_data["test_cases"][4].pop("cross_unit_confusion")
        self._write_test_data()
        errors: list[str] = []
        CHECKER.validate_ria_distillation(
            self.workspace,
            self.state,
            self.distillation,
            errors,
        )
        self.assertTrue(any("cross-unit confusion trap" in error for error in errors))

    def test_approval_must_name_policy_and_exact_revision(self) -> None:
        source = self.distillation.read_text(encoding="utf-8")
        self.distillation.write_text(
            source.replace(
                "actor=auto_policy; policy=kimi-study-auto-v1; revision=ria-v1; at=2026-07-17T00:00:00Z",
                "actor=auto_policy; policy=; revision=ria-v1; at=2026-07-17T00:00:00Z",
            ),
            encoding="utf-8",
        )
        errors: list[str] = []
        CHECKER.validate_ria_distillation(
            self.workspace,
            self.state,
            self.distillation,
            errors,
        )
        self.assertTrue(any("approval provenance" in error for error in errors))


class StudySnapshotTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.workspace = Path(self.temp.name)
        (self.workspace / "source").mkdir()
        (self.workspace / "source/RIA-DISTILLATION.md").write_text(
            "- Revision: ria-v1\n", encoding="utf-8"
        )
        (self.workspace / "source/CURRICULUM-BLUEPRINT.md").write_text(
            "- Revision: blueprint-v1\n", encoding="utf-8"
        )
        self.snapshot = {
            "schemaVersion": 1,
            "contractRevision": "kimi-study-foundation-v1",
            "courseId": "course-12345678",
            "profile": {
                "mode": "deep",
                "skill": {"name": "teach-ria", "contractRevision": "teach-ria-v5"},
                "sourceRevision": "file:file-1",
                "selectedBy": "user",
            },
            "source": {
                "kind": "upload",
                "sourceId": "file-1",
                "title": "Book.pdf",
                "revision": "file:file-1",
                "status": "ready",
                "evidenceLevel": "certified",
                "reading": {
                    "coveragePercent": 100,
                    "blockedRanges": [],
                    "certificateRevision": "read-v1",
                },
                "ria": {"status": "ready", "revision": "ria-v1"},
            },
            "mission": {
                "status": "ready",
                "revision": 2,
                "questionsAsked": 3,
                "summary": "Solve textbook problems independently.",
            },
            "plan": {
                "status": "ready",
                "revision": "blueprint-v1",
                "basedOnSourceRevision": "file:file-1",
                "basedOnMissionRevision": 2,
            },
            "generation": {"status": "not_started", "publishedLessons": 0},
            "approvals": [
                {
                    "actor": "auto_policy",
                    "policyRevision": "kimi-study-auto-v1",
                    "approvedRevision": revision,
                    "approvedAt": "2026-07-17T00:00:00Z",
                }
                for revision in ("overview-v1", "ria-v1", "blueprint-v1")
            ],
            "updatedAt": "2026-07-17T00:00:00Z",
        }
        self._write()

    def tearDown(self) -> None:
        self.temp.cleanup()

    def _write(self) -> None:
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
                            "title": "根据证据完成一次判断",
                            "status": "published",
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        self.snapshot["generation"] = {
            "status": status,
            "publishedLessons": 1,
            "planRevision": "blueprint-v1",
        }
        self._write()

    def test_certified_deep_snapshot_passes(self) -> None:
        errors: list[str] = []
        CHECKER.validate_study_snapshot(self.workspace, errors)
        self.assertEqual(errors, [])

    def test_one_question_cannot_claim_deep_readiness(self) -> None:
        self.snapshot["mission"]["questionsAsked"] = 1
        self._write()
        errors: list[str] = []
        CHECKER.validate_study_snapshot(self.workspace, errors)
        self.assertTrue(any("2-4 questions" in error for error in errors))

    def test_published_lesson_index_passes(self) -> None:
        self._publish_lesson_index()
        errors: list[str] = []
        CHECKER.validate_study_snapshot(self.workspace, errors)
        self.assertEqual(errors, [])

    def test_published_lesson_must_pass_chinese_grounding_gate(self) -> None:
        self._publish_lesson_index()
        (self.workspace / "lessons/0001-first.html").write_text(
            "<html><body><h1>Generic lesson</h1></body></html>",
            encoding="utf-8",
        )
        errors: list[str] = []
        CHECKER.validate_study_snapshot(self.workspace, errors)
        self.assertTrue(any("html language must be zh-CN" in error for error in errors))
        self.assertTrue(any("source-grounded evidence block" in error for error in errors))

    def test_v2_profile_cannot_claim_v4_lesson_contract(self) -> None:
        self.snapshot["profile"]["skill"]["contractRevision"] = "teach-ria-v2"
        self._write()
        errors: list[str] = []
        CHECKER.validate_study_snapshot(self.workspace, errors)
        self.assertTrue(any("Skill pin is invalid" in error for error in errors))

    def test_published_lessons_require_index(self) -> None:
        self.snapshot["generation"] = {
            "status": "partially_ready",
            "publishedLessons": 1,
            "planRevision": "blueprint-v1",
        }
        self._write()
        errors: list[str] = []
        CHECKER.validate_study_snapshot(self.workspace, errors)
        self.assertTrue(any("required after lesson publication begins" in error for error in errors))

    def test_ready_index_rejects_unpublished_lessons(self) -> None:
        self._publish_lesson_index(status="ready")
        index_path = self.workspace / "lessons/index.json"
        manifest = json.loads(index_path.read_text(encoding="utf-8"))
        manifest["lessons"][0]["status"] = "failed"
        index_path.write_text(json.dumps(manifest), encoding="utf-8")
        errors: list[str] = []
        CHECKER.validate_study_snapshot(self.workspace, errors)
        self.assertTrue(any("ready generation requires every lesson" in error for error in errors))
        self.assertTrue(any("published count does not match" in error for error in errors))


if __name__ == "__main__":
    unittest.main()

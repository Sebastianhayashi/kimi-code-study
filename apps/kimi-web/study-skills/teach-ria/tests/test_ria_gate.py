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
                "skill": {"name": "teach-ria", "contractRevision": "teach-ria-v1"},
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


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent
MODULE_PATH = ROOT / "evaluate_lessons.py"
SPEC = importlib.util.spec_from_file_location("evaluate_lessons", MODULE_PATH)
EVALUATOR = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(EVALUATOR)


class ChineseLessonEvalTest(unittest.TestCase):
    def test_all_five_categories_pass_the_recorded_reference_generation(self) -> None:
        report = EVALUATOR.evaluate()
        self.assertEqual(report["fixtureCount"], 5)
        self.assertEqual(report["passedFixtures"], 5)
        self.assertEqual(set(report["categories"]), EVALUATOR.EXPECTED_CATEGORIES)
        self.assertEqual(report["globalErrors"], [])
        self.assertEqual(report["metrics"]["invalidSourceAnchors"], 0)
        self.assertEqual(report["metrics"]["unsupportedForbiddenClaims"], 0)
        self.assertEqual(
            report["metrics"]["requiredSourceFactCoverage"]["covered"],
            report["metrics"]["requiredSourceFactCoverage"]["total"],
        )

    def test_fake_source_anchor_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            fixtures = Path(temp) / "fixtures"
            shutil.copytree(ROOT / "fixtures", fixtures)
            lesson = fixtures / "product-instructions" / "lesson.html"
            lesson.write_text(
                lesson.read_text(encoding="utf-8").replace("P-2 指示灯状态", "P-99 不存在"),
                encoding="utf-8",
            )
            report = EVALUATOR.evaluate(fixtures)
            product = next(item for item in report["results"] if item["id"] == "product-instructions")
            self.assertFalse(product["passed"])
            self.assertTrue(any("invented or disallowed" in error for error in product["errors"]))

    def test_unsupported_claim_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            fixtures = Path(temp) / "fixtures"
            shutil.copytree(ROOT / "fixtures", fixtures)
            lesson = fixtures / "technical-guide" / "lesson.html"
            lesson.write_text(
                lesson.read_text(encoding="utf-8").replace(
                    "</body>", "<p>所有 5xx 响应都必须无限重试。</p></body>",
                ),
                encoding="utf-8",
            )
            report = EVALUATOR.evaluate(fixtures)
            technical = next(item for item in report["results"] if item["id"] == "technical-guide")
            self.assertFalse(technical["passed"])
            self.assertTrue(any("unsupported claim" in error for error in technical["errors"]))

    def test_outline_omission_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            fixtures = Path(temp) / "fixtures"
            shutil.copytree(ROOT / "fixtures", fixtures)
            plan_path = fixtures / "policy-notice" / "plan.json"
            plan = json.loads(plan_path.read_text(encoding="utf-8"))
            plan["lessons"] = plan["lessons"][:2]
            plan_path.write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
            report = EVALUATOR.evaluate(fixtures)
            policy = next(item for item in report["results"] if item["id"] == "policy-notice")
            self.assertFalse(policy["passed"])
            self.assertTrue(any("outline omits source anchor" in error for error in policy["errors"]))

    def test_ai_style_filler_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            fixtures = Path(temp) / "fixtures"
            shutil.copytree(ROOT / "fixtures", fixtures)
            lesson = fixtures / "training-material" / "lesson.html"
            lesson.write_text(
                lesson.read_text(encoding="utf-8").replace(
                    "逐项检查、记录结果",
                    "在当今快速发展的时代，逐项检查、记录结果",
                ),
                encoding="utf-8",
            )
            report = EVALUATOR.evaluate(fixtures)
            training = next(item for item in report["results"] if item["id"] == "training-material")
            self.assertFalse(training["passed"])
            self.assertTrue(any("AI-style filler" in error for error in training["errors"]))

    def test_quick_and_deep_use_the_same_quality_gate(self) -> None:
        quick = ROOT.parent / "study-skills/teach-quick/scripts/lesson_quality.py"
        deep = ROOT.parent / "study-skills/teach-ria/scripts/lesson_quality.py"
        self.assertEqual(quick.read_bytes(), deep.read_bytes())


if __name__ == "__main__":
    unittest.main()

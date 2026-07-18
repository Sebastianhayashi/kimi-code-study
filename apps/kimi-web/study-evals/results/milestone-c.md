# Milestone C offline evaluation result

- Date: 2026-07-18
- Skill contracts: `teach-quick-v3`, `teach-ria-v3`
- Method: checked-in synthetic sources plus deterministic structural and grounding proxy
- Command: `python apps/kimi-web/study-evals/evaluate_lessons.py`

## Result

| Measure | Result |
|---|---:|
| Fixture categories passed | 5 / 5 |
| Incremental reference lessons generated and accepted | 5 / 5 |
| Outline source anchors covered | 15 / 15 |
| Required source facts inside source-labelled blocks | 10 / 10 |
| Invalid or invented source anchors | 0 |
| Deliberately unsupported forbidden claims present | 0 |
| Repeated long learner-facing blocks | 0 |

Passing categories: 产品说明、非虚构文章、技术指南、政策说明、培训材料。

## Interpretation

This result proves that the v3 contract, checker, fixture outlines, and reference
lessons agree on the recorded source facts and structural quality obligations.
Mutation tests separately prove that a fake anchor and an unsupported claim make
the suite fail.

It does not measure a live provider, latency, style preference across real
learners, or arbitrary factual truth. A final browser E2E should generate from
at least one fixture through a newly activated v3 Skill and inspect the result.
No comparison with Coursebox or another product was performed.

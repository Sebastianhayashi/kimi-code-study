# Kimi Study Chinese course quality evals

This directory is a small, reproducible quality gate for Kimi Study Core v1.
It is intentionally not a benchmark platform and does not claim superiority
over Coursebox or any other product.

## What is included

`fixtures/` contains five original synthetic Chinese sources that are safe to
redistribute:

- product instructions;
- a nonfiction article;
- a technical guide;
- a policy notice;
- training material.

Each fixture contains:

- `source.md`: the uploaded-material proxy with stable anchors;
- `expected.json`: allowed anchors, required source facts, objective keywords,
  and a deliberately unsupported claim;
- `plan.json`: a short source-to-outline disposition;
- `lesson.html`: one incrementally generated reference lesson.

The reference lessons were authored from only their checked-in synthetic
sources. They are regression evidence for the v3 contract, not measurements of
a live provider or representative production quality.

## Run

```bash
python apps/kimi-web/study-evals/evaluate_lessons.py
python -m pytest -q apps/kimi-web/study-evals
```

The evaluator uses the same deterministic lesson-quality module bundled in the
Quick and Deep Skills. It checks all nine rubric dimensions where an offline
proxy is possible: outline anchor coverage, section progression, source-fact
coverage, evidence labels, Chinese structure, examples, repetition, self-check
alignment, and unsupported claims.

Semantic truth still requires source rereading. The Skill contracts explicitly
retain that human/model comparison before publication; this evaluator catches
missing or invented fixture anchors but cannot prove arbitrary prose true.

## Adding a fixture

Use only original, public-domain, or explicitly redistributable text. Add stable
anchors, declare every anchor in `expected.json`, and include at least one
forbidden claim that a weak generator might invent. Never commit private
documents, complete copyrighted books, credentials, or real personal data.

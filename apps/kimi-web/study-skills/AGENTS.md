# Kimi Study Skill rules

These instructions apply to `apps/kimi-web/study-skills/**`.

## Contracts

- `teach-quick` advertises `[contract:teach-quick-v1]` and writes survey evidence only.
- `teach-ria` advertises `[contract:teach-ria-v1]` and preserves all whole-reading/RIA fidelity gates.
- Both write `source/STUDY-SNAPSHOT.json` for `kimi-study-foundation-v1`.
- `CONTRACT.json`, Skill frontmatter, `src/study/domain/studyPolicy.ts`, runtime checks, and tests must agree.

If workflow semantics change, bump the contract revision everywhere in the same logical change. A new frontmatter name or contract marker requires a new Kimi session for discovery testing.

## Non-negotiable quality

Do not weaken Deep mode to remove UX pauses. Remove the pause by recording attributable auto-policy approval after the gate passes.

Deep keeps:

- actual source inventory and 100% readable coverage;
- explicit blocked ranges;
- coherent overview;
- five independent extraction passes;
- retained V1/V2/V3 rejections;
- atomic R/I/A1/A2/E/B units;
- relationship index and glossary;
- trigger/non-trigger/cross-unit/boundary pressure tests;
- lossless source and Mission disposition;
- lesson briefs, source reopening, and publication checks.

Never record `actor=user` for automatic work. Default provenance is:

`actor=auto_policy; policy=kimi-study-auto-v1; revision={exact revision}; at={ISO-8601}`

Quick covers every inventoried range at survey depth, retains extraction limitations, asks at most one Mission question, and never emits reading/RIA certification.

## Catalog preprocessing

Catalog packages contain source-bound reading + RIA only. Never precompute a generic Mission, learner blueprint, or course.

Build a source package with `teach-ria/scripts/build-catalog-package.py`. The frontend accepts it only through `parseCatalogPackageManifest`, which requires immutable SHA-256 identities, 100% coverage, no blockers, RIA readiness, required checksums, and attributable approvals.

## Tests and deployment

Run:

```bash
python3 -m unittest discover -s teach-quick/tests -p 'test_*.py'
python3 -m unittest discover -s teach-ria/tests -p 'test_*.py'
python3 test_install_study_skills.py
```

Deploy without touching existing `teach`:

```bash
python3 install-study-skills.py --install --destination /home/yuyu/.agents/skills
python3 install-study-skills.py --check --destination /home/yuyu/.agents/skills
```

The installer refuses a mismatched target by default. Use `--replace` only intentionally; it keeps a content-hash backup. Verify discovery from a newly created Kimi session, not an old cached session.

Keep Skill work in its own commit. Ask the user before committing.

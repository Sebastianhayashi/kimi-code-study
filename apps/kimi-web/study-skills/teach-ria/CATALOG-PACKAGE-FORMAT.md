# Certified catalog source package

Use this format to preprocess a common textbook before a learner arrives. Package only source-bound understanding:

- immutable source bytes and identity;
- complete reading ledger and overview;
- verified RIA units, rejections, links, glossary, tests, and results;
- approval provenance for exact reading and RIA revisions.

Do not create `MISSION.md`, a curriculum blueprint, teaching map, lesson briefs, lessons, or a “generic learner.” Those remain user-specific and are created after package selection.

## Preconditions

`source/BOOK-READING-STATE.md` must show:

- 100% coverage;
- unresolved gaps `none`;
- whole-book overview complete;
- a stable reading certificate revision;
- overview approval matching that revision;
- RIA distillation complete and RIA approval matching its revision.

`source/RIA-DISTILLATION.md` must pass every extraction, verification, RIA++, relationship, and pressure-test gate.

## Build

Run from the `teach-ria` Skill directory:

```bash
python3 scripts/build-catalog-package.py \
  --workspace /absolute/source-workspace \
  --material-id physics/common-textbook-v3 \
  --title "Common Physics Textbook"
```

The builder validates source-only gates, hashes the original source and required artifacts, and writes `source/STUDY-PACKAGE.json`. Its package reference is content-addressed:

`catalog://{material-id}@sha256:{package revision}`

Store the manifest and every checksummed artifact together. A catalog service may index title, author, edition, cover, and tags separately, but it must return the immutable manifest unchanged. Kimi Study must parse and certify the manifest before skipping source work.

If any source file, reading ledger, overview, RIA unit, rejection, test, result, relationship, or approval changes, rebuild the package. The old package remains immutable; publish the new reference as a new catalog revision.

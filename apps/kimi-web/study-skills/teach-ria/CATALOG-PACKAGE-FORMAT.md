# Installable certified Catalog package v2

Use this source-only format to prepare a common textbook or nonfiction book before a learner arrives. The output is an installable `*.kstudy.zip`; it is not a course.

Package only immutable original bytes, complete reading evidence, verified RIA artifacts, Catalog display metadata, explicit machine-enforceable rights, and approval provenance. Never include `MISSION.md`, a curriculum blueprint, teaching map, lesson briefs, lessons, Tutor history, progress, learning records, or a “generic learner.” Those remain user-specific and are created after package selection.

## Required workspace layout

Before building, arrange source-bound material under:

```text
source/
├── CATALOG-METADATA.json
├── RIGHTS.json
├── BOOK-READING-STATE.md
├── BOOK-OVERVIEW.md
├── RIA-DISTILLATION.md
├── original/<source file>
├── ria/...
└── assets/cover.<ext>       # optional
```

The `File` field in `BOOK-READING-STATE.md` must name the file under `source/original/`. Reading must have 100% coverage, no unresolved gaps, a complete overview, a stable certificate revision, and an approval for that revision. RIA must pass the full extraction, verification, RIA++, relationship, and pressure-test gates with its exact revision approved.

`CATALOG-METADATA.json` requires:

```json
{
  "materialId": "physics/common-textbook-v3",
  "materialKind": "textbook",
  "title": "Common Physics Textbook",
  "authors": ["Example Author"],
  "language": "en",
  "topics": ["physics"],
  "description": "A complete physics textbook.",
  "searchAliases": ["common physics"],
  "publisher": "Example Publisher",
  "edition": "3",
  "publicationYear": 2026,
  "cover": {
    "path": "source/assets/cover.png",
    "mediaType": "image/png"
  },
  "country": "CN",
  "educationStage": "high-school",
  "subject": "physics"
}
```

`materialKind` is `textbook` or `book`. Ordinary books do not need education fields. Optional common fields are `subtitle`, `publisher`, `edition`, `publicationYear`, `isbn`, and `cover`. Optional textbook fields are `country`, `educationStage`, `grade`, `subject`, `semester`, `curriculumStandard`, and `editionLabel`.

`RIGHTS.json` requires explicit machine rules:

```json
{
  "source": "publisher grant 2026-01",
  "rightsHolder": "Example Publisher",
  "licenseType": "licensed",
  "allowedTerritories": ["*"],
  "sourceBytesMayBeStored": true,
  "sourceTextMayBeDisplayed": true,
  "derivativeCoursesAllowed": true,
  "coverMayBeDisplayed": true,
  "attributionRequired": false
}
```

`validUntil` and `attributionText` are optional; the latter is required when attribution is required. A missing or expired declaration, or one that forbids storing source bytes or derivative courses, cannot be built as ready. The builder performs no legal inference.

## Build

Run from the `teach-ria` Skill directory:

```bash
python3 scripts/build-catalog-package.py \
  --workspace /absolute/source-workspace \
  --material-id physics/common-textbook-v3 \
  --title "Common Physics Textbook" \
  --output /absolute/output/common-physics.kstudy.zip
```

The builder:

- reruns the complete reading/RIA source-only gate;
- rejects every course or user artifact;
- validates metadata and rights;
- inventories every file except `source/STUDY-PACKAGE.json` itself;
- records actual byte size and SHA-256 for every inventory entry;
- computes the v2 canonical manifest identity;
- writes only `source/...` paths in stable UTF-8 byte order with fixed ZIP metadata.

The package reference is `catalog://{materialId}@sha256:{package digest}`. `packageRevision`, `packageRef`, `builtAt`, and reserved signature fields are excluded from the canonical identity input, so a changed build timestamp does not change content identity.

The server installer must still recompute identity and every file digest; the builder output is not trusted merely because it contains checksums. If any source byte, reading artifact, RIA artifact, metadata, rights rule, or approval changes, build a new revision. Old revisions remain immutable and can coexist.

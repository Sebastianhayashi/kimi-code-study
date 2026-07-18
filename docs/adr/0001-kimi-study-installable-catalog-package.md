# ADR 0001: Installable Kimi Study Catalog Package v2

- Status: Accepted for implementation
- Date: 2026-07-18
- Owners: Kimi Study
- Scope: the installable prepared-material milestone inserted after Milestone D

## Context

Kimi Study already understands an unpacked `kimi-study-package-v1` directory and can create a Catalog course in `deep_preprocessed` mode. Version 1 is a local, source-only handoff, not an archive installation protocol: it has no complete inventory, machine-enforceable rights declaration, secure extraction rules, or derived Catalog index.

This decision adds an installable `*.kstudy.zip` v2 transport without creating a second course system. Installed packages feed the existing Catalog parser and course flow. A user's Mission, blueprint, teaching map, lessons, Tutor history, progress, and learning records remain per-course products and never belong to a prepared package.

The approved HTML files in `docs/study-ui-baselines/` remain immutable visual references. This decision permits only the small Catalog import and selection slice needed to exercise the protocol.

## Decision

### 1. Identity and versions

The archive contract is `kimi-study-package-v2`; its manifest has `schemaVersion: 2`. Only v2 can be installed from ZIP. Existing unpacked `kimi-study-package-v1` directories remain readable and can be added to a rebuilt index, but v1 receives no new ZIP installation path and its weaker rights model is not silently upgraded.

A package has two identities:

- `materialId`: a publisher-controlled stable identifier for the underlying material. It matches `^[a-z0-9][a-z0-9._/-]{1,99}[a-z0-9]$`, may not contain `..`, `@`, an empty path segment, or a leading/trailing slash.
- `packageRevision`: the content digest of the v2 manifest's identity-bearing fields.

`packageRef` is exactly:

```text
catalog://{materialId}@sha256:{64 lowercase hexadecimal characters}
```

The digest suffix must equal `packageRevision` without its `sha256:` prefix. Two archives with the same `packageRef` are the same package even when archive metadata or `builtAt` differs.

### 2. ZIP root and contents

The archive root directly contains `source/`; an extra wrapper directory is invalid.

```text
source/
├── STUDY-PACKAGE.json
├── CATALOG-METADATA.json
├── RIGHTS.json
├── BOOK-READING-STATE.md
├── BOOK-OVERVIEW.md
├── RIA-DISTILLATION.md
├── original/
│   └── <one original material file>
├── ria/
│   ├── INDEX.md
│   ├── GLOSSARY.md                 # optional when genuinely empty
│   ├── candidates/
│   ├── rejected/
│   ├── units/
│   ├── tests/
│   └── test-results/
└── assets/
    └── cover.<ext>                 # optional
```

Empty directory entries are optional. Every file other than `source/STUDY-PACKAGE.json` must appear exactly once in the manifest inventory. The following paths or path segments are forbidden, case-insensitively and after Unicode normalization:

- `MISSION.md`, `CURRICULUM-BLUEPRINT.md`, `TEACHING-MAP.md`
- `source/lesson-briefs/`, `lessons/`, `learning-records/`
- Tutor transcripts, user progress, or a course for a notional "generic user"

Nested archives, including PDF and EPUB source files, are opaque source bytes. The installer never recursively extracts an entry.

### 3. Manifest schema

`source/STUDY-PACKAGE.json` contains these required top-level fields:

```json
{
  "schemaVersion": 2,
  "contractRevision": "kimi-study-package-v2",
  "materialId": "physics/common-2026",
  "packageRevision": "sha256:<digest>",
  "packageRef": "catalog://physics/common-2026@sha256:<digest>",
  "materialKind": "textbook",
  "title": "Common Physics",
  "authors": ["Example Author"],
  "language": "zh-CN",
  "topics": ["physics"],
  "source": {
    "path": "source/original/common-physics.pdf",
    "mediaType": "application/pdf",
    "size": 123456,
    "sha256": "<64 lowercase hexadecimal characters>"
  },
  "metadata": {
    "path": "source/CATALOG-METADATA.json",
    "size": 1024,
    "sha256": "<digest>"
  },
  "rights": {
    "path": "source/RIGHTS.json",
    "size": 512,
    "sha256": "<digest>"
  },
  "reading": {
    "coveragePercent": 100,
    "blockedRanges": [],
    "certificateRevision": "read-v1"
  },
  "ria": {
    "status": "complete",
    "revision": "ria-v1"
  },
  "approvals": [
    {
      "actor": "auto_policy",
      "policyRevision": "kimi-study-auto-v1",
      "approvedRevision": "read-v1",
      "approvedAt": "2026-07-17T00:00:00Z"
    },
    {
      "actor": "auto_policy",
      "policyRevision": "kimi-study-auto-v1",
      "approvedRevision": "ria-v1",
      "approvedAt": "2026-07-17T00:00:00Z"
    }
  ],
  "files": [
    {
      "path": "source/BOOK-OVERVIEW.md",
      "size": 2048,
      "sha256": "<digest>",
      "role": "reading-overview",
      "mediaType": "text/markdown"
    }
  ],
  "builtAt": "2026-07-18T00:00:00Z"
}
```

Optional display fields are `subtitle`, `publisher`, `edition`, `publicationYear`, `isbn`, and `cover`. When present, `cover` has `path`, `mediaType`, `size`, and `sha256` and must match its inventory entry.

JSON schema validation is strict: unknown fields are rejected except reserved top-level `signature` and `signatures`, which are ignored for identity until a later signed-package decision defines them. Numbers are safe integers; floats, non-finite values, duplicate JSON keys, byte-order marks, and unpaired Unicode surrogates are invalid.

### 4. Canonical package revision

Python and TypeScript implement the same constrained canonical JSON algorithm:

1. Parse the manifest while rejecting duplicate keys and invalid Unicode.
2. Remove the top-level fields `packageRevision`, `packageRef`, `builtAt`, `signature`, and `signatures`.
3. Permit only JSON null, booleans, strings, arrays, objects, and safe integers. Manifest property names are ASCII.
4. Preserve array order. Sort object property names by their UTF-8 byte sequences.
5. Serialize as UTF-8 JSON with no insignificant whitespace, no ASCII-only escaping, lowercase JSON literals, and the shortest decimal form for integers. Escape quotation mark, reverse solidus, and U+0000 through U+001F using JSON escapes; hexadecimal escape digits are lowercase.
6. Compute SHA-256 over the resulting bytes and prefix the lowercase hex digest with `sha256:`.

The installer recomputes this value and rejects a mismatch in either `packageRevision` or `packageRef`. `builtAt` may change between builds without changing identity. Builders emit inventory entries sorted by normalized path and ZIP entries sorted by UTF-8 path bytes, so repeated builds have the same content identity and stable entry order.

### 5. File integrity

The manifest inventory is a bijection with actual non-directory ZIP entries excluding the manifest itself. Validation checks:

- normalized path equality, unique path, size, and SHA-256 for every entry;
- no actual unlisted entry and no declared missing entry;
- source, metadata, rights, and optional cover descriptors exactly match their inventory entries;
- one original source file and all required reading/RIA artifacts;
- `coveragePercent` is 100, `blockedRanges` is empty, RIA is complete, revisions are non-empty, and both approvals are explicit;
- metadata identity fields agree with the manifest;
- no forbidden course or user artifact.

The manifest is the package's fact source. The installer never trusts a digest string without reading and hashing the extracted bytes.

### 6. Catalog metadata

`source/CATALOG-METADATA.json` uses `materialKind: "textbook" | "book"` and carries display/search data without opening RIA artifacts.

Common required fields are `materialId`, `materialKind`, `title`, `authors`, `language`, `topics`, `description`, and `searchAliases`. Optional common fields are `subtitle`, `publisher`, `edition`, `publicationYear`, `isbn`, and `cover`.

A textbook may additionally provide `country`, `educationStage`, `grade`, `subject`, `semester`, `curriculumStandard`, and `editionLabel`. These education fields are rejected for neither kind, but are never required for an ordinary book. Metadata and manifest common fields must agree byte-for-byte after schema normalization.

### 7. Rights

`source/RIGHTS.json` requires:

- `source`, `rightsHolder`, `licenseType`, and a non-empty `allowedTerritories` array;
- optional ISO date `validUntil`;
- booleans `sourceBytesMayBeStored`, `sourceTextMayBeDisplayed`, `derivativeCoursesAllowed`, `coverMayBeDisplayed`, and `attributionRequired`;
- `attributionText` when attribution is required.

The installer applies only machine rules. It does not infer legal permission. Installation cannot become ready when rights are missing, expired, forbid storing source bytes, or forbid derivative courses. A cover is indexed only when `coverMayBeDisplayed` is true. Source text display remains governed by `sourceTextMayBeDisplayed`; course derivation does not broaden that permission.

### 8. Secure extraction limits

Extraction happens in kap-server, never in the browser. Limits are constants and returned in operator diagnostics:

- compressed archive: 50 MiB;
- manifest: 512 KiB;
- entries: 2,048 total;
- one uncompressed file: 128 MiB;
- total uncompressed bytes: 512 MiB;
- per-file and aggregate compression ratio: at most 100:1 once 1 MiB is uncompressed;
- supported methods: stored and deflate; encrypted entries are rejected.

Before writing an entry, the installer rejects NUL, backslash, absolute POSIX paths, Windows drive/UNC paths, empty/`.`/`..` segments, non-NFC names, names longer than 240 UTF-8 bytes, and paths outside `source/`. It rejects duplicate normalized paths, file/directory prefix conflicts, and collisions under NFC plus Unicode case folding.

ZIP Unix mode and platform attributes may describe only regular files or directories. Symlinks, link-like special entries, devices, sockets, and FIFOs are rejected. ZIP has no portable hardlink entry; any non-regular link mode is rejected, while duplicate and collision rules prevent alias-based hardlink representations. Extraction creates files with exclusive creation and follows no archive-supplied links. Nested source archives are copied as opaque files and never recursed into.

Header sizes, streamed byte counts, CRC processing, actual sizes, ratios, inventory sizes, and SHA-256 are all checked. A header cannot bypass streamed limits.

### 9. Atomic installation

The browser first uploads the archive through the existing file service, then asks the Study Catalog endpoint to install that upload. The server:

1. creates `packages/.incoming/<operation-id>/` under the launcher workspace;
2. streams the upload into the operation directory with the compressed limit;
3. validates central-directory entries before extraction;
4. extracts through exclusive, no-follow writes into `staging/`;
5. parses and recomputes the manifest identity;
6. verifies inventory, metadata, rights, reading, RIA, approvals, and the source-only gate;
7. makes installed content read-only;
8. renames `staging/` to its final directory on the same filesystem;
9. writes and fsyncs a temporary Catalog index, then atomically renames it;
10. deletes the incoming operation directory.

The safe final directory is `packages/<material-slug>--<first-16-package-digest-hex>/`. The slug contains only lowercase ASCII letters, digits, and hyphens and is not used as identity.

In-process serialization plus a workspace lock prevents concurrent index writers. A caught failure removes any newly renamed package and leaves the previous index untouched. If the process or host crashes between the package rename and index rename, the package is a complete, immutable orphan and the next index rebuild recovers it; no partial directory is ever presented as installed.

Stable machine error codes include `archive_invalid`, `archive_limit_exceeded`, `archive_path_invalid`, `archive_entry_type_forbidden`, `archive_path_collision`, `manifest_invalid`, `schema_unsupported`, `inventory_mismatch`, `checksum_mismatch`, `package_identity_mismatch`, `reading_incomplete`, `ria_incomplete`, `rights_missing`, `rights_denied`, `package_conflict`, and `install_failed`. The API pairs each code with localized, user-safe copy and keeps detailed paths out of learner UI.

### 10. Duplicate, failure, and upgrade semantics

- Reinstalling the exact `packageRef` is an idempotent success and returns the existing entry.
- A different revision of the same `materialId` installs beside old revisions. It never overwrites them.
- A final directory containing a different identity is `package_conflict`.
- Failed validation or extraction produces no final package or index entry.
- New course selection defaults to the most recently installed valid revision; an existing course continues to bind its recorded `packageRef`.
- Removing or garbage-collecting old revisions is not part of this milestone.

### 11. Derived Catalog index

`packages/CATALOG-INDEX.json` is schema version 1 and is atomically replaced. It contains `generatedAt` plus entries carrying package identity, display metadata, education fields, cover information, safe install directory, source/reading/RIA revisions needed by course activation, and `installedAt`.

The healthy list path opens only the index, validates it, and returns the latest valid revision per `materialId`; it does not open hundreds of manifests. Installed v2 directories are read-only. If the index is missing or invalid, the server scans candidate install directories, opens manifests, performs full package verification, includes valid v2 packages plus compatible unpacked v1 packages, and atomically rebuilds the index. Invalid packages are skipped and reported to operators. A cache entry can always be discarded because manifests remain the fact source.

### 12. Cover and fallback

When rights allow display, a declared cover is served through an authenticated Study Catalog endpoint after its inventory digest was verified. The UI owns the resulting Blob URL lifecycle. A missing or non-displayable cover uses the approved deterministic system cover: title, author, and material-kind typography on token-derived colors. The fallback does not mutate the package or become part of package identity.

### 13. v1 compatibility

Unpacked `kimi-study-package-v1` directories remain discoverable during index rebuild and retain the existing `parseCatalogPackageManifest` behavior. They default to `materialKind: "book"` when v1 has no kind. They are materialized only after the existing source-only certificate checks and forbidden-artifact gate pass. They are not accepted as ZIPs, are not granted v2 rights claims, and are not rewritten in place.

### 14. Personal course isolation

An installed package is never a writable course workspace. Starting a Catalog item creates a new course ID and course directory, then server-side safely copies the verified source-bound files into that directory. The installed package stays read-only. The existing course profile uses `mode: "deep_preprocessed"`, binds the exact `packageRef`, and tells `teach-ria` to reuse reading/RIA artifacts instead of rereading source.

Every course still runs a fresh 2–4 question Mission and creates its own blueprint, teaching map, lessons, revisions, Tutor state, progress, and learning records. Two course IDs therefore cannot share writable state. A package update cannot change an older course because its registry binding and copied source files retain the old `packageRef`.

### 15. API boundary

The vertical slice adds these authenticated API operations:

- `POST /api/v1/study/catalog/packages:install` with `{ session_id, file_id }`;
- `GET /api/v1/study/catalog/packages?session_id=...`;
- `GET /api/v1/study/catalog/cover?session_id=...&package_ref=...`;
- `POST /api/v1/study/catalog/courses:materialize` with `{ session_id, course_id, package_ref }`.

Vue components call the Study product facade only. The runtime calls the typed web API; it does not expose raw REST or workspace paths. Server responses expose stable package error codes and display metadata, not RIA internals.

## Consequences

- A prepared material becomes portable, verifiable, rights-aware, and immediately discoverable.
- Installation and indexing add server-side filesystem code and a ZIP reader dependency.
- Copying source-bound assets costs disk space, but gives a simple and auditable isolation boundary for this first vertical slice.
- The index optimizes normal listing while remaining disposable.
- Cryptographic publisher signatures, package deletion, remote marketplace distribution, shared deduplicated mounts, and the full approved home/workspace redesign remain future work.

## Verification obligations

Implementation is incomplete until tests cover cross-language canonical identity; book and textbook builds; all declared extraction, inventory, rights, and atomicity failures; index fast-path and rebuild; v1 compatibility; latest-revision selection; isolated `deep_preprocessed` course creation; real and fallback covers; user-safe import feedback; and absence of internal protocol terms in learner UI.

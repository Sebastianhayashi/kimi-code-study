# Current lesson revision workflow

Kimi Study may ask this Skill to revise or regenerate exactly one published lesson. The request supplies a course id, a `lessons/<safe-name>.html` path, a base content revision, and an operation id. A revision request also supplies one learner instruction.

## Non-negotiable boundaries

- Inspect the current lesson, `lessons/index.json`, the approved plan, and its cited source ranges before drafting.
- Keep the course id, lesson path, indexed title, plan revision, publication status, generation counts, and every other lesson unchanged.
- Preserve the exact existing `data-source-anchor` set. Reopen those source locations and keep source facts distinct from teaching examples.
- Never write directly over the published lesson while drafting. Use `.study-drafts/<same-file-name>.html`.
- A stale base revision, missing source, invalid candidate, changed title, or changed anchor set is a hard stop. Leave the published lesson untouched and report the reason.

## Guarded publication

1. Confirm the current identity before work begins:

   ```bash
   python3 scripts/lesson_revision.py \
     --workspace "$PWD" \
     --lesson lessons/0001-example.html \
     --expect fnv1a32:12345678
   ```

2. Draft only `.study-drafts/0001-example.html`. For a revision, apply the learner's instruction without unrelated rewrites. For regeneration, rebuild the explanation and examples while retaining the same learning objective, title, and source anchors.
3. Validate the draft with the mode's lesson checker. Run the full course checker too, so cross-lesson repetition and publication invariants still pass.
4. Immediately before replacement, atomically publish through the guard:

   ```bash
   python3 scripts/lesson_revision.py \
     --workspace "$PWD" \
     --lesson lessons/0001-example.html \
     --expect fnv1a32:12345678 \
     --candidate .study-drafts/0001-example.html
   ```

5. Run the full checker again. Do not change `source/STUDY-SNAPSHOT.json` merely to signal success: the published lesson content is the authoritative revision, and the existing lesson index remains valid because identity and status did not change.

The revision token is FNV-1a over UTF-8 bytes, formatted as `fnv1a32:` plus eight lowercase hexadecimal digits. It is a stale-write identity, not a cryptographic claim.

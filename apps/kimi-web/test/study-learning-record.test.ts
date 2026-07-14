import { describe, expect, it } from 'vitest';
import {
  parseLearningRecord,
  resolveLearningRecords,
  type LearningRecordSource,
} from '../src/study/domain/learningRecord';

function source(path: string, rawText: string): LearningRecordSource {
  return { path, rawText };
}

const DEMONSTRATED_RECORD = `# Two-chord transition

Learner can change between G and C without looking at fretting hand.

## Evidence

Demonstrated by completing the transition exercise three times with correct fretting.

## Implications

Next lessons can assume open-position G and C shapes are available.
`;

const SELF_REPORT_RECORD = `# Already knows basic open chords

Learner disclosed prior guitar experience covering open major shapes.

## Evidence

Self-report: learner stated they already know open G, C, D, Em, and Am, and described fingerings without a lesson.

Status: active
`;

const NO_EVIDENCE_SECTION = `# Relaxed left-hand posture

Learner keeps the fretting wrist neutral while holding open chords, which reduces fatigue in longer songs.
`;

const VIEWED_ONLY = `# Covered chord page

## Evidence

Viewed the chord-shapes reference page to the end.
`;

const PRACTICED_ONLY = `# Practiced strumming

## Evidence

Practiced the strumming pattern in the lesson UI.
`;

describe('parseLearningRecord', () => {
  it('preserves source path and raw text on every parse', () => {
    const path = 'learning-records/0001-two-chord-transition.md';
    const rawText = DEMONSTRATED_RECORD;
    const parsed = parseLearningRecord(source(path, rawText));

    expect(parsed.source).toEqual({ path, rawText });
    expect(parsed.source.rawText).toBe(rawText);
  });

  it('parses a valid demonstrated evidence record without treating activity as mastery', () => {
    const parsed = parseLearningRecord(
      source('learning-records/0001-two-chord-transition.md', DEMONSTRATED_RECORD),
    );

    expect(parsed.parseStatus).toBe('valid');
    expect(parsed.id).toBe('LR-0001');
    expect(parsed.title).toBe('Two-chord transition');
    expect(parsed.body).toContain('change between G and C');
    expect(parsed.evidence.kind).toBe('demonstrated');
    expect(parsed.evidence.raw).toMatch(/Demonstrated by completing/i);
    expect(parsed.implications).toMatch(/open-position G and C/i);
    expect(parsed.lifecycle).toEqual({ kind: 'active' });
    // parse status and evidence kind are separate axes
    expect(parsed.parseStatus).not.toBe(parsed.evidence.kind);
  });

  it('distinguishes learner self-report wording from demonstrated evidence', () => {
    const parsed = parseLearningRecord(
      source('learning-records/0002-prior-chords.md', SELF_REPORT_RECORD),
    );

    expect(parsed.parseStatus).toBe('valid');
    expect(parsed.id).toBe('LR-0002');
    expect(parsed.evidence.kind).toBe('self_report');
    expect(parsed.evidence.raw).toMatch(/Self-report|already know/i);
  });

  it('keeps valid records without an Evidence section as unspecified, not demonstrated', () => {
    const parsed = parseLearningRecord(
      source('learning-records/0003-relaxed-left-hand.md', NO_EVIDENCE_SECTION),
    );

    expect(parsed.parseStatus).toBe('valid');
    expect(parsed.evidence.kind).toBe('unspecified');
    expect(parsed.evidence.raw).toBeNull();
    expect(parsed.body).toContain('fretting wrist neutral');
  });

  it('never upgrades viewed-only wording to evidence and marks title-only records partial', () => {
    const parsed = parseLearningRecord(
      source('learning-records/0004-viewed-chords.md', VIEWED_ONLY),
    );

    expect(parsed.parseStatus).toBe('partial');
    expect(parsed.evidence.kind).toBe('insufficient');
    expect(parsed.body).toBeNull();
    expect(parsed.issues.some(i => /body is missing/i.test(i))).toBe(true);
  });

  it('never upgrades practiced-only wording to evidence and marks title-only records partial', () => {
    const parsed = parseLearningRecord(
      source('learning-records/0005-practiced-strum.md', PRACTICED_ONLY),
    );

    expect(parsed.parseStatus).toBe('partial');
    expect(parsed.evidence.kind).toBe('insufficient');
    expect(parsed.body).toBeNull();
    expect(parsed.issues.some(i => /body is missing/i.test(i))).toBe(true);
  });

  it('reports partial for a title-only record with no Evidence section', () => {
    const raw = `# Only a title`;
    const parsed = parseLearningRecord(
      source('learning-records/0006-title-only-no-evidence.md', raw),
    );

    expect(parsed.parseStatus).toBe('partial');
    expect(parsed.title).toBe('Only a title');
    expect(parsed.body).toBeNull();
    expect(parsed.evidence.kind).toBe('unspecified');
    expect(parsed.issues.some(i => /body is missing/i.test(i))).toBe(true);
  });

  it('reports partial for valid content at an invalid/non-numbered path', () => {
    const raw = `# Valid learning record

This record has a complete body and explains what was learned, so it would otherwise be valid.
`;
    const parsed = parseLearningRecord(source('notes/0001-record.md', raw));

    expect(parsed.parseStatus).toBe('partial');
    expect(parsed.id).toBeNull();
    expect(parsed.title).toBe('Valid learning record');
    expect(parsed.body).toContain('complete body');
    expect(parsed.evidence.kind).toBe('unspecified');
    expect(parsed.issues.some(i => /identity/i.test(i))).toBe(true);
  });

  it('accepts only exact case-sensitive learning-records/NNNN-<dash-case-name>.md identity paths', () => {
    const validBody = `# Valid learning record

This record has a complete body and explains what was learned, so it would otherwise be valid.
`;

    const accepted = parseLearningRecord(
      source('learning-records/0001-two-chord-transition.md', validBody),
    );
    expect(accepted.parseStatus).toBe('valid');
    expect(accepted.id).toBe('LR-0001');

    const invalidCases = [
      { path: 'learning-records/0001-.md', reason: 'empty slug after hyphen' },
      { path: '0001.md', reason: 'missing learning-records prefix and slug' },
      { path: 'learning-records/0001.md', reason: 'missing slug' },
      { path: 'nested/learning-records/0001-x.md', reason: 'nested prefix before learning-records' },
      { path: '/absolute/path/learning-records/0001-x.md', reason: 'absolute path' },
      { path: 'learning-records/subdir/0001-x.md', reason: 'nested subdirectory under learning-records' },
      { path: 'Learning-Records/0001-two-chord.md', reason: 'uppercase directory' },
      { path: 'learning-records/0001-Two-Chord.md', reason: 'uppercase slug' },
      { path: 'learning-records/0001-two_chord.md', reason: 'underscore in slug' },
      { path: 'learning-records/0001-two chord.md', reason: 'space in slug' },
      { path: 'learning-records/0001--two-chord.md', reason: 'double hyphen' },
      { path: 'learning-records/0001-two-chord-.md', reason: 'trailing hyphen' },
      { path: 'learning-records/-0001-two-chord.md', reason: 'leading hyphen before number segment' },
      { path: 'learning-records/0001-two-chord.MD', reason: 'uppercase extension' },
      { path: 'learning-records\\0001-two-chord.md', reason: 'backslash separator' },
      { path: 'learning-records/0001-two\tchord.md', reason: 'control character in slug' },
    ];

    for (const { path, reason } of invalidCases) {
      const parsed = parseLearningRecord(source(path, validBody));
      expect(parsed.parseStatus, reason).toBe('partial');
      expect(parsed.id, reason).toBeNull();
      expect(parsed.issues.some(i => /identity/i.test(i)), reason).toBe(true);
    }
  });

  it('keeps invalid identity records in history but out of currentSummary', () => {
    const resolution = resolveLearningRecords([
      source(
        'learning-records/0001-valid-path.md',
        `# Valid path record

Body establishes a teaching floor for future sessions.

## Evidence

Demonstrated by explaining the concept aloud.
`,
      ),
      source(
        'learning-records/0002-Bad-Slug.md',
        `# Uppercase slug path

Body would otherwise be valid evidence for future sessions.

## Evidence

Demonstrated by completing the exercise.
`,
      ),
    ]);

    expect(resolution.records).toHaveLength(2);
    expect(resolution.records[1]!.parseStatus).toBe('partial');
    expect(resolution.records[1]!.id).toBeNull();
    expect(resolution.currentSummary.map(r => r.id)).toEqual(['LR-0001']);
  });

  it('reads Status frontmatter supersession by record identity', () => {
    const raw = `---
Status: superseded by LR-0003
---

# Old fretting advice

Earlier advice to tuck the thumb is no longer the teaching floor.
`;
    const parsed = parseLearningRecord(source('learning-records/0001-old-fretting.md', raw));

    expect(parsed.parseStatus).toBe('valid');
    expect(parsed.lifecycle).toEqual({ kind: 'superseded', successorId: 'LR-0003' });
  });

  it('ignores Status lines in the body and does not create supersession from them', () => {
    const raw = `# Misconception about muting

Muting was misunderstood; later corrected.

Status: superseded by LR-0004
`;
    const parsed = parseLearningRecord(source('learning-records/0002-muting.md', raw));

    expect(parsed.parseStatus).toBe('valid');
    expect(parsed.lifecycle).toEqual({ kind: 'active' });
    expect(parsed.issues.some(i => /status/i.test(i))).toBe(false);
  });

  it('ignores Status quoted inside Evidence or Implications sections', () => {
    const evidenceStatus = `# Evidence quoted status

Body explains a corrected muting misconception for future sessions.

## Evidence

Demonstrated by muting open strings cleanly.
Status: superseded by LR-0009

## Implications

Next lessons can assume muting is established.
`;
    const implicationsStatus = `# Implications quoted status

Body explains a corrected muting misconception for future sessions.

## Evidence

Demonstrated by muting open strings cleanly.

## Implications

Status: superseded by LR-0009
Next lessons can assume muting is established.
`;

    for (const [label, raw] of [
      ['evidence', evidenceStatus],
      ['implications', implicationsStatus],
    ] as const) {
      const parsed = parseLearningRecord(source('learning-records/0002-quoted-status.md', raw));
      expect(parsed.parseStatus, label).toBe('valid');
      expect(parsed.lifecycle, label).toEqual({ kind: 'active' });
      expect(parsed.evidence.kind, label).toBe('demonstrated');
    }

    const resolution = resolveLearningRecords([
      source('learning-records/0002-quoted-status.md', evidenceStatus),
      source(
        'learning-records/0009-successor.md',
        `# Successor

Successor body for future sessions.

## Evidence

Demonstrated by completing the successor exercise.
`,
      ),
    ]);
    // Body Status must not create an unresolved supersession chain.
    expect(resolution.unresolved).toEqual([]);
    expect(resolution.currentSummary.map(r => r.id).sort()).toEqual(['LR-0002', 'LR-0009']);
  });

  it('does not treat unterminated frontmatter as a valid supersession', () => {
    const raw = `---
Status: superseded by LR-0003

# Unterminated frontmatter

Body text remains after a missing closing frontmatter fence.
`;
    const parsed = parseLearningRecord(source('learning-records/0002-unterminated-fm.md', raw));

    expect(parsed.parseStatus).toBe('valid');
    expect(parsed.lifecycle).toEqual({ kind: 'active' });
    expect(parsed.issues.some(i => /status/i.test(i))).toBe(false);
  });

  it('reports partial when title exists but body is missing', () => {
    const raw = `# Only a title

## Evidence

Demonstrated by explaining the concept aloud.
`;
    const parsed = parseLearningRecord(source('learning-records/0006-title-only.md', raw));

    expect(parsed.parseStatus).toBe('partial');
    expect(parsed.title).toBe('Only a title');
    expect(parsed.body).toBeNull();
    expect(parsed.issues.length).toBeGreaterThan(0);
  });

  it('reports partial when frontmatter Status is present but unparseable', () => {
    const raw = `---
Status: maybe later
---

# Solid title

A real lesson about tempo was established for future sessions.
`;
    const parsed = parseLearningRecord(source('learning-records/0007-bad-status.md', raw));

    expect(parsed.parseStatus).toBe('partial');
    expect(parsed.lifecycle?.kind).toBe('unknown');
    expect(parsed.issues.some(i => /status/i.test(i))).toBe(true);
  });

  it('classifies evidence conservatively with documented positive and negative markers', () => {
    const body = 'Body explains the concept and why it matters for future sessions.';

    const positiveCases: Array<{
      evidence: string;
      kind: 'demonstrated' | 'self_report';
      label: string;
    }> = [
      {
        label: 'explicit demonstrated wording',
        evidence: 'Demonstrated by completing the transition exercise three times.',
        kind: 'demonstrated',
      },
      {
        label: 'self-report marker',
        evidence: 'Self-report: learner stated they already know open G and C.',
        kind: 'self_report',
      },
      {
        label: 'already know prior-knowledge wording',
        evidence: 'Learner said they already know the open major shapes.',
        kind: 'self_report',
      },
    ];

    for (const { evidence, kind, label } of positiveCases) {
      const raw = `# Positive evidence case

${body}

## Evidence

${evidence}
`;
      const parsed = parseLearningRecord(source('learning-records/0008-evidence-pos.md', raw));
      expect(parsed.parseStatus, label).toBe('valid');
      expect(parsed.evidence.kind, label).toBe(kind);
    }

    const negativeCases: Array<{ evidence: string; label: string }> = [
      {
        label: 'Not demonstrated with only viewed',
        evidence: 'Not demonstrated; the learner only viewed the page.',
      },
      {
        label: 'did not demonstrate',
        evidence: 'The learner did not demonstrate fretting independence.',
      },
      {
        label: 'never demonstrated',
        evidence: 'The learner never demonstrated clean chord changes.',
      },
      {
        label: 'without demonstrating',
        evidence: 'Covered the topic without demonstrating application.',
      },
      {
        label: 'viewed only',
        evidence: 'Viewed the chord-shapes reference page to the end.',
      },
      {
        label: 'practiced only',
        evidence: 'Practiced the strumming pattern in the lesson UI.',
      },
      {
        label: 'covered only',
        evidence: 'Covered muting in the lesson walkthrough.',
      },
      {
        label: 'read only',
        evidence: 'Read the reference notes on open chords.',
      },
      {
        label: 'only viewed activity wording',
        evidence: 'The learner only viewed the page.',
      },
      {
        label: 'only practiced activity wording',
        evidence: 'The learner only practiced the pattern once.',
      },
    ];

    for (const { evidence, label } of negativeCases) {
      const raw = `# Negative evidence case

${body}

## Evidence

${evidence}
`;
      const parsed = parseLearningRecord(source('learning-records/0008-evidence-neg.md', raw));
      expect(parsed.parseStatus, label).toBe('valid');
      expect(parsed.evidence.kind, label).toBe('insufficient');
    }
  });

  it('reports malformed for empty or structureless text', () => {
    const empty = parseLearningRecord(source('learning-records/0008-empty.md', '   \n'));
    expect(empty.parseStatus).toBe('malformed');
    expect(empty.title).toBeNull();
    expect(empty.body).toBeNull();
    expect(empty.source.path).toBe('learning-records/0008-empty.md');

    const junk = parseLearningRecord(
      source('learning-records/0009-junk.md', 'no heading and no learning content'),
    );
    expect(junk.parseStatus).toBe('malformed');
  });

  it('does not derive identity, evidence, or mastery from ordering, counts, or mtime metadata', () => {
    // Filename slug and number are only used for Teach LR identity, never as mastery.
    const parsed = parseLearningRecord(
      source('learning-records/9999-totally-mastered.md', NO_EVIDENCE_SECTION),
    );
    expect(parsed.id).toBe('LR-9999');
    expect(parsed.evidence.kind).toBe('unspecified');
    // No mastery / percent / activity fields exist on the result
    expect(parsed).not.toHaveProperty('mastery');
    expect(parsed).not.toHaveProperty('percent');
    expect(parsed).not.toHaveProperty('mtime');
    expect(parsed).not.toHaveProperty('activity');
  });
});

describe('resolveLearningRecords', () => {
  const activeA = source(
    'learning-records/0001-first.md',
    `# First understanding

Open G is established as a teaching floor.

## Evidence

Demonstrated by forming open G correctly without prompts.
`,
  );

  const supersededA = source(
    'learning-records/0001-first.md',
    `---
Status: superseded by LR-0002
---

# First understanding

Open G is established as a teaching floor.

## Evidence

Demonstrated by forming open G correctly without prompts.
`,
  );

  const validB = source(
    'learning-records/0002-second.md',
    `# Corrected fretting

Thumb position is relaxed behind the neck, replacing the earlier rule.

## Evidence

Demonstrated by explaining why the tucked-thumb rule was dropped and showing the relaxed grip.
`,
  );

  const validC = source(
    'learning-records/0003-third.md',
    `# Further correction

Wrist stays neutral; this replaces the prior fretting floor.

## Evidence

Demonstrated in a slow song segment without fatigue cues.
`,
  );

  it('returns every historical record and excludes a valid superseded record only after a complete chain', () => {
    const resolution = resolveLearningRecords([
      supersededA,
      {
        path: 'learning-records/0002-second.md',
        rawText: `---
Status: superseded by LR-0003
---

# Corrected fretting

Thumb position is relaxed behind the neck, replacing the earlier rule.

## Evidence

Demonstrated by explaining why the tucked-thumb rule was dropped and showing the relaxed grip.
`,
      },
      validC,
    ]);

    expect(resolution.records).toHaveLength(3);
    expect(resolution.records.map(r => r.id)).toEqual(['LR-0001', 'LR-0002', 'LR-0003']);
    // History is preserved (not deleted)
    expect(resolution.records.every(r => r.source.rawText.length > 0)).toBe(true);

    expect(resolution.currentSummary.map(r => r.id)).toEqual(['LR-0003']);
    expect(resolution.unresolved).toEqual([]);
  });

  it('keeps a single-step supersession out of current summary when successor is valid', () => {
    const resolution = resolveLearningRecords([supersededA, validB]);

    expect(resolution.records).toHaveLength(2);
    expect(resolution.currentSummary.map(r => r.id)).toEqual(['LR-0002']);
    expect(resolution.unresolved).toEqual([]);
  });

  it('does not exclude a superseded record when the target is missing', () => {
    const resolution = resolveLearningRecords([
      source(
        'learning-records/0001-first.md',
        `---
Status: superseded by LR-0099
---

# First understanding

Open G is established as a teaching floor.

## Evidence

Demonstrated by forming open G correctly without prompts.
`,
      ),
    ]);

    expect(resolution.records).toHaveLength(1);
    // Missing target → not treated as successfully superseded
    expect(resolution.currentSummary.map(r => r.id)).toEqual(['LR-0001']);
    expect(resolution.unresolved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'missing_target',
          recordIds: expect.arrayContaining(['LR-0001']),
        }),
      ]),
    );
  });

  it('does not pick a winner for duplicate identities', () => {
    const dupA = source(
      'learning-records/0001-alpha.md',
      `# Alpha

Alpha understanding of tempo for future sessions.

## Evidence

Demonstrated by clapping a steady beat.
`,
    );
    const dupB = source(
      'learning-records/0001-beta.md',
      `# Beta

Beta understanding of tempo for future sessions.

## Evidence

Demonstrated by counting aloud in 4/4.
`,
    );

    const resolution = resolveLearningRecords([dupA, dupB, validB]);

    expect(resolution.records).toHaveLength(3);
    // Duplicates are diagnosable and do not become current winners
    expect(resolution.unresolved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'duplicate_identity',
          recordIds: expect.arrayContaining(['LR-0001']),
        }),
      ]),
    );
    expect(resolution.currentSummary.map(r => r.id)).toEqual(['LR-0002']);
    expect(resolution.currentSummary.some(r => r.id === 'LR-0001')).toBe(false);
  });

  it('reports a self-cycle without choosing a winner', () => {
    const self = source(
      'learning-records/0004-loop.md',
      `---
Status: superseded by LR-0004
---

# Self loop

This record incorrectly supersedes itself.

## Evidence

Demonstrated by a written explanation of muting.
`,
    );

    const resolution = resolveLearningRecords([self]);

    expect(resolution.unresolved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'self_cycle',
          recordIds: expect.arrayContaining(['LR-0004']),
        }),
      ]),
    );
    // Unresolved chain → remain visible (not silently dropped)
    expect(resolution.currentSummary.map(r => r.id)).toEqual(['LR-0004']);
  });

  it('reports a multi-node cycle without choosing a winner', () => {
    const a = source(
      'learning-records/0001-a.md',
      `---
Status: superseded by LR-0002
---

# A

Understanding A for future sessions.

## Evidence

Demonstrated by explaining A.
`,
    );
    const b = source(
      'learning-records/0002-b.md',
      `---
Status: superseded by LR-0003
---

# B

Understanding B for future sessions.

## Evidence

Demonstrated by explaining B.
`,
    );
    const c = source(
      'learning-records/0003-c.md',
      `---
Status: superseded by LR-0001
---

# C

Understanding C for future sessions.

## Evidence

Demonstrated by explaining C.
`,
    );

    const resolution = resolveLearningRecords([a, b, c]);

    expect(resolution.unresolved.some(u => u.reason === 'cycle')).toBe(true);
    const cycle = resolution.unresolved.find(u => u.reason === 'cycle')!;
    expect(cycle.recordIds.sort()).toEqual(['LR-0001', 'LR-0002', 'LR-0003']);
    // No winner selected from the cycle
    expect(resolution.currentSummary.map(r => r.id).sort()).toEqual([
      'LR-0001',
      'LR-0002',
      'LR-0003',
    ]);
  });

  it('does not exclude a record when the successor is malformed', () => {
    const resolution = resolveLearningRecords([
      supersededA,
      source('learning-records/0002-broken.md', 'not a learning record at all'),
    ]);

    expect(resolution.records).toHaveLength(2);
    expect(resolution.records[1]!.parseStatus).toBe('malformed');
    expect(resolution.currentSummary.map(r => r.id)).toEqual(['LR-0001']);
    expect(resolution.unresolved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'malformed_successor',
          recordIds: expect.arrayContaining(['LR-0001', 'LR-0002']),
        }),
      ]),
    );
  });

  it('includes active valid records in current summary and preserves input order of history', () => {
    const resolution = resolveLearningRecords([validC, activeA, validB]);

    expect(resolution.records.map(r => r.id)).toEqual(['LR-0003', 'LR-0001', 'LR-0002']);
    expect(resolution.currentSummary.map(r => r.id)).toEqual(['LR-0003', 'LR-0001', 'LR-0002']);
    expect(resolution.unresolved).toEqual([]);
  });

  it('never uses filename ordering or activity to invent a current winner', () => {
    // Higher number / later path must not force mastery or automatic supersession.
    const resolution = resolveLearningRecords([
      activeA,
      source(
        'learning-records/0099-later-file.md',
        `# Later file

A separate later note about dynamics for future sessions.

## Evidence

Demonstrated by playing soft then loud on request.
`,
      ),
    ]);

    expect(resolution.currentSummary.map(r => r.id)).toEqual(['LR-0001', 'LR-0099']);
    expect(resolution.records).toHaveLength(2);
    expect(resolution.unresolved).toEqual([]);
  });

  it('keeps partial and malformed records in history without elevating them to current evidence', () => {
    const resolution = resolveLearningRecords([
      activeA,
      source('learning-records/0008-empty.md', ''),
      source(
        'learning-records/0006-title-only.md',
        `# Only a title

## Evidence

Demonstrated by explaining the concept aloud.
`,
      ),
    ]);

    expect(resolution.records).toHaveLength(3);
    expect(resolution.currentSummary.map(r => r.id)).toEqual(['LR-0001']);
    expect(resolution.records.filter(r => r.parseStatus !== 'valid')).toHaveLength(2);
  });

  it('keeps title-only and invalid-path records in history but out of current summary', () => {
    const resolution = resolveLearningRecords([
      activeA,
      source('learning-records/0002-title-only.md', `# Title only`),
      source(
        'learning-records/0003-viewed-only.md',
        `# Viewed only

## Evidence

Viewed the page.
`,
      ),
      source(
        'notes/0004-valid-content.md',
        `# Valid content at wrong path

This body would be valid if the path were a numbered learning-records file.
`,
      ),
    ]);

    expect(resolution.records).toHaveLength(4);
    expect(resolution.records.every(r => r.source.rawText.length > 0)).toBe(true);
    expect(resolution.records.filter(r => r.parseStatus === 'partial')).toHaveLength(3);
    expect(resolution.currentSummary.map(r => r.id)).toEqual(['LR-0001']);
  });
});

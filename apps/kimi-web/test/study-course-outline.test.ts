import { describe, expect, it } from 'vitest';

import {
  extractHtmlTitle,
  LESSON_INDEX_CONTRACT_REVISION,
  authoritativePublishedLessons,
  parseLessonIndex,
  parseQuickPlanOutline,
} from '../src/study/domain/courseOutline';

const VALID_PLAN = `# Quick course plan

## Control
- Status: ready
- Revision: plan-v1

## Learning path
| Sequence | Slice ID | Title | Type | Source anchors | Observable outcome | Destination |
|---|---|---|---|---|---|---|
| 1 | Q01 | Feedback loops | lesson | ch. 2 | Explain a loop | lessons/0001-feedback-loops.html |
| 2 | Q02 | Loop glossary | reference | ch. 2 | Look up terms | reference/loop-glossary.html |
| 3 | Q03 | Boundary check | quiz | ch. 3 | Spot edge cases | lessons/0003-boundary-check.html |

## Visible deferrals
| Material | Source anchors | Why deferred | When to upgrade or revisit |
|---|---|---|---|
`;

describe('parseQuickPlanOutline', () => {
  it('parses the learning path table into ordered items', () => {
    const outline = parseQuickPlanOutline(VALID_PLAN);
    expect(outline).toBeDefined();
    expect(outline!.items).toHaveLength(3);
    expect(outline!.items[0]).toEqual({
      sequence: 1,
      title: 'Feedback loops',
      kind: 'lesson',
      destination: 'lessons/0001-feedback-loops.html',
    });
    expect(outline!.items[1]!.kind).toBe('reference');
    expect(outline!.items[2]!.kind).toBe('quiz');
  });

  it('returns undefined when the learning path section is missing', () => {
    expect(parseQuickPlanOutline('# Plan\n\n## Control\n- Status: ready\n')).toBeUndefined();
  });

  it('rejects non-contiguous sequences instead of showing a partial truth', () => {
    const broken = VALID_PLAN.replace('| 2 | Q02 |', '| 4 | Q02 |');
    expect(parseQuickPlanOutline(broken)).toBeUndefined();
  });

  it('rejects template placeholders', () => {
    const templated = VALID_PLAN.replace('Feedback loops', '{...}');
    expect(parseQuickPlanOutline(templated)).toBeUndefined();
  });

  it('drops placeholder destinations but keeps the item', () => {
    const noDest = VALID_PLAN.replace(
      '| lessons/0001-feedback-loops.html |',
      '| {...} |',
    );
    const outline = parseQuickPlanOutline(noDest);
    expect(outline).toBeDefined();
    expect(outline!.items[0]!.destination).toBeUndefined();
  });

  it('returns undefined for an empty table', () => {
    expect(parseQuickPlanOutline('## Learning path\n\n(no rows)\n')).toBeUndefined();
  });
});

describe('extractHtmlTitle', () => {
  it('reads a declared document title', () => {
    expect(extractHtmlTitle('<html><head><title>Feedback Loops</title></head>')).toBe('Feedback Loops');
  });

  it('returns undefined without a title or with an empty one', () => {
    expect(extractHtmlTitle('<html><body>no title</body></html>')).toBeUndefined();
    expect(extractHtmlTitle('<title>   </title>')).toBeUndefined();
  });
});

describe('parseLessonIndex', () => {
  const valid = {
    schemaVersion: 1,
    contractRevision: LESSON_INDEX_CONTRACT_REVISION,
    lessons: [
      {
        order: 1,
        path: 'lessons/0001-feedback-loops.html',
        title: 'Feedback loops',
        status: 'published',
      },
      {
        order: 2,
        path: 'lessons/0002-boundaries.html',
        title: 'Boundaries',
        status: 'planned',
      },
    ],
  };

  it('accepts the versioned ordered lesson manifest', () => {
    expect(parseLessonIndex(JSON.stringify(valid))).toEqual(valid);
  });

  it('rejects stale contracts, gaps, duplicate paths, and unsafe paths', () => {
    expect(parseLessonIndex(JSON.stringify({ ...valid, contractRevision: 'old' }))).toBeUndefined();
    expect(parseLessonIndex(JSON.stringify({
      ...valid,
      lessons: [{ ...valid.lessons[0], order: 2 }],
    }))).toBeUndefined();
    expect(parseLessonIndex(JSON.stringify({
      ...valid,
      lessons: [valid.lessons[0], { ...valid.lessons[1], path: valid.lessons[0].path }],
    }))).toBeUndefined();
    expect(parseLessonIndex(JSON.stringify({
      ...valid,
      lessons: [{ ...valid.lessons[0], path: '../secret.html' }],
    }))).toBeUndefined();
  });

  it('rejects malformed JSON and unknown publication states', () => {
    expect(parseLessonIndex('{')).toBeUndefined();
    expect(parseLessonIndex(JSON.stringify({
      ...valid,
      lessons: [{ ...valid.lessons[0], status: 'ready' }],
    }))).toBeUndefined();
  });
});


describe('authoritativePublishedLessons', () => {
  const valid = {
    schemaVersion: 1 as const,
    contractRevision: LESSON_INDEX_CONTRACT_REVISION,
    lessons: [
      {
        order: 1,
        path: 'lessons/0001-feedback-loops.html',
        title: 'Feedback loops',
        status: 'published' as const,
      },
      {
        order: 2,
        path: 'lessons/0002-boundaries.html',
        title: 'Boundaries',
        status: 'published' as const,
      },
      {
        order: 3,
        path: 'lessons/0003-planned.html',
        title: 'Planned',
        status: 'planned' as const,
      },
    ],
  };
  const existing = new Set([
    'lessons/0001-feedback-loops.html',
    'lessons/0002-boundaries.html',
  ]);

  it('accepts an index when count matches and every published path exists', () => {
    const published = authoritativePublishedLessons(valid, 2, existing);
    expect(published).toHaveLength(2);
    expect(published?.map((entry) => entry.title)).toEqual([
      'Feedback loops',
      'Boundaries',
    ]);
  });

  it('rejects when any published path is missing from the directory listing', () => {
    const incomplete = new Set(['lessons/0001-feedback-loops.html']);
    expect(authoritativePublishedLessons(valid, 2, incomplete)).toBeUndefined();
  });

  it('rejects when published count disagrees with the snapshot', () => {
    expect(authoritativePublishedLessons(valid, 1, existing)).toBeUndefined();
    expect(authoritativePublishedLessons(valid, 3, existing)).toBeUndefined();
  });

  it('rejects undefined / invalid manifests without inventing entries', () => {
    expect(authoritativePublishedLessons(undefined, 2, existing)).toBeUndefined();
    expect(authoritativePublishedLessons(valid, -1, existing)).toBeUndefined();
  });

  it('accepted list only contains paths that exist on disk', () => {
    const published = authoritativePublishedLessons(valid, 2, existing);
    expect(published?.every((entry) => existing.has(entry.path))).toBe(true);
  });
});

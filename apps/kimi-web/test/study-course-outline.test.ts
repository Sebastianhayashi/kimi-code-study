import { describe, expect, it } from 'vitest';

import {
  extractHtmlTitle,
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

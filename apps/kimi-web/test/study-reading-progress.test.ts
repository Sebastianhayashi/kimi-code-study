import { describe, expect, it } from 'vitest';
import {
  parseLessonBrief,
  parseReadingState,
  parseReviewDue,
} from '../src/study/domain/teachFiles';

const READING_STATE = `# Book reading state

## Source
- Title: 玩出来的产业
- Author: Someone
- File: source/book.epub

## Gate
- Status: reading
- Coverage: 42%

## Reading ledger
| Range | Structural role | Status | Notes and uncertainties |
|---|---|---|---|
| 第1-3章 | chapter | read | ok |
| 第4-6章 | chapter | read | ok |
| 第7-9章 | chapter | unread | next |
| 附录 | appendix | unread | |
`;

describe('parseReadingState', () => {
  it('reads the coverage field and ledger counts', () => {
    const p = parseReadingState(READING_STATE);
    expect(p.coverage).toBe(42);
    expect(p.bookTitle).toBe('玩出来的产业');
    expect(p.readRanges).toBe(2);
    expect(p.totalRanges).toBe(4);
    expect(p.currentRange).toBe('第7-9章');
  });

  it('falls back to ledger-derived coverage when the field is missing', () => {
    const p = parseReadingState(READING_STATE.replace('- Coverage: 42%\n', ''));
    expect(p.coverage).toBe(50);
  });

  it('returns nulls/zeros for an empty file', () => {
    const p = parseReadingState('');
    expect(p.coverage).toBeNull();
    expect(p.totalRanges).toBe(0);
    expect(p.currentRange).toBe('');
  });
});

const BRIEF = `# Lesson brief: 摞手实验

## Control
- Status: published
- Lesson: lessons/0001-luo-shou.html

## Primary capability slice
能用自己的物品设计一个“限制内共处”的小实验。

## Source anchors
- book.epub, 第3章
`;

describe('parseLessonBrief', () => {
  it('extracts status and capability', () => {
    const b = parseLessonBrief(BRIEF);
    expect(b.status).toBe('published');
    expect(b.capability).toBe('能用自己的物品设计一个“限制内共处”的小实验。');
  });

  it('tolerates missing sections', () => {
    const b = parseLessonBrief('# nothing here');
    expect(b.status).toBe('');
    expect(b.capability).toBe('');
  });
});

describe('parseReviewDue', () => {
  const today = new Date('2026-07-17T12:00:00');

  it('is true when a review line carries a past/today date', () => {
    expect(parseReviewDue('- [ ] 复习 第3课 2026-07-10', today)).toBe(true);
    expect(parseReviewDue('review lesson 3 on 2026-07-17', today)).toBe(true);
  });

  it('is false when all review dates are in the future or absent', () => {
    expect(parseReviewDue('- [ ] 复习 第3课 2026-08-01', today)).toBe(false);
    expect(parseReviewDue('no dates here', today)).toBe(false);
    expect(parseReviewDue('', today)).toBe(false);
  });
});

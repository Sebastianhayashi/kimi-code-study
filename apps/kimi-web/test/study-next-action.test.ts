import { describe, expect, it } from 'vitest';
import {
  selectNextAction,
  type DueReviewFact,
  type NextActionFacts,
  type PausedActionFact,
  type TutorRecommendationFact,
} from '../src/study/domain/nextAction';

function ready<T>(value: T) {
  return { status: 'ready' as const, value };
}

function due(
  overrides: Partial<DueReviewFact> & Pick<DueReviewFact, 'id'>,
): DueReviewFact {
  return {
    dueAt: '2026-07-01T00:00:00.000Z',
    prompt: `Review ${overrides.id}`,
    ...overrides,
  };
}

function paused(
  overrides: Partial<PausedActionFact> & Pick<PausedActionFact, 'id'>,
): PausedActionFact {
  return {
    pausedAt: '2026-07-01T00:00:00.000Z',
    summary: `Paused ${overrides.id}`,
    ...overrides,
  };
}

function tutor(
  overrides: Partial<TutorRecommendationFact> & Pick<TutorRecommendationFact, 'id'>,
): TutorRecommendationFact {
  return {
    recommendedAt: '2026-07-01T00:00:00.000Z',
    summary: `Tutor suggests ${overrides.id}`,
    ...overrides,
  };
}

describe('selectNextAction', () => {
  it('falls back to ask tutor when no facts are provided', () => {
    const selected = selectNextAction({});
    expect(selected).toEqual({
      source: 'ask_tutor',
      reason: { code: 'ask_tutor' },
    });
  });

  it('selects an explicit due review with source and reason inputs', () => {
    const item = due({
      id: 'review-1',
      dueAt: '2026-07-10T09:00:00.000Z',
      prompt: 'Explain why the C major scale starts on C',
    });
    const selected = selectNextAction({
      dueReviews: ready([item]),
    });
    expect(selected).toEqual({
      source: 'due_review',
      actionId: 'review-1',
      reason: {
        code: 'due_review',
        reviewId: 'review-1',
        prompt: 'Explain why the C major scale starts on C',
        dueAt: '2026-07-10T09:00:00.000Z',
      },
    });
  });

  it('selects an explicitly paused learning action', () => {
    const item = paused({
      id: 'pause-1',
      pausedAt: '2026-07-11T12:00:00.000Z',
      summary: 'Continue practice: name the open strings',
    });
    const selected = selectNextAction({
      pausedActions: ready([item]),
    });
    expect(selected).toEqual({
      source: 'paused_action',
      actionId: 'pause-1',
      reason: {
        code: 'paused_action',
        actionId: 'pause-1',
        summary: 'Continue practice: name the open strings',
      },
    });
  });

  it('selects an explicit tutor recommendation', () => {
    const item = tutor({
      id: 'rec-1',
      recommendedAt: '2026-07-12T08:00:00.000Z',
      summary: 'Next: open-string fretting without looking',
    });
    const selected = selectNextAction({
      tutorRecommendations: ready([item]),
    });
    expect(selected).toEqual({
      source: 'tutor_recommendation',
      actionId: 'rec-1',
      reason: {
        code: 'tutor_recommendation',
        recommendationId: 'rec-1',
        summary: 'Next: open-string fretting without looking',
      },
    });
  });

  it('selects Mission interview when Mission is explicitly missing', () => {
    const selected = selectNextAction({
      mission: { status: 'missing' },
    });
    expect(selected).toEqual({
      source: 'mission_interview',
      reason: { code: 'mission_missing' },
    });
  });

  it('selects Mission interview when Mission is ready and marked not present', () => {
    const selected = selectNextAction({
      mission: ready({ present: false }),
    });
    expect(selected.source).toBe('mission_interview');
    expect(selected.reason).toEqual({ code: 'mission_missing' });
  });

  it('selects Mission interview when Mission file is empty', () => {
    const selected = selectNextAction({
      mission: { status: 'empty' },
    });
    expect(selected.source).toBe('mission_interview');
  });

  it('does not treat a present Mission as an action by itself', () => {
    const selected = selectNextAction({
      mission: ready({ present: true }),
    });
    expect(selected.source).toBe('ask_tutor');
  });

  describe('priority', () => {
    const factsWithAll: NextActionFacts = {
      dueReviews: ready([due({ id: 'review-top' })]),
      pausedActions: ready([paused({ id: 'pause-mid' })]),
      tutorRecommendations: ready([tutor({ id: 'rec-low' })]),
      mission: { status: 'missing' },
    };

    it('prefers due review over paused, tutor, and Mission interview', () => {
      expect(selectNextAction(factsWithAll).source).toBe('due_review');
      expect(selectNextAction(factsWithAll).actionId).toBe('review-top');
    });

    it('prefers paused action over tutor recommendation and Mission interview', () => {
      const selected = selectNextAction({
        ...factsWithAll,
        dueReviews: ready([]),
      });
      expect(selected.source).toBe('paused_action');
      expect(selected.actionId).toBe('pause-mid');
    });

    it('prefers tutor recommendation over Mission interview', () => {
      const selected = selectNextAction({
        dueReviews: ready([]),
        pausedActions: ready([]),
        tutorRecommendations: ready([tutor({ id: 'rec-only' })]),
        mission: { status: 'missing' },
      });
      expect(selected.source).toBe('tutor_recommendation');
      expect(selected.actionId).toBe('rec-only');
    });

    it('uses Mission interview only when higher-priority candidates are absent', () => {
      const selected = selectNextAction({
        dueReviews: ready([]),
        pausedActions: ready([]),
        tutorRecommendations: ready([]),
        mission: { status: 'missing' },
      });
      expect(selected.source).toBe('mission_interview');
    });
  });

  describe('untrustworthy sources cannot win', () => {
    for (const status of ['partial', 'malformed', 'error', 'permission'] as const) {
      it(`rejects due reviews with status ${status}`, () => {
        const selected = selectNextAction({
          dueReviews: { status },
          pausedActions: ready([paused({ id: 'pause-fallback' })]),
        });
        expect(selected.source).toBe('paused_action');
        expect(selected.actionId).toBe('pause-fallback');
      });

      it(`rejects paused actions with status ${status}`, () => {
        const selected = selectNextAction({
          pausedActions: { status },
          tutorRecommendations: ready([tutor({ id: 'rec-fallback' })]),
        });
        expect(selected.source).toBe('tutor_recommendation');
      });

      it(`rejects tutor recommendations with status ${status}`, () => {
        const selected = selectNextAction({
          tutorRecommendations: { status },
          mission: { status: 'missing' },
        });
        expect(selected.source).toBe('mission_interview');
      });

      it(`does not treat Mission ${status} as Mission-missing`, () => {
        const selected = selectNextAction({
          mission: { status },
        });
        expect(selected.source).toBe('ask_tutor');
      });
    }

    it('treats missing due-review source as no review candidate', () => {
      const selected = selectNextAction({
        dueReviews: { status: 'missing' },
        tutorRecommendations: ready([tutor({ id: 'rec-after-missing-reviews' })]),
      });
      expect(selected.source).toBe('tutor_recommendation');
    });

    it('ignores empty ready lists and falls through', () => {
      const selected = selectNextAction({
        dueReviews: ready([]),
        pausedActions: ready([]),
        tutorRecommendations: ready([]),
      });
      expect(selected.source).toBe('ask_tutor');
    });
  });

  describe('stable ordering within the same source type', () => {
    // Within one source type, order only by explicit stable fields documented
    // on the facts: dueAt/pausedAt/recommendedAt ascending, then id ascending.
    // Insertion order and any activity heuristics are ignored.

    it('picks the earliest dueAt, then the smaller id', () => {
      const selected = selectNextAction({
        dueReviews: ready([
          due({ id: 'b', dueAt: '2026-07-15T00:00:00.000Z' }),
          due({ id: 'a', dueAt: '2026-07-10T00:00:00.000Z' }),
          due({ id: 'c', dueAt: '2026-07-10T00:00:00.000Z' }),
        ]),
      });
      // Same dueAt for a and c → id ascending picks 'a'
      expect(selected.actionId).toBe('a');
      expect(selected.source).toBe('due_review');
    });

    it('picks the earliest pausedAt, then the smaller id', () => {
      const selected = selectNextAction({
        pausedActions: ready([
          paused({ id: 'z', pausedAt: '2026-07-14T00:00:00.000Z' }),
          paused({ id: 'm', pausedAt: '2026-07-12T00:00:00.000Z' }),
          paused({ id: 'n', pausedAt: '2026-07-12T00:00:00.000Z' }),
        ]),
      });
      expect(selected.actionId).toBe('m');
    });

    it('picks the earliest recommendedAt, then the smaller id', () => {
      const selected = selectNextAction({
        tutorRecommendations: ready([
          tutor({ id: 'r2', recommendedAt: '2026-07-20T00:00:00.000Z' }),
          tutor({ id: 'r1', recommendedAt: '2026-07-18T00:00:00.000Z' }),
          tutor({ id: 'r0', recommendedAt: '2026-07-18T00:00:00.000Z' }),
        ]),
      });
      expect(selected.actionId).toBe('r0');
    });

    it('does not prefer later insertion order when timestamps and ids differ', () => {
      const selected = selectNextAction({
        dueReviews: ready([
          due({ id: 'later-id', dueAt: '2026-08-01T00:00:00.000Z' }),
          due({ id: 'earlier-id', dueAt: '2026-07-01T00:00:00.000Z' }),
        ]),
      });
      expect(selected.actionId).toBe('earlier-id');
    });
  });

  describe('never uses activity or mastery signals', () => {
    it('ignores smuggled activity fields and still asks the tutor', () => {
      const smuggled = {
        lessonCount: 12,
        fileCount: 40,
        chatCount: 99,
        lastOpenedAt: '2026-07-13T23:59:59.000Z',
        streak: 14,
        percent: 67,
        mastery: 0.9,
      };
      const selected = selectNextAction(smuggled as NextActionFacts);
      expect(selected.source).toBe('ask_tutor');
      expect(selected).not.toHaveProperty('score');
      expect(JSON.stringify(selected)).not.toMatch(
        /lessonCount|fileCount|chatCount|lastOpened|streak|percent|mastery/i,
      );
    });

    it('does not attach an opaque score to a selected action', () => {
      const selected = selectNextAction({
        tutorRecommendations: ready([tutor({ id: 'rec-score-check' })]),
      });
      expect(selected).not.toHaveProperty('score');
      expect(selected.source).toBe('tutor_recommendation');
      expect(selected.reason).toMatchObject({
        code: 'tutor_recommendation',
        recommendationId: 'rec-score-check',
        summary: expect.any(String),
      });
    });
  });
});

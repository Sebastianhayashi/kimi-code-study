/**
 * Pure, UI-independent selector for the single Kimi Study home action.
 *
 * Chooses only from explicit, attributable learning facts. Never infers a
 * next step from activity signals (lesson/file/chat counts, last-opened time,
 * streak, percent, or mastery).
 *
 * ## MVP priority (highest first)
 *
 * 1. explicit due review item
 * 2. explicitly paused current learning action
 * 3. explicit tutor recommendation
 * 4. Mission-missing interview action
 * 5. honest fallback: ask tutor to decide next step
 *
 * ## Trust
 *
 * Only `status: 'ready'` sources can contribute a winning candidate from their
 * value. `partial`, `malformed`, `error`, and `permission` never win as if
 * trustworthy. `missing` / `empty` mean “no candidate” for review / pause /
 * tutor sources. For Mission, `missing`, `empty`, or `ready` with
 * `present: false` is the attributable signal that Mission interview is needed;
 * untrustworthy Mission statuses do not count as Mission-missing.
 *
 * ## Tie-breaking (same source type)
 *
 * Multiple candidates of one type are ordered only by explicit stable fields:
 * - due reviews: `dueAt` ascending, then `id` ascending
 * - paused actions: `pausedAt` ascending, then `id` ascending
 * - tutor recommendations: `recommendedAt` ascending, then `id` ascending
 *
 * Insertion order is ignored. No opaque score is produced.
 */

/** Trustworthy load: the value may be used for selection. */
export type ReadyFactSource<T> = {
  readonly status: 'ready';
  readonly value: T;
};

/**
 * Non-ready load outcomes. Untrustworthy statuses (`partial` | `malformed` |
 * `error` | `permission`) can never win. `missing` | `empty` contribute no
 * candidate for list sources; for Mission they signal interview (see above).
 */
export type UnreadyFactSource = {
  readonly status: 'missing' | 'empty' | 'partial' | 'malformed' | 'error' | 'permission';
};

export type FactSource<T> = ReadyFactSource<T> | UnreadyFactSource;

/** Explicit review item already known to be due (caller filters by date). */
export interface DueReviewFact {
  readonly id: string;
  /** ISO-8601 instant used only for stable ordering among due items. */
  readonly dueAt: string;
  /** Retrieval-practice prompt text for the UI reason line. */
  readonly prompt: string;
}

/** Learner-paused action that is still unfinished. */
export interface PausedActionFact {
  readonly id: string;
  /** ISO-8601 instant when the learner paused; stable ordering field. */
  readonly pausedAt: string;
  readonly summary: string;
}

/** Tutor-authored recommendation the learner has not dismissed. */
export interface TutorRecommendationFact {
  readonly id: string;
  /** ISO-8601 instant of the recommendation; stable ordering field. */
  readonly recommendedAt: string;
  readonly summary: string;
}

/** Mission presence as an attributable fact (not inferred from activity). */
export interface MissionFact {
  readonly present: boolean;
}

/**
 * Inputs to the selector. Only these fields are read. Callers must not rely on
 * smuggling lessonCount / fileCount / chatCount / lastOpenedAt / streak /
 * percent / mastery — they are never consulted.
 */
export interface NextActionFacts {
  readonly dueReviews?: FactSource<readonly DueReviewFact[]>;
  readonly pausedActions?: FactSource<readonly PausedActionFact[]>;
  readonly tutorRecommendations?: FactSource<readonly TutorRecommendationFact[]>;
  readonly mission?: FactSource<MissionFact>;
}

export type NextActionSource =
  | 'due_review'
  | 'paused_action'
  | 'tutor_recommendation'
  | 'mission_interview'
  | 'ask_tutor';

/** Human-readable reason inputs for the UI (no opaque score). */
export type NextActionReason =
  | {
      readonly code: 'due_review';
      readonly reviewId: string;
      readonly prompt: string;
      readonly dueAt: string;
    }
  | {
      readonly code: 'paused_action';
      readonly actionId: string;
      readonly summary: string;
    }
  | {
      readonly code: 'tutor_recommendation';
      readonly recommendationId: string;
      readonly summary: string;
    }
  | { readonly code: 'mission_missing' }
  | { readonly code: 'ask_tutor' };

export interface SelectedNextAction {
  readonly source: NextActionSource;
  readonly reason: NextActionReason;
  /** Identity of the chosen candidate when the source is item-based. */
  readonly actionId?: string;
}

function isReady<T>(source: FactSource<T> | undefined): source is ReadyFactSource<T> {
  return source?.status === 'ready';
}

/**
 * Stable total order: primary key ascending, then id ascending.
 * Uses string compare so ISO-8601 instants order correctly without Date parsing.
 */
function pickStableFirst<T extends { readonly id: string }>(
  items: readonly T[],
  primaryKey: (item: T) => string,
): T | undefined {
  if (items.length === 0) return undefined;
  let best = items[0]!;
  for (let i = 1; i < items.length; i++) {
    const item = items[i]!;
    const byPrimary = primaryKey(item).localeCompare(primaryKey(best));
    if (byPrimary < 0 || (byPrimary === 0 && item.id.localeCompare(best.id) < 0)) {
      best = item;
    }
  }
  return best;
}

function pickDueReview(
  source: FactSource<readonly DueReviewFact[]> | undefined,
): DueReviewFact | undefined {
  if (!isReady(source)) return undefined;
  return pickStableFirst(source.value, (item) => item.dueAt);
}

function pickPausedAction(
  source: FactSource<readonly PausedActionFact[]> | undefined,
): PausedActionFact | undefined {
  if (!isReady(source)) return undefined;
  return pickStableFirst(source.value, (item) => item.pausedAt);
}

function pickTutorRecommendation(
  source: FactSource<readonly TutorRecommendationFact[]> | undefined,
): TutorRecommendationFact | undefined {
  if (!isReady(source)) return undefined;
  return pickStableFirst(source.value, (item) => item.recommendedAt);
}

/**
 * Mission interview is warranted only from attributable absence:
 * - load status `missing` or `empty`, or
 * - `ready` with `present: false`.
 * Untrustworthy statuses never imply Mission-missing.
 */
function isMissionMissing(source: FactSource<MissionFact> | undefined): boolean {
  if (source === undefined) return false;
  if (source.status === 'missing' || source.status === 'empty') return true;
  if (source.status === 'ready') return source.value.present === false;
  return false;
}

/**
 * Select the single home next action from explicit learning facts.
 * Deterministic: same inputs always yield the same output; no I/O or globals.
 */
export function selectNextAction(facts: NextActionFacts): SelectedNextAction {
  const review = pickDueReview(facts.dueReviews);
  if (review !== undefined) {
    return {
      source: 'due_review',
      actionId: review.id,
      reason: {
        code: 'due_review',
        reviewId: review.id,
        prompt: review.prompt,
        dueAt: review.dueAt,
      },
    };
  }

  const paused = pickPausedAction(facts.pausedActions);
  if (paused !== undefined) {
    return {
      source: 'paused_action',
      actionId: paused.id,
      reason: {
        code: 'paused_action',
        actionId: paused.id,
        summary: paused.summary,
      },
    };
  }

  const recommendation = pickTutorRecommendation(facts.tutorRecommendations);
  if (recommendation !== undefined) {
    return {
      source: 'tutor_recommendation',
      actionId: recommendation.id,
      reason: {
        code: 'tutor_recommendation',
        recommendationId: recommendation.id,
        summary: recommendation.summary,
      },
    };
  }

  if (isMissionMissing(facts.mission)) {
    return {
      source: 'mission_interview',
      reason: { code: 'mission_missing' },
    };
  }

  return {
    source: 'ask_tutor',
    reason: { code: 'ask_tutor' },
  };
}

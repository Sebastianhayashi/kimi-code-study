/**
 * Pure screen mapper for the Kimi Study product UI.
 *
 * The Vue shell renders exactly one screen derived here; it never inspects
 * runtime/session internals directly. Mapping is a pure function so the stage
 * × phase matrix stays unit-testable without mounting components.
 */

import type { StudyProductView } from './studyProductController';

export type StudyScreen =
  /** Readiness has not been checked yet. */
  | 'loading'
  /** The Kimi server cannot be reached at all. */
  | 'unavailable'
  /** Upload entry, prepared catalog, and resumable course list. */
  | 'home'
  /** One-time Quick/Deep decision for a fresh upload. */
  | 'mode_select'
  /** Source work and Mission clarification running in parallel. */
  | 'preparing'
  /** Outline review plus generation progress. */
  | 'outline'
  /** Lessons are (partially) published and readable. */
  | 'learning'
  /** A contract/blocker stopped the course; details come from issues. */
  | 'blocked'
  /** Runtime or artifact failure; details come from issues. */
  | 'error';

export interface StudyScreenModel {
  readonly screen: StudyScreen;
  /** True while upload, start, or an outline replacement is in flight. */
  readonly busy: boolean;
  /** Provider login is missing: generation is impossible, browsing is not. */
  readonly authRequired: boolean;
  /** Human-readable readiness explanation from the runtime, when present. */
  readonly readinessMessage?: string;
  /** A validated Mission question card is waiting for the learner. */
  readonly questionOpen: boolean;
}

function screenForPhase(view: StudyProductView): StudyScreen {
  const phase = view.snapshot?.phase;
  switch (phase) {
    case 'mode_selection':
      return 'mode_select';
    case 'preparing_material':
    case 'clarifying_mission':
    case 'upgrading':
      return 'preparing';
    case 'designing_course':
    case 'generating_lessons':
      return 'outline';
    case 'learning_ready':
    case 'learning':
      return 'learning';
    case 'blocked':
      return 'blocked';
    default:
      // A starting/working stage without a snapshot has nothing to show yet;
      // fall back to the safest entry point instead of inventing progress.
      return 'home';
  }
}

export function deriveStudyScreen(view: StudyProductView): StudyScreenModel {
  const busy = view.stage === 'uploading'
    || view.stage === 'starting'
    || view.planChange.status === 'submitting'
    || view.planChange.status === 'waiting';
  const authRequired = view.readiness?.auth === 'required';
  const questionOpen = view.question !== null;

  let screen: StudyScreen;
  if (view.readiness === null) {
    screen = 'loading';
  } else if (view.readiness.api === 'unreachable') {
    screen = 'unavailable';
  } else {
    switch (view.stage) {
      case 'idle':
      case 'uploading':
        screen = 'home';
        break;
      case 'mode_selection':
        screen = 'mode_select';
        break;
      case 'error':
        screen = 'error';
        break;
      default:
        screen = screenForPhase(view);
        break;
    }
  }

  return {
    screen,
    busy,
    authRequired,
    readinessMessage: view.readiness?.message,
    questionOpen,
  };
}

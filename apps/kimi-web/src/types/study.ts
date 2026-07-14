/**
 * Kimi Study data model.
 *
 * These types describe the learning content that the backend will eventually
 * derive from Teach Skill files (MISSION.md, RESOURCES.md, learning-records/,
 * NOTES.md). For now the frontend uses a static mock dataset so we can settle
 * the UI shape before Grok wires up the real backend.
 */

/** A single learning mission, roughly equivalent to one MISSION.md. */
export interface StudyMission {
  id: string;
  title: string;
  description: string;
  /** Estimated time to complete, e.g. "30 min" or "2 hours". */
  duration: string;
  /** Topics or skills this mission covers. */
  tags: string[];
  /** Order within the learning path. */
  order: number;
  /** Whether this mission has been started. */
  started: boolean;
  /** Whether this mission is fully completed. */
  completed: boolean;
  /** Number of sections/steps inside the mission (derived from MISSION.md). */
  totalSteps: number;
  /** How many steps the learner has finished. */
  completedSteps: number;
}

/** A learning resource attached to a mission or the global library. */
export interface StudyResource {
  id: string;
  missionId?: string;
  title: string;
  type: 'article' | 'video' | 'epub' | 'pdf' | 'exercise' | 'link';
  /** Human-readable source, e.g. filename or URL host. */
  source: string;
  /** Whether the learner has marked this resource as consumed. */
  consumed: boolean;
}

/** A piece of evidence that the learner understood something. */
export interface LearningRecord {
  id: string;
  missionId: string;
  /** What capability or question this record demonstrates. */
  prompt: string;
  /** Learner's answer / work product. */
  response: string;
  /** When the record was created (ISO 8601). */
  createdAt: string;
  /** If true, a newer record supersedes this one for the same capability. */
  superseded: boolean;
}

/** Aggregate learner state derived from missions and records. */
export interface StudyProgress {
  totalMissions: number;
  completedMissions: number;
  inProgressMissions: number;
  totalResources: number;
  consumedResources: number;
  totalRecords: number;
}

/** The complete study context for the current workspace. */
export interface StudyContext {
  workspaceName: string;
  learnerName: string;
  missions: StudyMission[];
  resources: StudyResource[];
  records: LearningRecord[];
}

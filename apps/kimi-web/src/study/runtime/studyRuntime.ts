import type {
  AppQuestionRequest,
  QuestionResponse,
} from '../../api/types';
import type {
  ContractIssue,
  CourseSnapshot,
  StudyArtifactLoad,
  UploadedMaterial,
} from '../domain/courseContract';
import type { CertifiedCatalogMaterial } from '../domain/catalogPackage';
import { validatePublicCopy } from '../domain/studyPolicy';
import type { StudyCourseBinding } from './courseRegistry';

export interface StudyRuntimeReadiness {
  readonly api: 'ready' | 'unreachable';
  readonly auth: 'ready' | 'required';
  readonly backend: 'v1' | 'v2' | 'unknown';
  readonly capabilities: Readonly<Record<string, boolean>>;
  readonly message?: string;
}

export type StudyRuntimeSnapshotLoad = StudyArtifactLoad
  | { readonly status: 'missing' }
  | { readonly status: 'unavailable'; readonly issues: readonly ContractIssue[] };

export type StudyQuestion = AppQuestionRequest & {
  readonly questions: readonly [AppQuestionRequest['questions'][number]];
};

export interface StudyRuntimeWatchHandlers {
  readonly onQuestion: (question: StudyQuestion) => void;
  readonly onQuestionClosed: (questionId: string) => void;
  readonly onArtifactChanged: () => void;
  readonly onConnectionChange: (connected: boolean) => void;
  readonly onPolicyViolation: (message: string) => void;
}

export interface StartCourseInput {
  readonly snapshot: CourseSnapshot;
  readonly uploadedMaterial?: UploadedMaterial;
  readonly catalogMaterial?: CertifiedCatalogMaterial;
}

export interface StudyRuntimePort {
  checkReadiness(): Promise<StudyRuntimeReadiness>;
  uploadMaterial(file: File): Promise<UploadedMaterial>;
  startCourse(input: StartCourseInput): Promise<StudyCourseBinding>;
  resumeCourse(courseId: string): Promise<StudyCourseBinding | undefined>;
  loadSnapshot(courseId: string): Promise<StudyRuntimeSnapshotLoad>;
  watchCourse(courseId: string, handlers: StudyRuntimeWatchHandlers): Promise<() => void>;
  answerQuestion(courseId: string, questionId: string, response: QuestionResponse): Promise<void>;
  dismissQuestion(courseId: string, questionId: string): Promise<void>;
  requestGeneration(courseId: string, planRevision: string): Promise<void>;
}

export function normalizeStudyQuestion(
  request: AppQuestionRequest,
): { readonly status: 'ready'; readonly question: StudyQuestion }
  | { readonly status: 'invalid'; readonly message: string } {
  if (request.questions.length !== 1) {
    return { status: 'invalid', message: 'Study questions must contain exactly one question.' };
  }
  const item = request.questions[0]!;
  if (item.multiSelect === true) {
    return { status: 'invalid', message: 'Study question cards must be single-select.' };
  }
  if (item.options.length < 2 || item.options.length > 4) {
    return { status: 'invalid', message: 'Study question cards require 2-4 options.' };
  }
  const publicCopy = [
    item.header,
    item.question,
    item.body,
    item.otherLabel,
    item.otherDescription,
    ...item.options.flatMap((option) => [option.label, option.description]),
  ].filter((value): value is string => value !== undefined).join('\n');
  if (validatePublicCopy(publicCopy).length > 0) {
    return { status: 'invalid', message: 'Study question card exposes internal workflow language.' };
  }
  return {
    status: 'ready',
    question: { ...request, questions: [item] },
  };
}

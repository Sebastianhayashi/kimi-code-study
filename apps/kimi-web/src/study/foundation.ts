/** Stable UI-facing surface for the Kimi Study product foundation. */

export { useStudyProduct, STUDY_PRODUCT_INJECTION_KEY } from './composables/useStudyProduct';
export type { StudyProductApi, UseStudyProductOptions } from './composables/useStudyProduct';

export {
  parseCatalogPackageManifest,
  STUDY_PACKAGE_CONTRACT_REVISION,
} from './domain/catalogPackage';
export type {
  CatalogPackageLoad,
  CatalogPackageManifest,
  CertifiedCatalogMaterial,
} from './domain/catalogPackage';

export {
  extractHtmlTitle,
  LESSON_INDEX_CONTRACT_REVISION,
  LESSON_INDEX_PATH,
  parseLessonIndex,
  parseQuickPlanOutline,
  QUICK_PLAN_PATH,
} from './domain/courseOutline';
export type {
  CourseOutline,
  CourseOutlineItem,
  LessonIndex,
  LessonIndexEntry,
  LessonIndexStatus,
} from './domain/courseOutline';

export type {
  ContractIssue,
  CoursePhase,
  CourseSnapshot,
  EvidenceLevel,
  StudyMode,
} from './domain/courseContract';

export type { LessonSource, LessonStatus } from './domain/lessonDocument';

export type { TutorExchange } from './domain/tutorThread';

export type {
  StudyProductStage,
  StudyProductView,
} from './product/studyProductController';

export { deriveStudyScreen } from './product/studyScreenModel';
export type {
  StudyScreen,
  StudyScreenModel,
} from './product/studyScreenModel';

export type { StudyCourseBinding } from './runtime/courseRegistry';
export type { FsEntry, QuestionResponse } from '../api/types';
export type {
  StudyQuestion,
  StudyRuntimeReadiness,
  StudyTextLoad,
  TutorLessonContext,
} from './runtime/studyRuntime';

/** Stable UI-facing surface for the Kimi Study product foundation. */

export { useStudyProduct } from './composables/useStudyProduct';
export type { UseStudyProductOptions } from './composables/useStudyProduct';

export {
  parseCatalogPackageManifest,
  STUDY_PACKAGE_CONTRACT_REVISION,
} from './domain/catalogPackage';
export type {
  CatalogPackageLoad,
  CatalogPackageManifest,
  CertifiedCatalogMaterial,
} from './domain/catalogPackage';

export type {
  ContractIssue,
  CoursePhase,
  CourseSnapshot,
  EvidenceLevel,
  StudyMode,
} from './domain/courseContract';

export type {
  StudyProductStage,
  StudyProductView,
} from './product/studyProductController';

export type { StudyQuestion, StudyRuntimeReadiness } from './runtime/studyRuntime';

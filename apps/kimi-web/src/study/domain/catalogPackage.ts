import type {
  ApprovalProvenance,
  CatalogMaterial,
  ContractIssue,
} from './courseContract';

export const STUDY_PACKAGE_SCHEMA_VERSION = 1 as const;
export const STUDY_PACKAGE_CONTRACT_REVISION = 'kimi-study-package-v1';
const MAX_MANIFEST_BYTES = 256 * 1024;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const PACKAGE_REF_PATTERN = /^catalog:\/\/[^\s@]+@sha256:[a-f0-9]{64}$/;
const REQUIRED_ARTIFACTS = [
  'source/BOOK-READING-STATE.md',
  'source/BOOK-OVERVIEW.md',
  'source/RIA-DISTILLATION.md',
  'source/ria/INDEX.md',
] as const;

const CERTIFIED_PACKAGE = Symbol('KimiStudyCertifiedPackage');

export type CertifiedCatalogMaterial = CatalogMaterial & {
  readonly packageRevision: string;
  readonly readingCertificateRevision: string;
  readonly riaRevision: string;
  readonly [CERTIFIED_PACKAGE]: true;
};

export interface CatalogPackageManifest {
  readonly schemaVersion: typeof STUDY_PACKAGE_SCHEMA_VERSION;
  readonly contractRevision: typeof STUDY_PACKAGE_CONTRACT_REVISION;
  readonly packageRef: string;
  readonly packageRevision: string;
  readonly materialId: string;
  readonly title: string;
  readonly author?: string;
  readonly edition?: string;
  readonly sourceRevision: string;
  readonly reading: {
    readonly coveragePercent: number;
    readonly blockedRanges: readonly string[];
    readonly certificateRevision: string;
  };
  readonly ria: { readonly status: 'ready'; readonly revision: string };
  readonly artifacts: Readonly<Record<string, string>>;
  readonly approvals: readonly ApprovalProvenance[];
  readonly builtAt: string;
}

export type CatalogPackageLoad =
  | { readonly status: 'ready'; readonly material: CertifiedCatalogMaterial; readonly manifest: CatalogPackageManifest }
  | { readonly status: 'malformed' | 'unsafe' | 'unsupported'; readonly issues: readonly ContractIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failure(
  status: 'malformed' | 'unsafe' | 'unsupported',
  code: string,
  path: string,
  message: string,
): CatalogPackageLoad {
  return { status, issues: [{ code, path, message, severity: 'error' }] };
}

function parseApprovals(value: unknown): readonly ApprovalProvenance[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const approvals: ApprovalProvenance[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || !['user', 'auto_policy', 'system'].includes(String(candidate.actor))
      || typeof candidate.policyRevision !== 'string'
      || typeof candidate.approvedRevision !== 'string'
      || typeof candidate.approvedAt !== 'string') return undefined;
    approvals.push({
      actor: candidate.actor as ApprovalProvenance['actor'],
      policyRevision: candidate.policyRevision,
      approvedRevision: candidate.approvedRevision,
      approvedAt: candidate.approvedAt,
      reason: typeof candidate.reason === 'string' ? candidate.reason : undefined,
    });
  }
  return approvals;
}

export function parseCatalogPackageManifest(content: string): CatalogPackageLoad {
  if (new TextEncoder().encode(content).byteLength > MAX_MANIFEST_BYTES) {
    return failure('unsafe', 'package_manifest_too_large', '', 'Catalog package manifest exceeds the safe size limit.');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(content) as unknown;
  } catch {
    return failure('malformed', 'package_manifest_malformed', '', 'Catalog package manifest is not valid JSON.');
  }
  if (!isRecord(raw)) return failure('malformed', 'package_manifest_malformed', '', 'Catalog package manifest must be an object.');
  if (raw.schemaVersion !== STUDY_PACKAGE_SCHEMA_VERSION
    || raw.contractRevision !== STUDY_PACKAGE_CONTRACT_REVISION) {
    return failure('unsupported', 'package_contract_unsupported', 'contractRevision', 'Catalog package contract is unsupported.');
  }
  if (typeof raw.packageRef !== 'string' || typeof raw.packageRevision !== 'string'
    || typeof raw.materialId !== 'string' || typeof raw.title !== 'string'
    || typeof raw.sourceRevision !== 'string' || typeof raw.builtAt !== 'string') {
    return failure('malformed', 'package_identity_malformed', '', 'Catalog package identity is incomplete.');
  }
  if (!PACKAGE_REF_PATTERN.test(raw.packageRef) || !SHA256_PATTERN.test(raw.packageRevision)
    || !raw.packageRef.endsWith(`@${raw.packageRevision}`)
    || !SHA256_PATTERN.test(raw.sourceRevision)) {
    return failure('unsafe', 'package_identity_mutable', 'packageRef', 'Catalog package and source identities must be immutable SHA-256 references.');
  }
  if (!isRecord(raw.reading) || raw.reading.coveragePercent !== 100
    || !Array.isArray(raw.reading.blockedRanges) || raw.reading.blockedRanges.length !== 0
    || typeof raw.reading.certificateRevision !== 'string'
    || raw.reading.certificateRevision.length === 0) {
    return failure('unsafe', 'package_reading_uncertified', 'reading', 'Catalog package requires 100% reading coverage, no blocked ranges, and a certificate revision.');
  }
  if (!isRecord(raw.ria) || raw.ria.status !== 'ready'
    || typeof raw.ria.revision !== 'string' || raw.ria.revision.length === 0) {
    return failure('unsafe', 'package_ria_uncertified', 'ria', 'Catalog package requires a ready RIA revision.');
  }
  const readingCertificateRevision = raw.reading.certificateRevision;
  const riaRevision = raw.ria.revision;
  if (!isRecord(raw.artifacts)) {
    return failure('malformed', 'package_artifacts_malformed', 'artifacts', 'Catalog package artifact checksums are missing.');
  }
  const artifacts: Record<string, string> = {};
  for (const [path, digest] of Object.entries(raw.artifacts)) {
    if (typeof digest !== 'string' || !SHA256_PATTERN.test(digest)) {
      return failure('unsafe', 'package_artifact_unverified', `artifacts.${path}`, `Catalog package has an invalid checksum for ${path}.`);
    }
    artifacts[path] = digest;
  }
  for (const required of REQUIRED_ARTIFACTS) {
    const digest = artifacts[required];
    if (typeof digest !== 'string' || !SHA256_PATTERN.test(digest)) {
      return failure('unsafe', 'package_artifact_unverified', `artifacts.${required}`, `Catalog package is missing a valid checksum for ${required}.`);
    }
  }
  const approvals = parseApprovals(raw.approvals);
  if (approvals === undefined || approvals.length < 2
    || !approvals.some((approval) => approval.approvedRevision === readingCertificateRevision)
    || !approvals.some((approval) => approval.approvedRevision === riaRevision)) {
    return failure('unsafe', 'package_approval_missing', 'approvals', 'Catalog package approvals do not cover reading and RIA revisions.');
  }

  const manifest: CatalogPackageManifest = {
    schemaVersion: STUDY_PACKAGE_SCHEMA_VERSION,
    contractRevision: STUDY_PACKAGE_CONTRACT_REVISION,
    packageRef: raw.packageRef,
    packageRevision: raw.packageRevision,
    materialId: raw.materialId,
    title: raw.title,
    author: typeof raw.author === 'string' ? raw.author : undefined,
    edition: typeof raw.edition === 'string' ? raw.edition : undefined,
    sourceRevision: raw.sourceRevision,
    reading: {
      coveragePercent: 100,
      blockedRanges: [],
      certificateRevision: readingCertificateRevision,
    },
    ria: { status: 'ready', revision: riaRevision },
    artifacts,
    approvals,
    builtAt: raw.builtAt,
  };
  return {
    status: 'ready',
    manifest,
    material: {
      materialId: manifest.materialId,
      title: manifest.title,
      sourceRevision: manifest.sourceRevision,
      packageRef: manifest.packageRef,
      packageRevision: manifest.packageRevision,
      readingCertificateRevision: manifest.reading.certificateRevision,
      riaRevision: manifest.ria.revision,
      [CERTIFIED_PACKAGE]: true,
    },
  };
}

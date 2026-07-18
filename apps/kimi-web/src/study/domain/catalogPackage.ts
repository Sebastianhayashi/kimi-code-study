import type {
  ApprovalProvenance,
  CatalogMaterial,
  ContractIssue,
} from './courseContract';

export const STUDY_PACKAGE_SCHEMA_VERSION = 2 as const;
export const STUDY_PACKAGE_CONTRACT_REVISION = 'kimi-study-package-v2';
export const STUDY_PACKAGE_V1_SCHEMA_VERSION = 1 as const;
export const STUDY_PACKAGE_V1_CONTRACT_REVISION = 'kimi-study-package-v1';
const MAX_MANIFEST_BYTES = 512 * 1024;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const RAW_SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PACKAGE_REF_PATTERN = /^catalog:\/\/[a-z0-9][a-z0-9._/-]{1,99}[a-z0-9]@sha256:[a-f0-9]{64}$/;
const MATERIAL_ID_PATTERN = /^[a-z0-9][a-z0-9._/-]{1,99}[a-z0-9]$/;
const SAFE_PACKAGE_PATH = /^source\/[\p{L}\p{N}][\p{L}\p{N}._/()+ -]*$/u;
const REQUIRED_ARTIFACTS = [
  'source/BOOK-READING-STATE.md',
  'source/BOOK-OVERVIEW.md',
  'source/RIA-DISTILLATION.md',
  'source/ria/INDEX.md',
] as const;

const CERTIFIED_PACKAGE = Symbol('KimiStudyCertifiedPackage');

export type CertifiedCatalogMaterial = CatalogMaterial & {
  readonly packageRevision: string;
  readonly packageVersion: 1 | 2;
  readonly readingCertificateRevision: string;
  readonly riaRevision: string;
  readonly [CERTIFIED_PACKAGE]: true;
};

export interface CatalogPackageFile {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
  readonly role: string;
  readonly mediaType?: string;
}

export interface CatalogPackageManifestV1 {
  readonly schemaVersion: typeof STUDY_PACKAGE_V1_SCHEMA_VERSION;
  readonly contractRevision: typeof STUDY_PACKAGE_V1_CONTRACT_REVISION;
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

export interface CatalogPackageManifestV2 {
  readonly schemaVersion: typeof STUDY_PACKAGE_SCHEMA_VERSION;
  readonly contractRevision: typeof STUDY_PACKAGE_CONTRACT_REVISION;
  readonly packageRef: string;
  readonly packageRevision: string;
  readonly materialId: string;
  readonly materialKind: 'textbook' | 'book';
  readonly title: string;
  readonly subtitle?: string;
  readonly authors: readonly string[];
  readonly language: string;
  readonly publisher?: string;
  readonly edition?: string;
  readonly publicationYear?: number;
  readonly isbn?: string;
  readonly topics: readonly string[];
  readonly source: CatalogPackageFile;
  readonly cover?: CatalogPackageFile;
  readonly metadata: CatalogPackageFile;
  readonly rights: CatalogPackageFile;
  readonly reading: {
    readonly coveragePercent: 100;
    readonly blockedRanges: readonly [];
    readonly certificateRevision: string;
  };
  readonly ria: { readonly status: 'complete'; readonly revision: string };
  readonly approvals: readonly ApprovalProvenance[];
  readonly files: readonly CatalogPackageFile[];
  readonly builtAt: string;
}

export type CatalogPackageManifest = CatalogPackageManifestV1 | CatalogPackageManifestV2;

export type CatalogPackageLoad =
  | { readonly status: 'ready'; readonly material: CertifiedCatalogMaterial; readonly manifest: CatalogPackageManifest }
  | { readonly status: 'malformed' | 'unsafe' | 'unsupported'; readonly issues: readonly ContractIssue[] };

export type CatalogIndexLoad =
  | { readonly status: 'ready'; readonly materials: readonly CertifiedCatalogMaterial[] }
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

function indexFailure(
  status: 'malformed' | 'unsafe' | 'unsupported',
  code: string,
  path: string,
  message: string,
): CatalogIndexLoad {
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

function validMaterialId(value: string): boolean {
  return MATERIAL_ID_PATTERN.test(value)
    && !value.includes('..')
    && !value.includes('//')
    && !value.includes('@');
}

function validPackagePath(value: string): boolean {
  return value === value.normalize('NFC')
    && SAFE_PACKAGE_PATH.test(value)
    && !value.includes('\\')
    && !value.split('/').some((part) => part === '' || part === '.' || part === '..');
}

function parseFile(value: unknown): CatalogPackageFile | undefined {
  if (!isRecord(value)
    || typeof value.path !== 'string' || !validPackagePath(value.path)
    || typeof value.size !== 'number' || !Number.isSafeInteger(value.size) || value.size < 0
    || typeof value.sha256 !== 'string' || !RAW_SHA256_PATTERN.test(value.sha256)
    || typeof value.role !== 'string' || value.role.length === 0
    || (value.mediaType !== undefined && typeof value.mediaType !== 'string')) return undefined;
  return {
    path: value.path,
    size: value.size,
    sha256: value.sha256,
    role: value.role,
    mediaType: typeof value.mediaType === 'string' ? value.mediaType : undefined,
  };
}

function optionalStrings(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && item.trim().length > 0)) {
    return undefined;
  }
  return value as string[];
}

function certify(input: Omit<CertifiedCatalogMaterial, typeof CERTIFIED_PACKAGE>): CertifiedCatalogMaterial {
  return { ...input, [CERTIFIED_PACKAGE]: true };
}

/**
 * Canonical identity JSON shared with the v2 builder and server installer.
 * The v2 schema permits only safe integers, so JSON.stringify has an identical
 * integer representation in Python and TypeScript.
 */
export function canonicalCatalogPackageJson(value: Record<string, unknown>): string {
  const excluded = new Set(['packageRevision', 'packageRef', 'builtAt', 'signature', 'signatures']);
  const encoder = new TextEncoder();
  const compareUtf8 = (left: string, right: string): number => {
    const a = encoder.encode(left);
    const b = encoder.encode(right);
    for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
      const delta = a[index]! - b[index]!;
      if (delta !== 0) return delta;
    }
    return a.length - b.length;
  };
  const normalize = (candidate: unknown, topLevel: boolean): unknown => {
    if (candidate === null || typeof candidate === 'string' || typeof candidate === 'boolean') return candidate;
    if (typeof candidate === 'number') {
      if (!Number.isSafeInteger(candidate)) throw new Error('Catalog identity permits only safe integers.');
      return candidate;
    }
    if (Array.isArray(candidate)) return candidate.map((item) => normalize(item, false));
    if (!isRecord(candidate)) throw new Error('Catalog identity contains an unsupported JSON value.');
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(candidate).filter((key) => !(topLevel && excluded.has(key))).sort(compareUtf8)) {
      if (!/^[\x20-\x7e]+$/.test(key)) throw new Error('Catalog manifest property names must be ASCII.');
      normalized[key] = normalize(candidate[key], false);
    }
    return normalized;
  };
  return JSON.stringify(normalize(value, true));
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
  if (raw.schemaVersion === STUDY_PACKAGE_V1_SCHEMA_VERSION
    && raw.contractRevision === STUDY_PACKAGE_V1_CONTRACT_REVISION) return parseV1(raw);
  if (raw.schemaVersion === STUDY_PACKAGE_SCHEMA_VERSION
    && raw.contractRevision === STUDY_PACKAGE_CONTRACT_REVISION) return parseV2(raw);
  return failure('unsupported', 'package_contract_unsupported', 'contractRevision', 'Catalog package contract is unsupported.');
}

function parseV1(raw: Record<string, unknown>): CatalogPackageLoad {
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
    return failure('unsafe', 'package_reading_uncertified', 'reading', 'Catalog package requires complete reading coverage and a certificate revision.');
  }
  if (!isRecord(raw.ria) || raw.ria.status !== 'ready'
    || typeof raw.ria.revision !== 'string' || raw.ria.revision.length === 0) {
    return failure('unsafe', 'package_ria_uncertified', 'ria', 'Catalog package requires a ready RIA revision.');
  }
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
    if (!SHA256_PATTERN.test(artifacts[required] ?? '')) {
      return failure('unsafe', 'package_artifact_unverified', `artifacts.${required}`, `Catalog package is missing a valid checksum for ${required}.`);
    }
  }
  const approvals = parseApprovals(raw.approvals);
  const readingRevision = raw.reading.certificateRevision;
  const riaRevision = raw.ria.revision;
  if (approvals === undefined || approvals.length < 2
    || !approvals.some((approval) => approval.approvedRevision === readingRevision)
    || !approvals.some((approval) => approval.approvedRevision === riaRevision)) {
    return failure('unsafe', 'package_approval_missing', 'approvals', 'Catalog package approvals do not cover reading and RIA revisions.');
  }
  const manifest: CatalogPackageManifestV1 = {
    schemaVersion: 1,
    contractRevision: STUDY_PACKAGE_V1_CONTRACT_REVISION,
    packageRef: raw.packageRef,
    packageRevision: raw.packageRevision,
    materialId: raw.materialId,
    title: raw.title,
    author: typeof raw.author === 'string' ? raw.author : undefined,
    edition: typeof raw.edition === 'string' ? raw.edition : undefined,
    sourceRevision: raw.sourceRevision,
    reading: { coveragePercent: 100, blockedRanges: [], certificateRevision: readingRevision },
    ria: { status: 'ready', revision: riaRevision },
    artifacts,
    approvals,
    builtAt: raw.builtAt,
  };
  return {
    status: 'ready',
    manifest,
    material: certify({
      materialId: manifest.materialId,
      materialKind: 'book',
      title: manifest.title,
      authors: manifest.author === undefined ? [] : [manifest.author],
      language: 'und',
      edition: manifest.edition,
      topics: [],
      sourceRevision: manifest.sourceRevision,
      packageRef: manifest.packageRef,
      packageRevision: manifest.packageRevision,
      packageVersion: 1,
      readingCertificateRevision: manifest.reading.certificateRevision,
      riaRevision: manifest.ria.revision,
    }),
  };
}

function parseV2(raw: Record<string, unknown>): CatalogPackageLoad {
  if (typeof raw.packageRef !== 'string' || typeof raw.packageRevision !== 'string'
    || typeof raw.materialId !== 'string' || !validMaterialId(raw.materialId)
    || typeof raw.title !== 'string' || raw.title.trim().length === 0
    || !['textbook', 'book'].includes(String(raw.materialKind))
    || typeof raw.language !== 'string' || raw.language.length === 0
    || typeof raw.builtAt !== 'string') {
    return failure('malformed', 'package_identity_malformed', '', 'Catalog package identity or display metadata is incomplete.');
  }
  if (!PACKAGE_REF_PATTERN.test(raw.packageRef) || !SHA256_PATTERN.test(raw.packageRevision)
    || raw.packageRef !== `catalog://${raw.materialId}@${raw.packageRevision}`) {
    return failure('unsafe', 'package_identity_mutable', 'packageRef', 'Catalog package identity is not a matching immutable reference.');
  }
  const authors = optionalStrings(raw.authors);
  const topics = optionalStrings(raw.topics);
  const source = parseFile(raw.source);
  const metadata = parseFile(raw.metadata);
  const rights = parseFile(raw.rights);
  const cover = raw.cover === undefined ? undefined : parseFile(raw.cover);
  if (authors === undefined || authors.length === 0 || topics === undefined
    || source === undefined || metadata === undefined || rights === undefined
    || (raw.cover !== undefined && cover === undefined)) {
    return failure('malformed', 'package_files_malformed', 'files', 'Catalog package file descriptors or display arrays are invalid.');
  }
  if (metadata.path !== 'source/CATALOG-METADATA.json' || rights.path !== 'source/RIGHTS.json'
    || !source.path.startsWith('source/original/')) {
    return failure('unsafe', 'package_file_role_invalid', 'source', 'Catalog package source, metadata, or rights path is invalid.');
  }
  if (!isRecord(raw.reading) || raw.reading.coveragePercent !== 100
    || !Array.isArray(raw.reading.blockedRanges) || raw.reading.blockedRanges.length !== 0
    || typeof raw.reading.certificateRevision !== 'string' || raw.reading.certificateRevision.length === 0) {
    return failure('unsafe', 'package_reading_uncertified', 'reading', 'Catalog package reading is not certified complete.');
  }
  if (!isRecord(raw.ria) || raw.ria.status !== 'complete'
    || typeof raw.ria.revision !== 'string' || raw.ria.revision.length === 0) {
    return failure('unsafe', 'package_ria_uncertified', 'ria', 'Catalog package RIA is not certified complete.');
  }
  const readingRevision = raw.reading.certificateRevision;
  const riaRevision = raw.ria.revision;
  const approvals = parseApprovals(raw.approvals);
  if (approvals === undefined
    || !approvals.some((item) => item.approvedRevision === readingRevision)
    || !approvals.some((item) => item.approvedRevision === riaRevision)) {
    return failure('unsafe', 'package_approval_missing', 'approvals', 'Catalog package approvals do not cover reading and RIA revisions.');
  }
  if (!Array.isArray(raw.files)) return failure('malformed', 'package_inventory_missing', 'files', 'Catalog package inventory is missing.');
  const files = raw.files.map(parseFile);
  if (files.some((file) => file === undefined)) {
    return failure('malformed', 'package_inventory_malformed', 'files', 'Catalog package inventory contains an invalid entry.');
  }
  const inventory = files as CatalogPackageFile[];
  const paths = new Set(inventory.map((file) => file.path));
  if (paths.size !== inventory.length
    || paths.has('source/STUDY-PACKAGE.json')
    || !REQUIRED_ARTIFACTS.every((path) => paths.has(path))
    || ![source, metadata, rights, ...(cover === undefined ? [] : [cover])]
      .every((descriptor) => inventory.some((file) => file.path === descriptor.path
        && file.size === descriptor.size && file.sha256 === descriptor.sha256))) {
    return failure('unsafe', 'package_inventory_incomplete', 'files', 'Catalog package inventory is incomplete or inconsistent.');
  }
  const manifest: CatalogPackageManifestV2 = {
    schemaVersion: 2,
    contractRevision: STUDY_PACKAGE_CONTRACT_REVISION,
    packageRef: raw.packageRef,
    packageRevision: raw.packageRevision,
    materialId: raw.materialId,
    materialKind: raw.materialKind as 'textbook' | 'book',
    title: raw.title,
    subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : undefined,
    authors,
    language: raw.language,
    publisher: typeof raw.publisher === 'string' ? raw.publisher : undefined,
    edition: typeof raw.edition === 'string' ? raw.edition : undefined,
    publicationYear: typeof raw.publicationYear === 'number' ? raw.publicationYear : undefined,
    isbn: typeof raw.isbn === 'string' ? raw.isbn : undefined,
    topics,
    source,
    cover,
    metadata,
    rights,
    reading: { coveragePercent: 100, blockedRanges: [], certificateRevision: readingRevision },
    ria: { status: 'complete', revision: riaRevision },
    approvals,
    files: inventory,
    builtAt: raw.builtAt,
  };
  return {
    status: 'ready',
    manifest,
    material: certify({
      materialId: manifest.materialId,
      materialKind: manifest.materialKind,
      title: manifest.title,
      subtitle: manifest.subtitle,
      authors: manifest.authors,
      language: manifest.language,
      publisher: manifest.publisher,
      edition: manifest.edition,
      publicationYear: manifest.publicationYear,
      isbn: manifest.isbn,
      topics: manifest.topics,
      cover: manifest.cover === undefined ? undefined : {
        path: manifest.cover.path,
        mediaType: manifest.cover.mediaType ?? 'application/octet-stream',
        sha256: manifest.cover.sha256,
      },
      sourceRevision: `sha256:${manifest.source.sha256}`,
      packageRef: manifest.packageRef,
      packageRevision: manifest.packageRevision,
      packageVersion: 2,
      readingCertificateRevision: manifest.reading.certificateRevision,
      riaRevision: manifest.ria.revision,
    }),
  };
}

/** Trust gate for the server's derived index. Components never construct the brand. */
export function parseCatalogIndex(value: unknown): CatalogIndexLoad {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.entries)) {
    return indexFailure('malformed', 'catalog_index_malformed', '', 'Catalog index is malformed.');
  }
  const materials: CertifiedCatalogMaterial[] = [];
  for (const [index, entry] of value.entries.entries()) {
    if (!isRecord(entry)) return indexFailure('malformed', 'catalog_index_entry_malformed', `entries.${index}`, 'Catalog index entry is malformed.');
    const packageVersion = entry.packageVersion;
    if (packageVersion !== 1 && packageVersion !== 2) {
      return indexFailure('unsupported', 'catalog_index_entry_unsupported', `entries.${index}.packageVersion`, 'Catalog index entry uses an unsupported package version.');
    }
    const authors = optionalStrings(entry.authors);
    const topics = optionalStrings(entry.topics);
    if (typeof entry.materialId !== 'string' || !validMaterialId(entry.materialId)
      || !['textbook', 'book'].includes(String(entry.materialKind))
      || typeof entry.title !== 'string' || entry.title.length === 0
      || authors === undefined || topics === undefined
      || typeof entry.language !== 'string'
      || typeof entry.sourceRevision !== 'string' || !SHA256_PATTERN.test(entry.sourceRevision)
      || typeof entry.packageRef !== 'string' || !PACKAGE_REF_PATTERN.test(entry.packageRef)
      || typeof entry.packageRevision !== 'string' || !SHA256_PATTERN.test(entry.packageRevision)
      || entry.packageRef !== `catalog://${entry.materialId}@${entry.packageRevision}`
      || typeof entry.readingCertificateRevision !== 'string'
      || typeof entry.riaRevision !== 'string') {
      return indexFailure('unsafe', 'catalog_index_entry_unsafe', `entries.${index}`, 'Catalog index entry has an invalid identity.');
    }
    const cover = entry.cover === undefined ? undefined : parseFile(entry.cover);
    if (entry.cover !== undefined && cover === undefined) {
      return indexFailure('unsafe', 'catalog_index_cover_unsafe', `entries.${index}.cover`, 'Catalog index cover is invalid.');
    }
    const education = isRecord(entry.education) ? {
      country: typeof entry.education.country === 'string' ? entry.education.country : undefined,
      educationStage: typeof entry.education.educationStage === 'string' ? entry.education.educationStage : undefined,
      grade: typeof entry.education.grade === 'string' ? entry.education.grade : undefined,
      subject: typeof entry.education.subject === 'string' ? entry.education.subject : undefined,
      semester: typeof entry.education.semester === 'string' ? entry.education.semester : undefined,
      curriculumStandard: typeof entry.education.curriculumStandard === 'string' ? entry.education.curriculumStandard : undefined,
      editionLabel: typeof entry.education.editionLabel === 'string' ? entry.education.editionLabel : undefined,
    } : undefined;
    materials.push(certify({
      materialId: entry.materialId,
      materialKind: entry.materialKind as 'textbook' | 'book',
      title: entry.title,
      subtitle: typeof entry.subtitle === 'string' ? entry.subtitle : undefined,
      authors,
      language: entry.language,
      publisher: typeof entry.publisher === 'string' ? entry.publisher : undefined,
      edition: typeof entry.edition === 'string' ? entry.edition : undefined,
      publicationYear: typeof entry.publicationYear === 'number' ? entry.publicationYear : undefined,
      isbn: typeof entry.isbn === 'string' ? entry.isbn : undefined,
      topics,
      description: typeof entry.description === 'string' ? entry.description : undefined,
      education,
      cover: cover === undefined ? undefined : {
        path: cover.path,
        mediaType: cover.mediaType ?? 'application/octet-stream',
        sha256: cover.sha256,
      },
      sourceRevision: entry.sourceRevision,
      packageRef: entry.packageRef,
      packageRevision: entry.packageRevision,
      packageVersion,
      readingCertificateRevision: entry.readingCertificateRevision,
      riaRevision: entry.riaRevision,
    }));
  }
  return { status: 'ready', materials };
}

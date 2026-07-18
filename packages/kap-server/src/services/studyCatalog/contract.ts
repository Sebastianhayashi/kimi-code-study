import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

import { z } from 'zod';

export const STUDY_PACKAGE_MANIFEST = 'source/STUDY-PACKAGE.json';
export const CATALOG_INDEX_FILE = 'CATALOG-INDEX.json';
export const MAX_MANIFEST_BYTES = 512 * 1024;

const rawSha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const revisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const materialIdSchema = z.string().min(3).max(101).regex(/^[a-z0-9][a-z0-9._/-]*[a-z0-9]$/)
  .refine((value) => !value.includes('..') && !value.includes('//') && !value.includes('@'));
const packageRefSchema = z.string().regex(/^catalog:\/\/[a-z0-9][a-z0-9._/-]*[a-z0-9]@sha256:[a-f0-9]{64}$/);
const nonEmptyString = z.string().trim().min(1);

export const packageFileSchema = z.object({
  path: nonEmptyString,
  size: z.number().int().nonnegative().safe(),
  sha256: rawSha256Schema,
  role: nonEmptyString,
  mediaType: nonEmptyString.optional(),
}).strict();

const approvalSchema = z.object({
  actor: z.enum(['user', 'auto_policy', 'system']),
  policyRevision: nonEmptyString,
  approvedRevision: nonEmptyString,
  approvedAt: nonEmptyString,
  reason: nonEmptyString.optional(),
}).strict();

export const packageManifestV2Schema = z.object({
  schemaVersion: z.literal(2),
  contractRevision: z.literal('kimi-study-package-v2'),
  packageRef: packageRefSchema,
  packageRevision: revisionSchema,
  materialId: materialIdSchema,
  materialKind: z.enum(['textbook', 'book']),
  title: nonEmptyString,
  subtitle: nonEmptyString.optional(),
  authors: z.array(nonEmptyString).min(1),
  language: nonEmptyString,
  publisher: nonEmptyString.optional(),
  edition: nonEmptyString.optional(),
  publicationYear: z.number().int().min(1000).max(9999).optional(),
  isbn: nonEmptyString.optional(),
  topics: z.array(nonEmptyString),
  source: packageFileSchema,
  cover: packageFileSchema.optional(),
  metadata: packageFileSchema,
  rights: packageFileSchema,
  reading: z.object({
    coveragePercent: z.literal(100),
    blockedRanges: z.tuple([]),
    certificateRevision: nonEmptyString,
  }).strict(),
  ria: z.object({ status: z.literal('complete'), revision: nonEmptyString }).strict(),
  approvals: z.array(approvalSchema).min(2),
  files: z.array(packageFileSchema).min(7).max(2_048),
  builtAt: nonEmptyString,
  signature: z.unknown().optional(),
  signatures: z.unknown().optional(),
}).strict();

export type PackageManifestV2 = z.infer<typeof packageManifestV2Schema>;
export type PackageFile = z.infer<typeof packageFileSchema>;

export const catalogMetadataSchema = z.object({
  materialId: materialIdSchema,
  materialKind: z.enum(['textbook', 'book']),
  title: nonEmptyString,
  subtitle: nonEmptyString.optional(),
  authors: z.array(nonEmptyString).min(1),
  language: nonEmptyString,
  publisher: nonEmptyString.optional(),
  edition: nonEmptyString.optional(),
  publicationYear: z.number().int().min(1000).max(9999).optional(),
  isbn: nonEmptyString.optional(),
  topics: z.array(nonEmptyString),
  description: nonEmptyString,
  cover: z.object({ path: nonEmptyString, mediaType: z.string().regex(/^image\//) }).strict().optional(),
  searchAliases: z.array(nonEmptyString),
  country: nonEmptyString.optional(),
  educationStage: nonEmptyString.optional(),
  grade: nonEmptyString.optional(),
  subject: nonEmptyString.optional(),
  semester: nonEmptyString.optional(),
  curriculumStandard: nonEmptyString.optional(),
  editionLabel: nonEmptyString.optional(),
}).strict();

export type CatalogMetadata = z.infer<typeof catalogMetadataSchema>;

export const rightsSchema = z.object({
  source: nonEmptyString,
  rightsHolder: nonEmptyString,
  licenseType: nonEmptyString,
  allowedTerritories: z.array(nonEmptyString).min(1),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sourceBytesMayBeStored: z.boolean(),
  sourceTextMayBeDisplayed: z.boolean(),
  derivativeCoursesAllowed: z.boolean(),
  coverMayBeDisplayed: z.boolean(),
  attributionRequired: z.boolean(),
  attributionText: nonEmptyString.optional(),
}).strict();

export type CatalogRights = z.infer<typeof rightsSchema>;

const educationSchema = z.object({
  country: nonEmptyString.optional(),
  educationStage: nonEmptyString.optional(),
  grade: nonEmptyString.optional(),
  subject: nonEmptyString.optional(),
  semester: nonEmptyString.optional(),
  curriculumStandard: nonEmptyString.optional(),
  editionLabel: nonEmptyString.optional(),
}).strict().optional();

export const catalogIndexEntrySchema = z.object({
  packageVersion: z.union([z.literal(1), z.literal(2)]),
  packageRef: packageRefSchema,
  packageRevision: revisionSchema,
  materialId: materialIdSchema,
  materialKind: z.enum(['textbook', 'book']),
  title: nonEmptyString,
  subtitle: nonEmptyString.optional(),
  authors: z.array(nonEmptyString),
  language: nonEmptyString,
  publisher: nonEmptyString.optional(),
  edition: nonEmptyString.optional(),
  publicationYear: z.number().int().min(1000).max(9999).optional(),
  isbn: nonEmptyString.optional(),
  topics: z.array(nonEmptyString),
  description: nonEmptyString.optional(),
  education: educationSchema,
  cover: packageFileSchema.optional(),
  sourceRevision: revisionSchema,
  readingCertificateRevision: nonEmptyString,
  riaRevision: nonEmptyString,
  installDirectory: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,160}$/),
  installedAt: nonEmptyString,
}).strict();

export type CatalogIndexEntry = z.infer<typeof catalogIndexEntrySchema>;

export const catalogIndexSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: nonEmptyString,
  entries: z.array(catalogIndexEntrySchema),
}).strict();

export type CatalogIndex = z.infer<typeof catalogIndexSchema>;

export class StudyCatalogError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'StudyCatalogError';
  }
}

function fail(code: string, message: string, details?: Record<string, unknown>): never {
  throw new StudyCatalogError(code, message, details);
}

export function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function canonicalManifestJson(value: Record<string, unknown>): string {
  const excluded = new Set(['packageRevision', 'packageRef', 'builtAt', 'signature', 'signatures']);
  const compareUtf8 = (left: string, right: string): number => Buffer.compare(Buffer.from(left), Buffer.from(right));
  const normalize = (candidate: unknown, topLevel: boolean): unknown => {
    if (candidate === null || typeof candidate === 'string' || typeof candidate === 'boolean') return candidate;
    if (typeof candidate === 'number') {
      if (!Number.isSafeInteger(candidate)) fail('manifest_invalid', 'Package identity permits only safe integers.');
      return candidate;
    }
    if (Array.isArray(candidate)) return candidate.map((item) => normalize(item, false));
    if (typeof candidate !== 'object' || candidate === null) {
      fail('manifest_invalid', 'Package identity contains a non-JSON value.');
    }
    const record = candidate as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(record).filter((key) => !(topLevel && excluded.has(key))).sort(compareUtf8)) {
      if (!/^[\x20-\x7e]+$/.test(key)) fail('manifest_invalid', 'Manifest property names must be ASCII.');
      normalized[key] = normalize(record[key], false);
    }
    return normalized;
  };
  return JSON.stringify(normalize(value, true));
}

function safeJsonParse(data: Buffer, label: string): unknown {
  if (data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
    fail('manifest_invalid', `${label} cannot contain a byte-order mark.`);
  }
  try {
    return JSON.parse(data.toString('utf8')) as unknown;
  } catch {
    fail('manifest_invalid', `${label} is not valid UTF-8 JSON.`);
  }
}

export function validatePackagePath(value: string): boolean {
  if ((value !== 'source' && !value.startsWith('source/')) || value !== value.normalize('NFC') || value.includes('\\') || value.includes('\0')) return false;
  if (value.startsWith('/') || /^[a-zA-Z]:/.test(value) || value.startsWith('//')) return false;
  const parts = value.split('/');
  return parts.every((part) => part.length > 0 && part !== '.' && part !== '..' && Buffer.byteLength(part) <= 240);
}

export function isForbiddenPackagePath(value: string): boolean {
  const folded = value.normalize('NFC').toLocaleLowerCase('en-US');
  if (['mission.md', 'source/mission.md', 'source/curriculum-blueprint.md', 'source/teaching-map.md'].includes(folded)) return true;
  return folded.split('/').some((part) => ['lesson-briefs', 'lessons', 'learning-records', 'tutor-history', 'user-progress'].includes(part));
}

async function collectFiles(root: string): Promise<Map<string, { path: string; size: number; sha256: string }>> {
  const result = new Map<string, { path: string; size: number; sha256: string }>();
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      const info = await lstat(absolute);
      if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) {
        fail('archive_entry_type_forbidden', 'Installed package contains a link or special file.');
      }
      if (info.isDirectory()) {
        await walk(absolute);
        continue;
      }
      const rel = relative(root, absolute).split(sep).join('/');
      if (!validatePackagePath(rel) || isForbiddenPackagePath(rel)) {
        fail('archive_path_invalid', 'Installed package contains an invalid source path.');
      }
      const bytes = await readFile(absolute);
      result.set(rel, { path: rel, size: bytes.length, sha256: sha256(bytes) });
    }
  };
  await walk(root);
  return result;
}

function matchingDescriptor(left: PackageFile, right: PackageFile): boolean {
  return left.path === right.path && left.size === right.size && left.sha256 === right.sha256;
}

function ensureManifestSemantics(manifest: PackageManifestV2): void {
  if (manifest.packageRef !== `catalog://${manifest.materialId}@${manifest.packageRevision}`) {
    fail('package_identity_mismatch', 'Package reference does not match its material and revision.');
  }
  const calculated = `sha256:${sha256(canonicalManifestJson(manifest as unknown as Record<string, unknown>))}`;
  if (manifest.packageRevision !== calculated) {
    fail('package_identity_mismatch', 'Package content identity does not match the manifest.');
  }
  if (!validatePackagePath(manifest.source.path) || !manifest.source.path.startsWith('source/original/')) {
    fail('manifest_invalid', 'Original source must be under source/original/.');
  }
  if (manifest.metadata.path !== 'source/CATALOG-METADATA.json' || manifest.rights.path !== 'source/RIGHTS.json') {
    fail('manifest_invalid', 'Metadata and rights paths are fixed by the v2 contract.');
  }
  if (!manifest.approvals.some((item) => item.approvedRevision === manifest.reading.certificateRevision)
    || !manifest.approvals.some((item) => item.approvedRevision === manifest.ria.revision)) {
    fail('manifest_invalid', 'Reading and RIA approvals must cover the exact revisions.');
  }
  const paths = new Set<string>();
  for (const file of manifest.files) {
    if (!validatePackagePath(file.path) || isForbiddenPackagePath(file.path) || file.path === STUDY_PACKAGE_MANIFEST) {
      fail('inventory_mismatch', 'Package inventory contains a forbidden path.');
    }
    const collision = file.path.normalize('NFC').toLocaleLowerCase('en-US');
    if (paths.has(collision)) fail('inventory_mismatch', 'Package inventory contains duplicate or colliding paths.');
    paths.add(collision);
  }
  for (const required of [
    'source/BOOK-READING-STATE.md',
    'source/BOOK-OVERVIEW.md',
    'source/RIA-DISTILLATION.md',
    'source/ria/INDEX.md',
  ]) {
    if (!manifest.files.some((item) => item.path === required)) {
      fail('inventory_mismatch', 'Package inventory is missing a required reading or RIA artifact.');
    }
  }
  for (const descriptor of [manifest.source, manifest.metadata, manifest.rights, ...(manifest.cover ? [manifest.cover] : [])]) {
    if (!manifest.files.some((item) => matchingDescriptor(item, descriptor))) {
      fail('inventory_mismatch', 'A package descriptor does not match its inventory entry.');
    }
  }
}

function ensureMetadataMatches(manifest: PackageManifestV2, metadata: CatalogMetadata): void {
  for (const field of ['materialId', 'materialKind', 'title', 'subtitle', 'authors', 'language', 'publisher', 'edition', 'publicationYear', 'isbn', 'topics'] as const) {
    if (JSON.stringify(manifest[field]) !== JSON.stringify(metadata[field])) {
      fail('manifest_invalid', `Catalog metadata field ${field} does not match the package manifest.`);
    }
  }
  if (manifest.cover === undefined && metadata.cover !== undefined) {
    fail('inventory_mismatch', 'Catalog metadata declares a cover that is missing from the manifest.');
  }
  if (manifest.cover !== undefined && metadata.cover?.path !== manifest.cover.path) {
    fail('inventory_mismatch', 'Catalog cover path does not match the manifest.');
  }
}

function ensureRightsReady(rights: CatalogRights): void {
  if (!rights.sourceBytesMayBeStored || !rights.derivativeCoursesAllowed) {
    fail('rights_denied', 'This package does not permit local storage and personal course creation.');
  }
  if (rights.attributionRequired && !rights.attributionText) {
    fail('rights_denied', 'Required attribution text is missing.');
  }
  if (rights.validUntil !== undefined && rights.validUntil < new Date().toISOString().slice(0, 10)) {
    fail('rights_denied', 'This package rights declaration has expired.');
  }
}

export interface VerifiedPackageV2 {
  readonly manifest: PackageManifestV2;
  readonly metadata: CatalogMetadata;
  readonly rights: CatalogRights;
}

export async function verifyPackageV2(root: string): Promise<VerifiedPackageV2> {
  const manifestPath = resolve(root, STUDY_PACKAGE_MANIFEST);
  const rootPath = resolve(root);
  if (!manifestPath.startsWith(rootPath + sep)) fail('archive_path_invalid', 'Package manifest escapes its root.');
  const manifestBytes = await readFile(manifestPath).catch(() => fail('manifest_invalid', 'Package manifest is missing.'));
  if (manifestBytes.length > MAX_MANIFEST_BYTES) fail('manifest_invalid', 'Package manifest exceeds 512 KiB.');
  const parsed = packageManifestV2Schema.safeParse(safeJsonParse(manifestBytes, 'Package manifest'));
  if (!parsed.success) fail('manifest_invalid', 'Package manifest does not satisfy the v2 schema.', { issues: parsed.error.issues });
  const manifest = parsed.data;
  ensureManifestSemantics(manifest);

  const actual = await collectFiles(root);
  actual.delete(STUDY_PACKAGE_MANIFEST);
  if (actual.size !== manifest.files.length) fail('inventory_mismatch', 'Package has undeclared or missing files.');
  for (const declared of manifest.files) {
    const found = actual.get(declared.path);
    if (found === undefined) fail('inventory_mismatch', 'A declared package file is missing.');
    if (found.size !== declared.size) fail('inventory_mismatch', 'A package file size does not match its declaration.');
    if (found.sha256 !== declared.sha256) fail('checksum_mismatch', 'A package file checksum does not match its declaration.');
  }

  const metadataResult = catalogMetadataSchema.safeParse(safeJsonParse(await readFile(join(root, manifest.metadata.path)), 'Catalog metadata'));
  if (!metadataResult.success) fail('manifest_invalid', 'Catalog metadata is invalid.', { issues: metadataResult.error.issues });
  ensureMetadataMatches(manifest, metadataResult.data);
  const rightsResult = rightsSchema.safeParse(safeJsonParse(await readFile(join(root, manifest.rights.path)), 'Rights declaration'));
  if (!rightsResult.success) fail('rights_missing', 'Package rights declaration is invalid.', { issues: rightsResult.error.issues });
  ensureRightsReady(rightsResult.data);
  return { manifest, metadata: metadataResult.data, rights: rightsResult.data };
}

export function indexEntryFromPackage(
  verified: VerifiedPackageV2,
  installDirectory: string,
  installedAt: string,
): CatalogIndexEntry {
  const { manifest, metadata, rights } = verified;
  return {
    packageVersion: 2,
    packageRef: manifest.packageRef,
    packageRevision: manifest.packageRevision,
    materialId: manifest.materialId,
    materialKind: manifest.materialKind,
    title: manifest.title,
    subtitle: manifest.subtitle,
    authors: [...manifest.authors],
    language: manifest.language,
    publisher: manifest.publisher,
    edition: manifest.edition,
    publicationYear: manifest.publicationYear,
    isbn: manifest.isbn,
    topics: [...manifest.topics],
    description: metadata.description,
    education: {
      country: metadata.country,
      educationStage: metadata.educationStage,
      grade: metadata.grade,
      subject: metadata.subject,
      semester: metadata.semester,
      curriculumStandard: metadata.curriculumStandard,
      editionLabel: metadata.editionLabel,
    },
    cover: rights.coverMayBeDisplayed ? manifest.cover : undefined,
    sourceRevision: `sha256:${manifest.source.sha256}`,
    readingCertificateRevision: manifest.reading.certificateRevision,
    riaRevision: manifest.ria.revision,
    installDirectory,
    installedAt,
  };
}

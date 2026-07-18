import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { type Entry, type Options as YauzlOptions, fromBuffer as yauzlFromBuffer } from 'yauzl';

import {
  MAX_MANIFEST_BYTES,
  STUDY_PACKAGE_MANIFEST,
  StudyCatalogError,
  isForbiddenPackagePath,
  validatePackagePath,
} from './contract';

export const ARCHIVE_LIMITS = Object.freeze({
  compressedBytes: 50 * 1024 * 1024,
  entries: 2_048,
  oneFileBytes: 128 * 1024 * 1024,
  totalBytes: 512 * 1024 * 1024,
  compressionRatio: 100,
  ratioFloorBytes: 1024 * 1024,
});

export interface StudyArchiveEntrySummary {
  readonly fileName: string;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly compressionMethod: number;
  readonly generalPurposeBitFlag: number;
  readonly externalFileAttributes: number;
  readonly directory: boolean;
}

function fail(code: string, message: string, details?: Record<string, unknown>): never {
  throw new StudyCatalogError(code, message, details);
}

function summarize(entry: Entry): StudyArchiveEntrySummary {
  return {
    fileName: entry.fileName,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
    compressionMethod: entry.compressionMethod,
    generalPurposeBitFlag: entry.generalPurposeBitFlag,
    externalFileAttributes: entry.externalFileAttributes,
    directory: entry.fileName.endsWith('/'),
  };
}

function openOptions(): YauzlOptions {
  return {
    lazyEntries: true,
    decodeStrings: true,
    strictFileNames: true,
    validateEntrySizes: true,
  };
}

async function collectEntries(buffer: Buffer): Promise<StudyArchiveEntrySummary[]> {
  return new Promise<StudyArchiveEntrySummary[]>((resolve, reject) => {
    yauzlFromBuffer(buffer, openOptions(), (openError, zipfile) => {
      if (openError !== null || zipfile === undefined) {
        reject(new StudyCatalogError('archive_invalid', 'The selected file is not a readable ZIP archive.'));
        return;
      }
      const entries: StudyArchiveEntrySummary[] = [];
      let settled = false;
      const abort = (error: unknown): void => {
        if (settled) return;
        settled = true;
        zipfile.close();
        reject(error instanceof StudyCatalogError ? error : new StudyCatalogError('archive_invalid', 'The ZIP directory is invalid.'));
      };
      zipfile.on('entry', (entry: Entry) => {
        entries.push(summarize(entry));
        if (entries.length > ARCHIVE_LIMITS.entries) {
          abort(new StudyCatalogError('archive_limit_exceeded', 'The package contains too many files.'));
          return;
        }
        zipfile.readEntry();
      });
      zipfile.on('error', abort);
      zipfile.on('end', () => {
        if (settled) return;
        settled = true;
        resolve(entries);
      });
      zipfile.readEntry();
    });
  });
}

function validateMode(entry: StudyArchiveEntrySummary): void {
  const unixMode = entry.externalFileAttributes >>> 16;
  const kind = unixMode & 0o170000;
  if (kind === 0) return;
  if (entry.directory && kind === 0o040000) return;
  if (!entry.directory && kind === 0o100000) return;
  fail('archive_entry_type_forbidden', 'The package contains a link or special filesystem entry.');
}

function collisionKey(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('en-US').replace(/\/$/, '');
}

export function validateStudyArchiveEntries(entries: readonly StudyArchiveEntrySummary[]): void {
  if (entries.length === 0) fail('archive_invalid', 'The package archive is empty.');
  const exact = new Set<string>();
  const folded = new Set<string>();
  const files = new Set<string>();
  const directories = new Set<string>();
  let total = 0;
  let manifests = 0;
  for (const entry of entries) {
    const path = entry.fileName.replace(/\/$/, '');
    const normalized = path.normalize('NFC');
    if (normalized !== path) fail('archive_path_collision', 'Package paths must use normalized Unicode.');
    if (entry.fileName.includes('\\') || !validatePackagePath(path)) {
      fail('archive_path_invalid', 'The package contains an unsafe path.');
    }
    if (isForbiddenPackagePath(path)) {
      fail('archive_path_invalid', 'Prepared packages cannot contain a course or learner artifact.');
    }
    if (exact.has(path) || folded.has(collisionKey(path))) {
      fail('archive_path_collision', 'The package contains duplicate or colliding paths.');
    }
    exact.add(path);
    folded.add(collisionKey(path));
    validateMode(entry);
    if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
      fail('archive_invalid', 'Encrypted package entries are not supported.');
    }
    if (![0, 8].includes(entry.compressionMethod)) {
      fail('archive_invalid', 'The package uses an unsupported compression method.');
    }
    if (entry.directory) {
      if (entry.uncompressedSize !== 0) fail('archive_invalid', 'A directory entry carries file data.');
      directories.add(path);
      continue;
    }
    files.add(path);
    if (path === STUDY_PACKAGE_MANIFEST) {
      manifests += 1;
      if (entry.uncompressedSize > MAX_MANIFEST_BYTES) {
        fail('manifest_invalid', 'Package manifest exceeds 512 KiB.');
      }
    }
    if (entry.uncompressedSize > ARCHIVE_LIMITS.oneFileBytes) {
      fail('archive_limit_exceeded', 'A package file exceeds the uncompressed size limit.');
    }
    total += entry.uncompressedSize;
    if (total > ARCHIVE_LIMITS.totalBytes) {
      fail('archive_limit_exceeded', 'The package exceeds the total uncompressed size limit.');
    }
    if (entry.uncompressedSize >= ARCHIVE_LIMITS.ratioFloorBytes) {
      const ratio = entry.compressedSize === 0 ? Number.POSITIVE_INFINITY : entry.uncompressedSize / entry.compressedSize;
      if (ratio > ARCHIVE_LIMITS.compressionRatio) {
        fail('archive_limit_exceeded', 'The package has an unsafe compression ratio.');
      }
    }
  }
  if (manifests !== 1) fail('manifest_invalid', 'The package must contain exactly one root manifest.');
  for (const file of files) {
    const segments = file.split('/');
    for (let index = 1; index < segments.length; index += 1) {
      const prefix = segments.slice(0, index).join('/');
      if (files.has(prefix)) fail('archive_path_collision', 'A package path is both a file and a directory.');
    }
  }
  for (const directory of directories) {
    if (files.has(directory)) fail('archive_path_collision', 'A package path is both a file and a directory.');
  }
}

async function extractEntries(buffer: Buffer, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true, mode: 0o700 });
  return new Promise<void>((resolve, reject) => {
    yauzlFromBuffer(buffer, openOptions(), (openError, zipfile) => {
      if (openError !== null || zipfile === undefined) {
        reject(new StudyCatalogError('archive_invalid', 'The selected file is not a readable ZIP archive.'));
        return;
      }
      let settled = false;
      let totalActual = 0;
      const abort = (error: unknown): void => {
        if (settled) return;
        settled = true;
        zipfile.close();
        reject(error instanceof StudyCatalogError ? error : new StudyCatalogError('archive_invalid', 'Package extraction failed.'));
      };
      zipfile.on('entry', (entry: Entry) => {
        const path = entry.fileName.replace(/\/$/, '');
        const target = join(destination, ...path.split('/'));
        if (entry.fileName.endsWith('/')) {
          mkdir(target, { recursive: true, mode: 0o700 }).then(() => zipfile.readEntry()).catch(abort);
          return;
        }
        zipfile.openReadStream(entry, (streamError, stream) => {
          if (streamError !== null || stream === undefined) {
            abort(new StudyCatalogError('archive_invalid', 'A package file could not be decompressed.'));
            return;
          }
          let actual = 0;
          const counter = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
              actual += chunk.length;
              totalActual += chunk.length;
              if (actual > ARCHIVE_LIMITS.oneFileBytes || totalActual > ARCHIVE_LIMITS.totalBytes) {
                callback(new StudyCatalogError('archive_limit_exceeded', 'Package extraction exceeded a byte limit.'));
                return;
              }
              callback(null, chunk);
            },
          });
          mkdir(dirname(target), { recursive: true, mode: 0o700 })
            .then(() => pipeline(stream, counter, createWriteStream(target, { flags: 'wx', mode: 0o600 })))
            .then(() => {
              if (actual !== entry.uncompressedSize) {
                abort(new StudyCatalogError('archive_invalid', 'A package entry size changed during extraction.'));
                return;
              }
              zipfile.readEntry();
            })
            .catch(abort);
        });
      });
      zipfile.on('error', abort);
      zipfile.on('end', () => {
        if (settled) return;
        settled = true;
        resolve();
      });
      zipfile.readEntry();
    });
  });
}

export async function securelyExtractStudyPackage(buffer: Buffer, destination: string): Promise<void> {
  if (buffer.length > ARCHIVE_LIMITS.compressedBytes) {
    fail('archive_limit_exceeded', 'The selected package exceeds 50 MiB.');
  }
  const entries = await collectEntries(buffer);
  validateStudyArchiveEntries(entries);
  await extractEntries(buffer, destination);
}

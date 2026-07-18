/** Stable, cross-language identity for one published lesson artifact. */

const LESSON_PATH = /^lessons\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.html$/;

export function isLessonArtifactPath(path: string): boolean {
  return LESSON_PATH.test(path);
}

/**
 * FNV-1a over UTF-8 bytes. The bundled Skills implement the same small hash,
 * so a stale agent turn can be rejected immediately before atomic replace.
 * This is an identity token, not a cryptographic integrity claim.
 */
export function lessonArtifactRevision(source: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(source)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  const unsignedHash = hash < 0 ? hash + 0x1_0000_0000 : hash;
  return `fnv1a32:${unsignedHash.toString(16).padStart(8, '0')}`;
}

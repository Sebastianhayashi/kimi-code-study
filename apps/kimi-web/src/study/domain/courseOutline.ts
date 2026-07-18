/**
 * Conservative parsers for course outline artifacts.
 *
 * The UI never invents outline structure: when the artifact is absent or
 * deviates from the documented format, the parser returns `undefined` and the
 * outline screen falls back to the snapshot's plan counts only.
 */

export interface CourseOutlineItem {
  readonly sequence: number;
  readonly title: string;
  readonly kind: 'lesson' | 'reference' | 'quiz' | 'other';
  /** Workspace-relative lesson/reference document (e.g. lessons/0001-x.html). */
  readonly destination?: string;
}

export interface CourseOutline {
  readonly items: readonly CourseOutlineItem[];
}

export const LESSON_INDEX_PATH = 'lessons/index.json' as const;
export const LESSON_INDEX_CONTRACT_REVISION = 'kimi-study-lessons-v1' as const;

export type LessonIndexStatus = 'planned' | 'published' | 'failed';

export interface LessonIndexEntry {
  readonly order: number;
  readonly path: string;
  readonly title: string;
  readonly status: LessonIndexStatus;
}

export interface LessonIndex {
  readonly schemaVersion: 1;
  readonly contractRevision: typeof LESSON_INDEX_CONTRACT_REVISION;
  readonly lessons: readonly LessonIndexEntry[];
}

const QUICK_PLAN_PATH = 'source/QUICK-PLAN.md' as const;
export { QUICK_PLAN_PATH };

/**
 * Parse the `## Learning path` table from a teach-quick QUICK-PLAN.md.
 *
 * Expected columns: Sequence | Slice ID | Title | Type | Source anchors |
 * Observable outcome | Destination. Any deviation (missing section,
 * non-contiguous sequence numbers, template placeholders, short rows) makes
 * the whole parse fail rather than show a half-true outline.
 */
export function parseQuickPlanOutline(markdown: string): CourseOutline | undefined {
  const section = /##\s+Learning path\s*\r?\n([\s\S]*?)(?=\r?\n##\s|$)/.exec(markdown);
  if (section === null) return undefined;
  const body = section[1]!;

  const items: CourseOutlineItem[] = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (/^\|[\s\-|:]+\|$/.test(trimmed)) continue; // table separator row
    const cells = trimmed.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 7) continue;
    if (cells[0]!.toLowerCase() === 'sequence') continue; // header row

    const sequence = Number.parseInt(cells[0]!, 10);
    const title = cells[2]!;
    const type = cells[3]!;
    const destinationCell = cells[6]!;
    if (!Number.isInteger(sequence) || sequence !== items.length + 1) return undefined;
    if (title.length === 0 || title.includes('{')) return undefined;

    const kind: CourseOutlineItem['kind'] = type === 'lesson' || type === 'reference' || type === 'quiz'
      ? type
      : 'other';
    const destination = destinationCell.length > 0 && !destinationCell.includes('{')
      ? destinationCell
      : undefined;
    items.push({ sequence, title, kind, destination });
  }

  return items.length === 0 ? undefined : { items };
}

/** Extract a lesson document's display title, if one is declared. */
export function extractHtmlTitle(html: string): string | undefined {
  const match = /<title>([^<]{1,200})<\/title>/i.exec(html);
  const title = match?.[1]?.trim();
  return title === undefined || title.length === 0 ? undefined : title;
}

/**
 * Parse the generated lesson manifest without accepting partial or invented data.
 * Entries must be ordered, unique, workspace-relative HTML paths under lessons/.
 */

/**
 * Treat a lesson index as authoritative only when every published path exists
 * on disk and the published count matches the product snapshot. Otherwise the
 * UI must fall back to directory listing — a stale index is never the catalog.
 */
export function authoritativePublishedLessons(
  manifest: LessonIndex | undefined,
  publishedLessons: number,
  existingLessonPaths: ReadonlySet<string>,
): readonly LessonIndexEntry[] | undefined {
  if (manifest === undefined) return undefined;
  if (!Number.isInteger(publishedLessons) || publishedLessons < 0) return undefined;
  const published = manifest.lessons.filter((entry) => entry.status === 'published');
  if (published.length !== publishedLessons) return undefined;
  if (!published.every((entry) => existingLessonPaths.has(entry.path))) return undefined;
  return published;
}

export function parseLessonIndex(json: string): LessonIndex | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const candidate = raw as Record<string, unknown>;
  if (candidate['schemaVersion'] !== 1
    || candidate['contractRevision'] !== LESSON_INDEX_CONTRACT_REVISION
    || !Array.isArray(candidate['lessons'])) return undefined;

  const lessons: LessonIndexEntry[] = [];
  const paths = new Set<string>();
  for (const [index, value] of candidate['lessons'].entries()) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    const entry = value as Record<string, unknown>;
    const order = entry['order'];
    const path = entry['path'];
    const title = entry['title'];
    const status = entry['status'];
    if (typeof order !== 'number' || !Number.isInteger(order) || order !== index + 1) {
      return undefined;
    }
    if (typeof path !== 'string'
      || !/^lessons\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.html$/.test(path)
      || paths.has(path)) return undefined;
    if (typeof title !== 'string' || title.trim().length === 0 || title.length > 200
      || title.includes('{')) return undefined;
    if (status !== 'planned' && status !== 'published' && status !== 'failed') return undefined;
    paths.add(path);
    lessons.push({ order, path, title: title.trim(), status });
  }

  return {
    schemaVersion: 1,
    contractRevision: LESSON_INDEX_CONTRACT_REVISION,
    lessons,
  };
}

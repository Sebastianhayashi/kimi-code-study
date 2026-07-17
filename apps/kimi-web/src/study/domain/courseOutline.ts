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

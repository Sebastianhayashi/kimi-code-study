/**
 * REST helpers for the Kimi Study screens, layered on the shared daemon
 * client (`api/daemon/client.ts`). Adds the two study-specific operations the
 * client does not wrap (fs:mkdir, course bootstrap) plus course-listing
 * queries. No state lives here — all reactive state stays in the screens.
 */

import { DaemonKimiWebApi } from '../api/daemon/client';
import { buildRestUrl, readKimiApiConfig } from '../api/config';
import { getCredential } from '../api/daemon/serverAuth';
import { DaemonApiError, isDaemonApiError } from '../api/errors';
import type { AppSession } from '../api/types';
import {
  courseDirName,
  isStudyCourseCwd,
  parseReviewDue,
  sortLessonFiles,
  resolveStudyWorkspaceRoot,
} from './domain/teachFiles';

let api: DaemonKimiWebApi | null = null;

/** Shared REST client (same config + auth store as the main web client). */
export function getStudyApi(): DaemonKimiWebApi {
  if (api === null) api = new DaemonKimiWebApi(readKimiApiConfig());
  return api;
}

/** True when the error is the daemon's `fs.path_not_found` (40409). */
export function isPathNotFound(error: unknown): boolean {
  return isDaemonApiError(error) && error.code === 40409;
}

/** Read a UTF-8 workspace file; returns null when it does not exist yet.
 *  The server may answer text files as base64 (and even flag them
 *  is_binary) — decode base64 regardless, we only read text formats. */
export async function readWorkspaceText(
  sessionId: string,
  path: string,
): Promise<string | null> {
  try {
    const result = await getStudyApi().readFile(sessionId, { path });
    if (result.encoding === 'utf-8') return result.content;
    if (result.encoding === 'base64') {
      try {
        const bytes = Uint8Array.from(atob(result.content), (c) => c.charCodeAt(0));
        return new TextDecoder('utf-8').decode(bytes);
      } catch {
        return null;
      }
    }
    return null;
  } catch (error) {
    if (isPathNotFound(error)) return null;
    throw error;
  }
}

/** List `lessons/*.html` in a course workspace, sorted by numeric prefix. */
export async function listLessonFiles(sessionId: string): Promise<string[]> {
  try {
    const result = await getStudyApi().listDirectory(sessionId, { path: 'lessons' });
    return sortLessonFiles(
      result.items
        .filter((item) => item.kind === 'file' && item.name.endsWith('.html'))
        .map((item) => item.name),
    );
  } catch (error) {
    if (isPathNotFound(error)) return [];
    throw error;
  }
}

/** List `reference/*.html` (durable cheat sheets) in a course workspace. */
export async function listReferenceFiles(sessionId: string): Promise<string[]> {
  try {
    const result = await getStudyApi().listDirectory(sessionId, { path: 'reference' });
    return sortLessonFiles(
      result.items
        .filter((item) => item.kind === 'file' && item.name.endsWith('.html'))
        .map((item) => item.name),
    );
  } catch (error) {
    if (isPathNotFound(error)) return [];
    throw error;
  }
}

/**
 * Read the lesson brief matching a lesson file (`lessons/NNNN-x.html` →
 * `source/lesson-briefs/NNNN-x.md`). Returns null when no brief exists.
 */
export async function readLessonBriefText(
  sessionId: string,
  lessonFile: string,
): Promise<string | null> {
  const base = lessonFile.replace(/\.html$/i, '');
  return readWorkspaceText(sessionId, `source/lesson-briefs/${base}.md`);
}

export interface CourseSummary {
  readonly session: AppSession;
  readonly hasMission: boolean;
  readonly hasSourceDir: boolean;
  readonly hasMap: boolean;
  readonly lessonCount: number;
  /** True when NOTES.md contains a dated review item due today or earlier. */
  readonly reviewDue: boolean;
}

/**
 * Course sessions for the home screen: sessions whose cwd is a course
 * directory under the study root, enriched with a one-shot probe of the
 * workspace (MISSION.md / TEACHING-MAP.md presence, lesson count, review
 * due). Probes are best-effort — a failed probe still shows the card.
 */
export async function listStudyCourses(): Promise<CourseSummary[]> {
  const client = getStudyApi();
  const page = await client.listSessions({ pageSize: 100 });
  const candidates = page.items.filter((s) => !s.archived && isStudyCourseCwd(s.cwd));
  return Promise.all(
    candidates.map(async (session) => {
      let hasMission = false;
      let hasSourceDir = false;
      let hasMap = false;
      let lessonCount = 0;
      let reviewDue = false;
      try {
        const root = await client.listDirectory(session.id, { path: '.' });
        hasMission = root.items.some((i) => i.kind === 'file' && i.name === 'MISSION.md');
        hasSourceDir = root.items.some((i) => i.kind === 'directory' && i.name === 'source');
      } catch {
        // Probe failure (session cold, workspace gone) — show the card anyway.
      }
      if (hasSourceDir) {
        try {
          const source = await client.listDirectory(session.id, { path: 'source' });
          hasMap = source.items.some((i) => i.kind === 'file' && i.name === 'TEACHING-MAP.md');
        } catch {
          // Keep hasMap false on probe failure.
        }
        lessonCount = (await listLessonFiles(session.id)).length;
      }
      if (hasMission) {
        const notes = await readWorkspaceText(session.id, 'NOTES.md');
        if (notes !== null) reviewDue = parseReviewDue(notes);
      }
      return { session, hasMission, hasSourceDir, hasMap, lessonCount, reviewDue };
    }),
  );
}

/**
 * The launcher session is rooted at the study root itself. Its only job is
 * to host `fs:mkdir` calls that create course directories (session fs is
 * confined to the session root, so course dirs must be made from the parent).
 */
async function ensureLauncherSession(): Promise<AppSession> {
  const client = getStudyApi();
  const page = await client.listSessions({ pageSize: 100 });
  const existing = page.items.find(
    (s) => !s.archived && s.cwd === resolveStudyWorkspaceRoot(),
  );
  if (existing !== undefined) return existing;
  return client.createSession({ title: 'study-launcher', cwd: resolveStudyWorkspaceRoot() });
}

/**
 * `fs:mkdir` via raw fetch — the daemon client does not wrap this action.
 * Throws DaemonApiError with the server envelope code on failure.
 */
async function fsMkdir(sessionId: string, path: string): Promise<void> {
  const config = readKimiApiConfig();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const credential = getCredential();
  if (credential !== undefined) headers['Authorization'] = `Bearer ${credential}`;
  const response = await fetch(
    buildRestUrl(config.serverHttpUrl, `/sessions/${encodeURIComponent(sessionId)}/fs:mkdir`),
    { method: 'POST', headers, body: JSON.stringify({ path, recursive: true }) },
  );
  const envelope = (await response.json()) as { code: number; msg: string; request_id?: string };
  if (envelope.code !== 0) {
    throw new DaemonApiError({
      code: envelope.code,
      msg: envelope.msg,
      requestId: envelope.request_id ?? '',
    });
  }
}

export interface CreateCourseInput {
  readonly topic: string;
  readonly materials: readonly File[];
}

export interface CreateCourseResult {
  readonly session: AppSession;
  readonly activated: boolean;
  readonly materialError?: string;
}

/**
 * Product constraints appended to the teach-skill activation args. The skill
 * body stays untouched — these steer how it runs inside the product:
 * Chinese, family tone, AskUserQuestion-driven mission interview (so the web
 * UI renders native option cards), and disciplined reading-ledger updates
 * (so the outline panel can show honest reading progress).
 */
function teachActivationArgs(topic: string): string {
  return [
    topic,
    '',
    '[产品约束]',
    '1. 全程使用中文，语气像家人一样温和直接。',
    '2. Mission 访谈必须使用 AskUserQuestion 工具提问：一次只问一个问题，每问提供 2-4 个简洁选项（用户也可以自由输入）。',
    '3. 通读材料时，每读完一个区块立即更新 source/BOOK-READING-STATE.md 的阅读台账（Range/Status），不要批量补记。',
    '4. 每完成一课，在对话中用一行话汇报进度（第 x 课/共 y 课 + 课名）。',
  ].join('\n');
}

/**
 * End-to-end course creation:
 *   1. ensure the launcher session exists;
 *   2. mkdir a fresh course directory under the study root;
 *   3. create the course session rooted there;
 *   4. activate the teach skill with the topic as args (starts the mission
 *      interview turn);
 *   5. when materials were picked, upload them and queue a follow-up prompt
 *      so the agent saves them into the workspace `source/` directory.
 */
export async function createStudyCourse(input: CreateCourseInput): Promise<CreateCourseResult> {
  const client = getStudyApi();
  const launcher = await ensureLauncherSession();

  const base = courseDirName(input.topic);
  let cwd = '';
  let created = false;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
    const name = attempt === 0 ? base : `${base}-${attempt + 1}`;
    try {
      await fsMkdir(launcher.id, name);
      cwd = `${resolveStudyWorkspaceRoot()}/${name}`;
      created = true;
    } catch (error) {
      lastError = error;
    }
  }
  if (!created) {
    throw lastError instanceof Error ? lastError : new Error('failed to create course directory');
  }

  const session = await client.createSession({ title: input.topic, cwd });

  // Upload materials before activation so a slow upload cannot outlive the
  // first interview turn; failures are reported, not fatal.
  const parts: { type: 'file'; fileId: string; name: string; mediaType: string; size: number }[] = [];
  let materialError: string | undefined;
  for (const file of input.materials) {
    try {
      const uploaded = await client.uploadFile({ file, name: file.name });
      parts.push({
        type: 'file',
        fileId: uploaded.id,
        name: uploaded.name,
        mediaType: uploaded.mediaType,
        size: uploaded.size,
      });
    } catch (error) {
      materialError = error instanceof Error ? error.message : String(error);
    }
  }

  const { activated } = await client.activateSkill(session.id, 'teach', teachActivationArgs(input.topic));

  if (parts.length > 0) {
    try {
      await client.submitPrompt(session.id, {
        content: [
          {
            type: 'text',
            text: '这些是我的学习资料。请把它们保存到工作区的 source/ 目录下，并在后续设计课程时使用。',
          },
          ...parts,
        ],
      });
    } catch (error) {
      materialError = error instanceof Error ? error.message : String(error);
    }
  }

  return { session, activated, materialError };
}

/**
 * Human titles for lesson/reference HTML files, read from each document's
 * `<title>` (falls back to the slug). One fs read per file — callers should
 * fetch lazily (e.g. only when the file list changes), not on every poll.
 */
export async function readHtmlTitles(
  sessionId: string,
  dir: 'lessons' | 'reference',
  files: readonly string[],
): Promise<Record<string, string>> {
  const titles: Record<string, string> = {};
  await Promise.all(
    files.map(async (file) => {
      const html = await readWorkspaceText(sessionId, `${dir}/${file}`);
      const match = html?.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (match?.[1] !== undefined && match[1].trim().length > 0) {
        titles[file] = match[1].trim();
      }
    }),
  );
  return titles;
}

/** Ask the agent to generate the course lessons from the confirmed map. */
export async function requestLessonGeneration(sessionId: string): Promise<void> {
  await getStudyApi().submitPrompt(sessionId, {
    content: [
      {
        type: 'text',
        text: '教学地图已确认。请按照 source/TEACHING-MAP.md 的学习路径逐课生成课程：为每一课先写 source/lesson-briefs/ 下的简报，再发布对应的 lessons/*.html，直到地图中的课全部完成。',
      },
    ],
  });
}

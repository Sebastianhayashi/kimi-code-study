import { type Readable } from 'node:stream';

import {
  IFileService,
  ISessionContext,
  ISessionLifecycleService,
  type Scope,
} from '@moonshot-ai/agent-core-v2';
import { z } from 'zod';

import { errEnvelope, okEnvelope } from '../envelope';
import { defineRoute } from '../middleware/defineRoute';
import {
  StudyCatalogError,
  installStudyCatalogArchive,
  listStudyCatalog,
  materializeStudyCatalogCourse,
  readStudyCatalogCover,
} from '../services/studyCatalog';

const STUDY_CATALOG_ERROR = 42220;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

interface StudyCatalogRouteHost {
  post(
    path: string,
    options: { preHandler: unknown[]; schema?: Record<string, unknown> },
    handler: (req: unknown, reply: StudyReply) => unknown,
  ): unknown;
  get(
    path: string,
    options: { preHandler: unknown[]; schema?: Record<string, unknown> },
    handler: (req: unknown, reply: StudyReply) => unknown,
  ): unknown;
}

interface StudyReply {
  type(mime: string): StudyReply;
  header(name: string, value: string | number): StudyReply;
  code(status: number): StudyReply;
  send(payload: unknown): unknown;
}

const installSchema = z.object({
  session_id: z.string().min(1),
  file_id: z.string().min(1),
}).strict();

const listSchema = z.object({ session_id: z.string().min(1) }).strict();

const coverSchema = z.object({
  session_id: z.string().min(1),
  package_ref: z.string().min(1),
}).strict();

const materializeSchema = z.object({
  session_id: z.string().min(1),
  course_id: z.string().min(1),
  package_ref: z.string().min(1),
}).strict();

async function workspaceFor(core: Scope, sessionId: string): Promise<string> {
  const handle = await core.accessor.get(ISessionLifecycleService).resume(sessionId);
  if (handle === undefined) throw new StudyCatalogError('session_not_found', 'The Study workspace session is unavailable.');
  return handle.accessor.get(ISessionContext).cwd;
}

async function boundedBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const raw of stream) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as Uint8Array);
    size += chunk.length;
    if (size > MAX_UPLOAD_BYTES) throw new StudyCatalogError('archive_limit_exceeded', 'The selected package exceeds 50 MiB.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

function sendError(reply: StudyReply, requestId: string, error: unknown): void {
  const failure = error instanceof StudyCatalogError
    ? error
    : new StudyCatalogError('install_failed', 'The package operation could not be completed.');
  const status = failure.code === 'package_not_found' || failure.code === 'cover_not_found' || failure.code === 'session_not_found'
    ? 404
    : failure.code === 'package_conflict' || failure.code === 'course_conflict'
      ? 409
      : failure.code === 'archive_limit_exceeded'
        ? 413
        : 422;
  reply.code(status).send({
    ...errEnvelope(STUDY_CATALOG_ERROR, failure.message, requestId),
    details: {
      study_error_code: failure.code,
      ...failure.details,
    },
  });
}

export function registerStudyCatalogRoutes(app: StudyCatalogRouteHost, core: Scope): void {
  const install = defineRoute(
    {
      method: 'POST',
      path: '/study/catalog/packages:install',
      body: installSchema,
      success: { data: z.unknown() },
      errors: { [STUDY_CATALOG_ERROR]: { detailsSchema: z.object({ study_error_code: z.string() }).passthrough() } },
      description: 'Install and index a verified Kimi Study package upload',
      tags: ['study'],
      operationId: 'installStudyCatalogPackage',
    },
    async (req, reply) => {
      const store = core.accessor.get(IFileService);
      try {
        const workspace = await workspaceFor(core, req.body.session_id);
        const uploaded = await store.get(req.body.file_id);
        if (!uploaded.meta.name.toLocaleLowerCase('en-US').endsWith('.kstudy.zip')) {
          throw new StudyCatalogError('archive_invalid', 'Choose a .kstudy.zip package.');
        }
        const archive = await boundedBuffer(uploaded.stream());
        const result = await installStudyCatalogArchive(workspace, archive);
        reply.send(okEnvelope(result, req.id));
      } catch (error) {
        sendError(reply as unknown as StudyReply, req.id, error);
      } finally {
        await store.delete(req.body.file_id).catch(() => undefined);
      }
    },
  );
  app.post(install.path, install.options, install.handler as unknown as Parameters<StudyCatalogRouteHost['post']>[2]);

  const list = defineRoute(
    {
      method: 'GET',
      path: '/study/catalog/packages',
      querystring: listSchema,
      success: { data: z.unknown() },
      errors: { [STUDY_CATALOG_ERROR]: {} },
      description: 'List the latest installed Study Catalog revisions',
      tags: ['study'],
      operationId: 'listStudyCatalogPackages',
    },
    async (req, reply) => {
      try {
        const workspace = await workspaceFor(core, req.query.session_id);
        reply.send(okEnvelope(await listStudyCatalog(workspace), req.id));
      } catch (error) {
        sendError(reply as unknown as StudyReply, req.id, error);
      }
    },
  );
  app.get(list.path, list.options, list.handler as unknown as Parameters<StudyCatalogRouteHost['get']>[2]);

  const materialize = defineRoute(
    {
      method: 'POST',
      path: '/study/catalog/courses:materialize',
      body: materializeSchema,
      success: { data: z.unknown() },
      errors: { [STUDY_CATALOG_ERROR]: {} },
      description: 'Create an isolated course workspace from one installed package revision',
      tags: ['study'],
      operationId: 'materializeStudyCatalogCourse',
    },
    async (req, reply) => {
      try {
        const workspace = await workspaceFor(core, req.body.session_id);
        reply.send(okEnvelope(await materializeStudyCatalogCourse(
          workspace,
          req.body.course_id,
          req.body.package_ref,
        ), req.id));
      } catch (error) {
        sendError(reply as unknown as StudyReply, req.id, error);
      }
    },
  );
  app.post(materialize.path, materialize.options, materialize.handler as unknown as Parameters<StudyCatalogRouteHost['post']>[2]);

  const cover = defineRoute(
    {
      method: 'GET',
      path: '/study/catalog/cover',
      querystring: coverSchema,
      rawResponse: { 200: { type: 'string', format: 'binary' } },
      errors: { [STUDY_CATALOG_ERROR]: {} },
      description: 'Read a verified displayable Catalog cover',
      tags: ['study'],
      operationId: 'readStudyCatalogCover',
    },
    async (req, reply) => {
      try {
        const workspace = await workspaceFor(core, req.query.session_id);
        const result = await readStudyCatalogCover(workspace, req.query.package_ref);
        (reply as unknown as StudyReply)
          .type(result.mediaType)
          .header('etag', `"${result.etag}"`)
          .header('content-length', result.data.length)
          .code(200)
          .send(result.data);
      } catch (error) {
        sendError(reply as unknown as StudyReply, req.id, error);
      }
    },
  );
  app.get(cover.path, cover.options, cover.handler as unknown as Parameters<StudyCatalogRouteHost['get']>[2]);
}

export const STUDY_CATALOG_ERROR_CODE = STUDY_CATALOG_ERROR;

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf } from '../../plugins/auth.js';
import { mayChangeLock, requireMemberRole } from './access.js';
import {
  CreateNoteSchema,
  IdParamsSchema,
  ListQuerySchema,
  NoteListSchema,
  NoteSchema,
  ToggleItemSchema,
  UpdateNoteSchema,
} from './schemas.js';
import {
  applyNoteUpdate,
  applyToggleItem,
  createNote,
  getNote,
  listNotes,
  setNoteCategories,
  versionConflict,
} from './service.js';

export const noteRoutes: FastifyPluginAsyncZod = async (app) => {
  const { prisma } = app;
  app.addHook('onRequest', app.authenticate);
  const tags = ['notes'];

  app.get(
    '/notes',
    {
      schema: {
        tags,
        summary: 'List notes (summaries): My notes, Shared with me, or All',
        querystring: ListQuerySchema,
        response: { 200: NoteListSchema },
      },
    },
    async (request) => listNotes(prisma, authOf(request).userId, request.query),
  );

  app.post(
    '/notes',
    { schema: { tags, summary: 'Create a note', body: CreateNoteSchema, response: { 201: NoteSchema } } },
    async (request, reply) => reply.status(201).send(await createNote(prisma, authOf(request).userId, request.body)),
  );

  app.get(
    '/notes/:id',
    { schema: { tags, summary: 'Get a note', params: IdParamsSchema, response: { 200: NoteSchema } } },
    async (request) => getNote(prisma, request.params.id, authOf(request).userId),
  );

  app.patch(
    '/notes/:id',
    {
      schema: {
        tags,
        summary: 'Update title / type / content (editor). 409 NOTE_VERSION_CONFLICT if outdated.',
        params: IdParamsSchema,
        body: UpdateNoteSchema,
        response: { 200: NoteSchema },
      },
    },
    async (request) => {
      const { userId } = authOf(request);
      const noteId = request.params.id;
      const role = await requireMemberRole(prisma, noteId, userId, 'editor');
      if (!(await applyNoteUpdate(prisma, noteId, userId, request.body, { mayChangeLock: mayChangeLock(role) }))) {
        throw versionConflict(await getNote(prisma, noteId, userId));
      }
      return getNote(prisma, noteId, userId);
    },
  );

  app.post(
    '/notes/:id/items/toggle',
    {
      schema: {
        tags,
        summary: 'Check or uncheck one list item (editor). Used by the app and the widgets.',
        params: IdParamsSchema,
        body: ToggleItemSchema,
        response: { 200: NoteSchema },
      },
    },
    async (request) => {
      const { userId } = authOf(request);
      await requireMemberRole(prisma, request.params.id, userId, 'editor');
      await applyToggleItem(prisma, request.params.id, userId, request.body);
      return getNote(prisma, request.params.id, userId);
    },
  );

  app.delete(
    '/notes/:id',
    { schema: { tags, summary: 'Delete a note for everyone (owner)', params: IdParamsSchema } },
    async (request, reply) => {
      await requireMemberRole(prisma, request.params.id, authOf(request).userId, 'owner');
      await prisma.note.delete({ where: { id: request.params.id } });
      return reply.status(204).send();
    },
  );

  app.put(
    '/notes/:id/pinned',
    {
      schema: {
        tags,
        summary: 'Pin or unpin, for the caller only (NOTE-11)',
        params: IdParamsSchema,
        body: z.object({ pinned: z.boolean() }),
      },
    },
    async (request, reply) => {
      const { userId } = authOf(request);
      await requireMemberRole(prisma, request.params.id, userId, 'viewer');
      await prisma.noteMember.update({
        where: { noteId_userId: { noteId: request.params.id, userId } },
        data: { pinned: request.body.pinned },
      });
      return reply.status(204).send();
    },
  );

  app.put(
    '/notes/:id/categories',
    {
      schema: {
        tags,
        summary: "Replace the caller's own categories on the note (CAT-4)",
        params: IdParamsSchema,
        body: z.object({ categoryIds: z.array(z.uuid()).max(100) }),
      },
    },
    async (request, reply) => {
      const { userId } = authOf(request);
      await requireMemberRole(prisma, request.params.id, userId, 'viewer');
      await prisma.$transaction((tx) => setNoteCategories(tx, request.params.id, userId, request.body.categoryIds));
      return reply.status(204).send();
    },
  );
};

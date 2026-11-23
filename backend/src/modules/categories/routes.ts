import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { isUniqueViolation } from '../../db.js';
import { categoryNameKey } from '../../lib/fold.js';
import { AppError, notFound } from '../../errors.js';
import { authOf } from '../../plugins/auth.js';
import { IdParamsSchema } from '../notes/schemas.js';

const NameSchema = z.string().trim().min(1).max(40);
const ColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be #RRGGBB');

const CategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  position: z.number().int(),
  noteCount: z.number().int(),
});

type CategoryRow = { id: string; name: string; color: string; position: number; _count: { notes: number } };

const toCategory = (c: CategoryRow) => ({
  id: c.id,
  name: c.name,
  color: c.color,
  position: c.position,
  noteCount: c._count.notes,
});

const nameTaken = () => new AppError(409, 'CATEGORY_NAME_TAKEN', 'You already have a category with this name.');

export const categoryRoutes: FastifyPluginAsyncZod = async (app) => {
  const { prisma } = app;
  app.addHook('onRequest', app.authenticate);
  const tags = ['categories'];
  const withCount = { _count: { select: { notes: true } } } as const;

  async function assertNameFree(userId: string, name: string, exceptId?: string) {
    const existing = await prisma.category.findFirst({
      where: { userId, nameKey: categoryNameKey(name), ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (existing) throw nameTaken();
  }

  app.get(
    '/categories',
    { schema: { tags, summary: "The caller's categories", response: { 200: z.array(CategorySchema) } } },
    async (request) => {
      const rows = await prisma.category.findMany({
        where: { userId: authOf(request).userId },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        include: withCount,
      });
      return rows.map(toCategory);
    },
  );

  app.post(
    '/categories',
    {
      schema: {
        tags,
        summary: 'Create a category (CAT-1)',
        body: z.object({ name: NameSchema, color: ColorSchema }),
        response: { 201: CategorySchema },
      },
    },
    async (request, reply) => {
      const { userId } = authOf(request);
      await assertNameFree(userId, request.body.name);
      const last = await prisma.category.aggregate({ where: { userId }, _max: { position: true } });
      try {
        const created = await prisma.category.create({
          data: {
            userId,
            ...request.body,
            nameKey: categoryNameKey(request.body.name),
            position: (last._max.position ?? -1) + 1,
          },
          include: withCount,
        });
        return reply.status(201).send(toCategory(created));
      } catch (err) {
        if (isUniqueViolation(err)) throw nameTaken();
        throw err;
      }
    },
  );

  app.patch(
    '/categories/:id',
    {
      schema: {
        tags,
        summary: 'Rename, recolor or reorder a category',
        params: IdParamsSchema,
        body: z.object({
          name: NameSchema.optional(),
          color: ColorSchema.optional(),
          position: z.number().int().min(0).optional(),
        }),
        response: { 200: CategorySchema },
      },
    },
    async (request) => {
      const { userId } = authOf(request);
      const { id } = request.params;
      const owned = await prisma.category.findFirst({ where: { id, userId }, select: { id: true } });
      if (!owned) throw notFound('Category not found.');
      if (request.body.name !== undefined) await assertNameFree(userId, request.body.name, id);
      try {
        const { name } = request.body;
        const data = { ...request.body, ...(name !== undefined ? { nameKey: categoryNameKey(name) } : {}) };
        return toCategory(await prisma.category.update({ where: { id }, data, include: withCount }));
      } catch (err) {
        if (isUniqueViolation(err)) throw nameTaken();
        throw err;
      }
    },
  );

  app.delete(
    '/categories/:id',
    {
      schema: { tags, summary: 'Delete a category; notes are kept (CAT-5)', params: IdParamsSchema },
    },
    async (request, reply) => {
      const deleted = await prisma.category.deleteMany({
        where: { id: request.params.id, userId: authOf(request).userId },
      });
      if (deleted.count === 0) throw notFound('Category not found.');
      return reply.status(204).send();
    },
  );
};

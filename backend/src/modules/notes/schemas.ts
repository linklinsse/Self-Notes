import { z } from 'zod';

export const NoteTypeSchema = z.enum(['text', 'list']);
export const RoleSchema = z.enum(['owner', 'editor', 'viewer']);
export const ShareRoleSchema = z.enum(['editor', 'viewer']);

export const TitleSchema = z.string().max(200);
/** Size is checked in bytes by the service (413 CONTENT_TOO_LARGE above 1 MB). */
export const ContentSchema = z.string();

export const IdParamsSchema = z.object({ id: z.uuid() });

const UserRefSchema = z.object({ id: z.string(), username: z.string() });
const CategoryRefSchema = z.object({ id: z.string(), name: z.string(), color: z.string() });

const noteFields = {
  id: z.string(),
  title: z.string(),
  type: NoteTypeSchema,
  locked: z.boolean().describe('NOTE-17: the content is encrypted with a password (title stays readable)'),
  version: z.number().int(),
  role: RoleSchema.describe("Caller's role on the note"),
  pinned: z.boolean().describe('Pinned by the caller'),
  categories: z.array(CategoryRefSchema).describe("The caller's own categories on this note"),
  owner: UserRefSchema,
  shared: z.boolean().describe('Has other members or active share links'),
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: UserRefSchema.nullable().describe('null when the last edit came through a share link'),
};

export const NoteSchema = z.object({ ...noteFields, content: z.string() });

export const NoteSummarySchema = z.object({
  ...noteFields,
  preview: z.string().describe('Plain text, at most 200 characters. Empty for locked notes.'),
  items: z
    .object({ checked: z.number().int(), total: z.number().int() })
    .nullable()
    .describe('Checklist progress, list notes only (null when locked)'),
});

export const NoteListSchema = z.object({
  items: z.array(NoteSummarySchema),
  nextCursor: z.string().nullable(),
});

const idList = z
  .union([z.uuid(), z.array(z.uuid())])
  .optional()
  .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]));

/** NOTE-9: grid order. "By category" is a grouping done by the app on top of `favorites`. */
export const NoteSortSchema = z.enum(['favorites', 'updated', 'title']);

export const ListQuerySchema = z.object({
  scope: z.enum(['mine', 'shared', 'all']).default('mine'),
  q: z.string().trim().max(200).optional(),
  category: idList.describe('Category id, repeatable (any of)'),
  type: NoteTypeSchema.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sort: NoteSortSchema.default('favorites').describe(
    'favorites: favorites first, then last updated (default). updated: last updated. title: A to Z, untitled last.',
  ),
});

export const CreateNoteSchema = z.object({
  title: TitleSchema.default(''),
  type: NoteTypeSchema,
  content: ContentSchema.default(''),
  categoryIds: z.array(z.uuid()).max(100).default([]),
  pinned: z.boolean().default(false),
  locked: z.boolean().default(false).describe('NOTE-17: content is then an encrypted envelope'),
});

export const UpdateNoteSchema = z.object({
  version: z.number().int().min(1).describe('Version the change is based on (409 if outdated)'),
  title: TitleSchema.optional(),
  type: NoteTypeSchema.optional(),
  content: ContentSchema.optional().describe(
    'Omit when switching text -> list to let the server convert (NOTE-7). Required when `locked` changes.',
  ),
  locked: z
    .boolean()
    .optional()
    .describe('NOTE-17: lock (content encrypted by the client) or unlock (plain content). Owner only.'),
});

export const ToggleItemSchema = z.object({
  index: z.number().int().min(0).describe('Position among task items'),
  text: z.string().max(10_000).describe('Item text as the client saw it'),
  checked: z.boolean(),
});

export type ListQuery = z.infer<typeof ListQuerySchema>;
export type CreateNoteInput = z.infer<typeof CreateNoteSchema>;
export type UpdateNoteInput = z.infer<typeof UpdateNoteSchema>;
export type ToggleItemInput = z.infer<typeof ToggleItemSchema>;
export type NoteDto = z.infer<typeof NoteSchema>;
export type NoteSummaryDto = z.infer<typeof NoteSummarySchema>;

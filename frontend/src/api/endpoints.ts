import { api, unwrap } from './client';
import type {
  AuthResponse,
  Category,
  CreateNoteInput,
  Health,
  Member,
  Note,
  NoteList,
  NoteListQuery,
  Preferences,
  ShareLink,
  ShareRole,
  SharedNote,
  ToggleItemInput,
  UpdateNoteInput,
  User,
} from './types';

const id = (noteId: string) => ({ params: { path: { id: noteId } } });

export const authApi = {
  login: (username: string, password: string): Promise<AuthResponse> =>
    unwrap(api.POST('/api/v1/auth/login', { body: { username, password } })),
  register: (username: string, password: string): Promise<AuthResponse> =>
    unwrap(api.POST('/api/v1/auth/register', { body: { username, password } })),
  // Logout is session.ts signOut(): the platform holds the refresh token it needs.
};

export const meApi = {
  get: (): Promise<User> => unwrap(api.GET('/api/v1/me')),
  update: (body: { username?: string; preferences?: Preferences }): Promise<User> =>
    unwrap(api.PATCH('/api/v1/me', { body })),
  changePassword: (currentPassword: string, newPassword: string) =>
    unwrap(api.PUT('/api/v1/me/password', { body: { currentPassword, newPassword } })),
};

export const notesApi = {
  list: (query: NoteListQuery): Promise<NoteList> => unwrap(api.GET('/api/v1/notes', { params: { query } })),
  get: (noteId: string): Promise<Note> => unwrap(api.GET('/api/v1/notes/{id}', id(noteId))),
  create: (body: Partial<CreateNoteInput> & Pick<CreateNoteInput, 'type'>): Promise<Note> =>
    unwrap(api.POST('/api/v1/notes', { body: body as CreateNoteInput })),
  update: (noteId: string, body: UpdateNoteInput): Promise<Note> =>
    unwrap(api.PATCH('/api/v1/notes/{id}', { ...id(noteId), body })),
  toggleItem: (noteId: string, body: ToggleItemInput): Promise<Note> =>
    unwrap(api.POST('/api/v1/notes/{id}/items/toggle', { ...id(noteId), body })),
  remove: (noteId: string) => unwrap(api.DELETE('/api/v1/notes/{id}', id(noteId))),
  setPinned: (noteId: string, pinned: boolean) =>
    unwrap(api.PUT('/api/v1/notes/{id}/pinned', { ...id(noteId), body: { pinned } })),
  setCategories: (noteId: string, categoryIds: string[]) =>
    unwrap(api.PUT('/api/v1/notes/{id}/categories', { ...id(noteId), body: { categoryIds } })),
};

export const categoriesApi = {
  list: (): Promise<Category[]> => unwrap(api.GET('/api/v1/categories')),
  create: (name: string, color: string): Promise<Category> =>
    unwrap(api.POST('/api/v1/categories', { body: { name, color } })),
  update: (categoryId: string, body: { name?: string; color?: string; position?: number }): Promise<Category> =>
    unwrap(api.PATCH('/api/v1/categories/{id}', { params: { path: { id: categoryId } }, body })),
  remove: (categoryId: string) =>
    unwrap(api.DELETE('/api/v1/categories/{id}', { params: { path: { id: categoryId } } })),
};

export const sharingApi = {
  members: (noteId: string): Promise<Member[]> => unwrap(api.GET('/api/v1/notes/{id}/members', id(noteId))),
  addMember: (noteId: string, username: string, role: ShareRole): Promise<Member> =>
    unwrap(api.POST('/api/v1/notes/{id}/members', { ...id(noteId), body: { username, role } })),
  setRole: (noteId: string, userId: string, role: ShareRole): Promise<Member> =>
    unwrap(
      api.PATCH('/api/v1/notes/{id}/members/{userId}', {
        params: { path: { id: noteId, userId } },
        body: { role },
      }),
    ),
  removeMember: (noteId: string, userId: string | 'me') =>
    unwrap(api.DELETE('/api/v1/notes/{id}/members/{userId}', { params: { path: { id: noteId, userId } } })),
  links: (noteId: string): Promise<ShareLink[]> => unwrap(api.GET('/api/v1/notes/{id}/links', id(noteId))),
  createLink: (noteId: string, role: ShareRole, expiresAt?: string): Promise<ShareLink> =>
    unwrap(api.POST('/api/v1/notes/{id}/links', { ...id(noteId), body: { role, ...(expiresAt ? { expiresAt } : {}) } })),
  revokeLink: (noteId: string, linkId: string) =>
    unwrap(api.DELETE('/api/v1/notes/{id}/links/{linkId}', { params: { path: { id: noteId, linkId } } })),
};

const token = (t: string) => ({ params: { path: { token: t } } });

export const publicApi = {
  shared: (t: string): Promise<SharedNote> => unwrap(api.GET('/api/v1/shared/{token}', token(t))),
  update: (t: string, body: UpdateNoteInput): Promise<SharedNote> =>
    unwrap(api.PATCH('/api/v1/shared/{token}', { ...token(t), body })),
  toggleItem: (t: string, body: ToggleItemInput): Promise<SharedNote> =>
    unwrap(api.POST('/api/v1/shared/{token}/items/toggle', { ...token(t), body })),
};

export const healthApi = {
  get: (): Promise<Health> => unwrap(api.GET('/api/health')),
};

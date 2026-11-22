import type { paths } from './schema';

type Json<T> = T extends { content: { 'application/json': infer B } } ? B : never;

export type Note = Json<paths['/api/v1/notes/{id}']['get']['responses'][200]>;
export type NoteList = Json<paths['/api/v1/notes']['get']['responses'][200]>;
export type NoteSummary = NoteList['items'][number];
export type NoteListQuery = NonNullable<paths['/api/v1/notes']['get']['parameters']['query']>;
export type NoteType = Note['type'];
export type Role = Note['role'];
export type CreateNoteInput = Json<NonNullable<paths['/api/v1/notes']['post']['requestBody']>>;
export type UpdateNoteInput = Json<NonNullable<paths['/api/v1/notes/{id}']['patch']['requestBody']>>;
export type ToggleItemInput = Json<NonNullable<paths['/api/v1/notes/{id}/items/toggle']['post']['requestBody']>>;

export type Category = Json<paths['/api/v1/categories']['get']['responses'][200]>[number];
export type User = Json<paths['/api/v1/me']['get']['responses'][200]>;
export type Preferences = User['preferences'];
export type AuthResponse = Json<paths['/api/v1/auth/login']['post']['responses'][200]>;

export type Member = Json<paths['/api/v1/notes/{id}/members']['get']['responses'][200]>[number];
export type ShareLink = Json<paths['/api/v1/notes/{id}/links']['get']['responses'][200]>[number];
export type ShareRole = ShareLink['role'];
export type SharedNote = Json<paths['/api/v1/shared/{token}']['get']['responses'][200]>;
export type Health = Json<paths['/api/health']['get']['responses'][200]>;

/** The fields an editor works on, common to member notes and share-link notes. */
export interface NoteBase {
  title: string;
  type: NoteType;
  content: string;
  version: number;
}

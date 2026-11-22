import { QueryClient, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { categoriesApi, notesApi, sharingApi } from './endpoints';
import { isApiError } from './errors';
import type { Note, NoteListQuery } from './types';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failures, err) => failures < 2 && (!isApiError(err) || err.isOffline),
    },
  },
});

export const keys = {
  notes: ['notes'] as const,
  noteList: (query: Omit<NoteListQuery, 'cursor'>) => ['notes', 'list', query] as const,
  note: (id: string) => ['notes', 'one', id] as const,
  categories: ['categories'] as const,
  members: (id: string) => ['members', id] as const,
  links: (id: string) => ['links', id] as const,
};

export function useNoteList(query: Omit<NoteListQuery, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: keys.noteList(query),
    queryFn: ({ pageParam }) => notesApi.list({ ...query, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useNote(id: string) {
  return useQuery({ queryKey: keys.note(id), queryFn: () => notesApi.get(id) });
}

export function useCategories() {
  return useQuery({ queryKey: keys.categories, queryFn: categoriesApi.list });
}

/** Put a fresh note in the cache and mark the lists as stale. */
export function useStoreNote() {
  const client = useQueryClient();
  return (note: Note) => {
    client.setQueryData(keys.note(note.id), note);
    void client.invalidateQueries({ queryKey: [...keys.notes, 'list'] });
  };
}

export function useCreateNote() {
  const store = useStoreNote();
  return useMutation({ mutationFn: notesApi.create, onSuccess: store });
}

export function useDeleteNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: notesApi.remove,
    onSuccess: (_data, noteId) => {
      client.removeQueries({ queryKey: keys.note(noteId) });
      void client.invalidateQueries({ queryKey: keys.notes });
    },
  });
}

export function useLeaveNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) => sharingApi.removeMember(noteId, 'me'),
    onSuccess: (_data, noteId) => {
      client.removeQueries({ queryKey: keys.note(noteId) });
      void client.invalidateQueries({ queryKey: keys.notes });
    },
  });
}

/** Per-user note state (pin, categories): update the cached note optimistically. */
export function useNoteState(noteId: string) {
  const client = useQueryClient();
  const patch = (fn: (n: Note) => Note) => client.setQueryData<Note>(keys.note(noteId), (n) => (n ? fn(n) : n));
  const refresh = () => {
    void client.invalidateQueries({ queryKey: keys.note(noteId) });
    void client.invalidateQueries({ queryKey: [...keys.notes, 'list'] });
    void client.invalidateQueries({ queryKey: keys.categories });
  };
  return {
    setPinned: async (pinned: boolean) => {
      patch((n) => ({ ...n, pinned }));
      try {
        await notesApi.setPinned(noteId, pinned);
      } finally {
        refresh();
      }
    },
    setCategories: async (categoryIds: string[], all: { id: string; name: string; color: string }[]) => {
      patch((n) => ({ ...n, categories: all.filter((c) => categoryIds.includes(c.id)) }));
      try {
        await notesApi.setCategories(noteId, categoryIds);
      } finally {
        refresh();
      }
    },
  };
}

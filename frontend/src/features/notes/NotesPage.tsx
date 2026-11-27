import { type CSSProperties, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { errorMessage } from '../../api/errors';
import { useCategories, useCreateNote, useNoteList } from '../../api/queries';
import type { NoteType } from '../../api/types';
import { AppShell, Brand } from '../../components/AppShell';
import { Icon } from '../../components/Icon';
import { MenuItem, Popover } from '../../components/Popover';
import { useToast } from '../../components/Toast';
import { Button, CenteredSpinner, EmptyState, ErrorNote, IconButton } from '../../components/ui';
import { readableTextOn } from '../../themes/contrast';
import { useUser } from '../../auth/AuthProvider';
import { useUpdatePreferences } from '../settings/usePreferences';
import { NoteCard } from './NoteCard';
import { NOTE_SORTS, type NoteGroup, apiSort, groupNotes, noteSortOf } from './noteGroups';
import { GRID_COLUMNS, useGridColumns } from './gridColumns';

type Scope = 'mine' | 'shared';

/** NOTE-9 / NOTE-10: My notes and Shared with me, with search and filters kept in the URL. */
export function NotesPage() {
  const [params, setParams] = useSearchParams();
  const scope: Scope = params.get('scope') === 'shared' ? 'shared' : 'mine';
  const q = params.get('q') ?? '';
  const type = (['text', 'list'] as const).find((t) => t === params.get('type'));
  const category = params.getAll('category');

  const [search, setSearch] = useState(q);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim() === q) return;
      setParams(
        (p) => {
          if (search.trim()) p.set('q', search.trim());
          else p.delete('q');
          return p;
        },
        { replace: true },
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [search, q, setParams]);

  // NOTE-9: the order is a preference of the account, so it is the same on every device.
  const user = useUser();
  const updatePreferences = useUpdatePreferences();
  const [columns, setColumns] = useGridColumns();
  const sort = noteSortOf(user.preferences.noteSort);

  const list = useNoteList({
    scope,
    limit: 50,
    sort: apiSort(sort),
    ...(q ? { q } : {}),
    ...(type ? { type } : {}),
    ...(category.length ? { category } : {}),
  });
  const categories = useCategories();
  const create = useCreateNote();
  const navigate = useNavigate();
  const toast = useToast();

  const update = (fn: (p: URLSearchParams) => void) =>
    setParams((p) => {
      fn(p);
      return p;
    });

  async function newNote(noteType: NoteType) {
    try {
      const note = await create.mutateAsync({ type: noteType });
      navigate(`/notes/${note.id}`, { state: { focusTitle: true, created: true } });
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  // Grouping by category needs every note, not only the first page.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    if (sort === 'category' && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [sort, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const notes = list.data?.pages.flatMap((p) => p.items) ?? [];
  const groups = groupNotes(notes, sort, categories.data ?? []);
  const filtered = Boolean(q || type || category.length);

  return (
    <AppShell
      bar={
        <>
          <Brand />
          <label className="search">
            <Icon name="search" size={18} />
            <input
              type="search"
              placeholder="Search notes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search notes"
            />
          </label>
          <Link to="/settings" className="icon-btn" aria-label="Settings" title="Settings">
            <Icon name="sliders" />
          </Link>
        </>
      }
    >
      <div className="toolbar">
        <div className="tabs" role="tablist">
          {(['mine', 'shared'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={scope === s}
              className={`tab ${scope === s ? 'is-active' : ''}`}
              onClick={() => update((p) => (s === 'mine' ? p.delete('scope') : p.set('scope', s)))}
            >
              {s === 'mine' ? 'My notes' : 'Shared with me'}
            </button>
          ))}
        </div>
        <div className="segmented" aria-label="Note type">
          {([undefined, 'text', 'list'] as const).map((t) => (
            <button
              key={t ?? 'all'}
              type="button"
              className={type === t ? 'is-active' : ''}
              onClick={() => update((p) => (t ? p.set('type', t) : p.delete('type')))}
            >
              {t === undefined ? 'All' : t === 'text' ? 'Text' : 'Lists'}
            </button>
          ))}
        </div>
        <Popover
          align="end"
          trigger={({ toggle, open }) => (
            <button
              type="button"
              className={`sort-btn ${open ? 'is-open' : ''}`}
              onClick={toggle}
              aria-haspopup="menu"
              aria-label={`Sort: ${NOTE_SORTS.find((s) => s.id === sort)!.label}`}
            >
              <Icon name="sort" size={18} />
              <span>{NOTE_SORTS.find((s) => s.id === sort)!.label}</span>
            </button>
          )}
        >
          {(close) => (
            <div className="menu" role="menu">
              <p className="menu-title">Sort by</p>
              {NOTE_SORTS.map((s) => (
                <MenuItem
                  key={s.id}
                  icon={<Icon name={s.id === sort ? 'check' : 'sort'} />}
                  onClick={() => {
                    close();
                    if (s.id !== sort) void updatePreferences({ noteSort: s.id });
                  }}
                >
                  {s.label}
                </MenuItem>
              ))}
              {/* NOTE-21: saved on this device. */}
              <p className="menu-title">Notes per row</p>
              <div className="per-row" role="group" aria-label="Notes per row">
                {GRID_COLUMNS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={columns === n ? 'is-active' : ''}
                    aria-pressed={columns === n}
                    aria-label={n === 0 ? 'Automatic' : `${n} per row`}
                    onClick={() => setColumns(n)}
                  >
                    {n === 0 ? 'Auto' : n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Popover>
      </div>

      {(categories.data?.length ?? 0) > 0 && (
        <div className="filter-chips" aria-label="Filter by category">
          {categories.data!.map((c) => {
            const active = category.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                className={`filter-chip is-category ${active ? 'is-active' : ''}`}
                style={{ '--chip-color': c.color, '--chip-text': readableTextOn(c.color) } as CSSProperties}
                aria-pressed={active}
                onClick={() =>
                  update((p) => {
                    const next = active ? category.filter((id) => id !== c.id) : [...category, c.id];
                    p.delete('category');
                    for (const id of next) p.append('category', id);
                  })
                }
              >
                {c.name}
              </button>
            );
          })}
        </div>
      )}

      {list.isPending ? (
        <CenteredSpinner />
      ) : list.isError ? (
        <ErrorNote>{errorMessage(list.error)}</ErrorNote>
      ) : notes.length === 0 ? (
        filtered ? (
          <EmptyState icon="search" title="No matching notes">
            <p>Try another search or remove a filter.</p>
          </EmptyState>
        ) : scope === 'shared' ? (
          <EmptyState icon="users" title="Nothing shared with you yet">
            <p>Notes other people share with you will appear here.</p>
          </EmptyState>
        ) : (
          <EmptyState icon="pencil" title="Your notes will live here">
            <p>Create a text note or a checklist with the + button.</p>
          </EmptyState>
        )
      ) : (
        <>
          {groups.map((group) => (
            <NoteSection key={group.key} group={group} showOwner={scope === 'shared'} columns={columns} />
          ))}
          {list.hasNextPage && (
            <div className="centered">
              <Button onClick={() => list.fetchNextPage()} busy={list.isFetchingNextPage}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      <div className="fab-anchor">
        <Popover
          align="end"
          trigger={({ toggle, open }) => (
            <IconButton icon="plus" label="New note" className="fab" onClick={toggle} active={open} />
          )}
        >
          {(close) => (
            <div className="menu menu-up">
              <MenuItem
                icon={<Icon name="text" />}
                onClick={() => {
                  close();
                  void newNote('text');
                }}
              >
                Text note
              </MenuItem>
              <MenuItem
                icon={<Icon name="checklist" />}
                onClick={() => {
                  close();
                  void newNote('list');
                }}
              >
                Checklist
              </MenuItem>
            </div>
          )}
        </Popover>
      </div>
    </AppShell>
  );
}

function NoteSection({
  group: { title, notes },
  showOwner,
  columns,
}: {
  group: NoteGroup;
  showOwner: boolean;
  /** NOTE-21: notes per row, 0 for as many as fit. */
  columns: number;
}) {
  return (
    <section className="note-section">
      {title && <h2 className="section-title">{title}</h2>}
      <div
        className={`note-grid ${columns ? 'has-columns' : ''}`}
        style={columns ? ({ '--grid-columns': columns } as CSSProperties) : undefined}
      >
        {notes.map((n) => (
          <NoteCard key={n.id} note={n} showOwner={showOwner} />
        ))}
      </div>
    </section>
  );
}

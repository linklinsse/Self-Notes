import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { categoriesApi } from '../../api/endpoints';
import { errorMessage } from '../../api/errors';
import { keys, useCategories, useNoteState } from '../../api/queries';
import type { Note } from '../../api/types';
import { Popover } from '../../components/Popover';
import { useToast } from '../../components/Toast';
import { IconButton } from '../../components/ui';
import { useTheme } from '../../themes/ThemeProvider';
import { ColorDot } from './CategoryChip';

/** CAT-3 / CAT-4: tag a note with the caller's own categories. */
export function CategoryPicker({ note }: { note: Note }) {
  const categories = useCategories();
  const noteState = useNoteState(note.id);
  const client = useQueryClient();
  const theme = useTheme();
  const toast = useToast();
  const [name, setName] = useState('');
  const all = categories.data ?? [];
  const selected = note.categories.map((c) => c.id);

  async function set(ids: string[], list = all) {
    try {
      await noteState.setCategories(ids, list);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const color = theme.categoryPresets[all.length % theme.categoryPresets.length]!;
      const category = await categoriesApi.create(trimmed, color);
      setName('');
      await client.invalidateQueries({ queryKey: keys.categories });
      await set([...selected, category.id], [...all, category]);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <Popover
      trigger={({ toggle, open }) => (
        <IconButton icon="tag" label="Categories" onClick={toggle} active={open || selected.length > 0} />
      )}
    >
      {() => (
        <div className="menu picker">
          <p className="menu-title">Categories</p>
          {all.length === 0 && <p className="menu-hint">No categories yet. Create one below.</p>}
          {all.map((c) => {
            const checked = selected.includes(c.id);
            return (
              <label key={c.id} className="menu-check">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => void set(checked ? selected.filter((id) => id !== c.id) : [...selected, c.id])}
                />
                <ColorDot color={c.color} />
                <span>{c.name}</span>
              </label>
            );
          })}
          <form className="menu-form" onSubmit={create}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" maxLength={40} />
            <button type="submit" className="btn btn-ghost" disabled={!name.trim()}>
              Add
            </button>
          </form>
          <Link to="/settings#categories" className="menu-link">
            Manage categories
          </Link>
        </div>
      )}
    </Popover>
  );
}

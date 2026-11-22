import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { categoriesApi } from '../../api/endpoints';
import { errorMessage } from '../../api/errors';
import { keys, useCategories } from '../../api/queries';
import type { Category } from '../../api/types';
import { ConfirmDialog } from '../../components/Dialog';
import { Popover } from '../../components/Popover';
import { useToast } from '../../components/Toast';
import { Button, IconButton, Spinner } from '../../components/ui';
import { useTheme } from '../../themes/ThemeProvider';

function ColorButton({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const theme = useTheme();
  return (
    <Popover
      align="start"
      trigger={({ toggle }) => (
        <button type="button" className="color-button" style={{ background: color }} onClick={toggle} aria-label="Change color" />
      )}
    >
      {(close) => (
        <div className="menu color-menu">
          <div className="color-presets">
            {theme.categoryPresets.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`color-button ${preset.toLowerCase() === color.toLowerCase() ? 'is-active' : ''}`}
                style={{ background: preset }}
                aria-label={preset}
                onClick={() => {
                  onChange(preset);
                  close();
                }}
              />
            ))}
          </div>
          <label className="color-custom">
            Custom
            <input type="color" value={color} onChange={(e) => onChange(e.target.value)} />
          </label>
        </div>
      )}
    </Popover>
  );
}

function CategoryRow({ category, onError }: { category: Category; onError: (err: unknown) => void }) {
  const client = useQueryClient();
  const [name, setName] = useState(category.name);
  const [confirm, setConfirm] = useState(false);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: keys.categories });
    void client.invalidateQueries({ queryKey: keys.notes });
  };

  async function update(patch: { name?: string; color?: string }) {
    try {
      await categoriesApi.update(category.id, patch);
      refresh();
    } catch (err) {
      setName(category.name);
      onError(err);
    }
  }

  return (
    <li className="category-row">
      <ColorButton color={category.color} onChange={(color) => void update({ color })} />
      <input
        className="category-name"
        value={name}
        maxLength={40}
        aria-label="Category name"
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (name.trim() && name.trim() !== category.name) void update({ name: name.trim() });
          else setName(category.name);
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <span className="muted small">
        {category.noteCount} {category.noteCount === 1 ? 'note' : 'notes'}
      </span>
      <IconButton icon="trash" label={`Delete ${category.name}`} onClick={() => setConfirm(true)} />
      <ConfirmDialog
        open={confirm}
        title={`Delete “${category.name}”?`}
        message="It will be removed from your notes. The notes themselves are kept."
        confirmLabel="Delete"
        danger
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          try {
            await categoriesApi.remove(category.id);
            refresh();
          } catch (err) {
            onError(err);
          }
        }}
      />
    </li>
  );
}

/** CAT-1 / CAT-5: create, rename, recolor and delete the user's categories. */
export function CategoryManager() {
  const categories = useCategories();
  const client = useQueryClient();
  const theme = useTheme();
  const toast = useToast();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = categories.data ?? [];
  const nextColor = color ?? theme.categoryPresets[list.length % theme.categoryPresets.length]!;
  const onError = (err: unknown) => toast(errorMessage(err), 'error');

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await categoriesApi.create(name.trim(), nextColor);
      setName('');
      setColor(null);
      await client.invalidateQueries({ queryKey: keys.categories });
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  if (categories.isPending) return <Spinner />;

  return (
    <div className="category-manager">
      {list.length > 0 && (
        <ul className="category-list">
          {list.map((c) => (
            <CategoryRow key={`${c.id}:${c.name}`} category={c} onError={onError} />
          ))}
        </ul>
      )}
      <form className="category-row category-add" onSubmit={add}>
        <ColorButton color={nextColor} onChange={setColor} />
        <input
          className="category-name"
          value={name}
          maxLength={40}
          placeholder="New category"
          aria-label="New category name"
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" busy={busy} disabled={!name.trim()} icon="plus">
          Add
        </Button>
      </form>
    </div>
  );
}

import { type CSSProperties, type KeyboardEvent, type PointerEvent, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { InlineMarkdown } from '../../markdown/Markdown';
import {
  type ItemLine,
  type Line,
  insertItem,
  items,
  moveItem,
  parseLines,
  removeItem,
  serializeLines,
  updateItem,
} from '../../markdown/listModel';

/** Keep the previous keys when the structure is unchanged, so rows and focus survive server updates. */
function reconcile(prev: Line[], next: Line[]): Line[] {
  return next.map((line, i) => {
    const old = prev[i];
    return old && old.kind === line.kind ? { ...line, key: old.key } : line;
  });
}

const depth = (line: ItemLine) => Math.min(4, Math.floor(line.indent.replace(/\t/g, '  ').length / 2));

/**
 * NOTE-4 / NOTE-5 / NOTE-6: checklist UI over GFM task items. Items stay where they are when
 * checked; the order changes only by dragging the handle.
 */
export function ChecklistEditor({
  content,
  readOnly,
  onChange,
  onToggle,
}: {
  content: string;
  readOnly: boolean;
  onChange: (content: string) => void;
  onToggle: (index: number, text: string, checked: boolean) => void;
}) {
  const [source, setSource] = useState(content);
  const [lines, setLines] = useState(() => parseLines(content));
  if (content !== source) {
    // Changed outside this editor (server update, checkbox toggle): re-parse.
    setSource(content);
    setLines(reconcile(lines, parseLines(content)));
  }
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const list = useRef<HTMLUListElement>(null);

  const all = items(lines);

  function commit(next: Line[]) {
    const text = serializeLines(next);
    setLines(next);
    setSource(text);
    onChange(text);
  }

  function addAfter(key: string | null) {
    const result = insertItem(lines, key ?? all.at(-1)?.key ?? null);
    commit(result.lines);
    setFocusKey(result.key);
  }

  function toggle(line: ItemLine) {
    onToggle(
      all.findIndex((l) => l.key === line.key),
      line.text,
      !line.checked,
    );
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>, line: ItemLine) {
    const visible = all;
    const pos = visible.findIndex((l) => l.key === line.key);
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      addAfter(line.key);
    } else if (e.key === 'Backspace' && line.text === '') {
      e.preventDefault();
      const neighbour = visible[pos - 1] ?? visible[pos + 1];
      commit(removeItem(lines, line.key));
      setFocusKey(neighbour?.key ?? null);
    } else if (e.key === 'ArrowUp' && pos > 0) {
      e.preventDefault();
      setFocusKey(visible[pos - 1]!.key);
    } else if (e.key === 'ArrowDown' && pos < visible.length - 1) {
      e.preventDefault();
      setFocusKey(visible[pos + 1]!.key);
    }
  }

  // Reorder by dragging the handle (pointer events: mouse and touch).
  function onDragStart(e: PointerEvent<HTMLSpanElement>, key: string) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setFocusKey(null);
    setDragKey(key);
  }

  function onDragMove(e: PointerEvent<HTMLSpanElement>) {
    if (!dragKey || !list.current) return;
    const rows = Array.from(list.current.querySelectorAll<HTMLElement>('[data-key]'));
    const target = rows.find((row) => {
      const box = row.getBoundingClientRect();
      return e.clientY >= box.top && e.clientY <= box.bottom;
    });
    const key = target?.dataset.key;
    if (key && key !== dragKey) commit(moveItem(lines, dragKey, key));
  }

  function renderRow(line: ItemLine) {
    const editing = !readOnly && focusKey === line.key;
    return (
      <li
        key={line.key}
        data-key={line.key}
        className={`check-item ${line.checked ? 'is-done' : ''} ${dragKey === line.key ? 'is-dragging' : ''}`}
        style={{ '--depth': depth(line) } as CSSProperties}
      >
        {!readOnly && (
          <span
            className="drag-handle"
            aria-hidden
            onPointerDown={(e) => onDragStart(e, line.key)}
            onPointerMove={onDragMove}
            onPointerUp={() => setDragKey(null)}
            onPointerCancel={() => setDragKey(null)}
          >
            <Icon name="grip" size={16} />
          </span>
        )}
        <input
          type="checkbox"
          className="checkbox"
          checked={line.checked}
          disabled={readOnly}
          onChange={() => toggle(line)}
          aria-label={`${line.checked ? 'Uncheck' : 'Check'} ${line.text || 'item'}`}
        />
        {editing ? (
          <input
            className="item-input"
            value={line.text}
            autoFocus
            aria-label="Item text"
            onChange={(e) => commit(updateItem(lines, line.key, { text: e.target.value }))}
            onKeyDown={(e) => onKeyDown(e, line)}
            onBlur={() => setFocusKey((k) => (k === line.key ? null : k))}
          />
        ) : (
          <span
            className={`item-text ${line.text ? '' : 'is-empty'}`}
            tabIndex={readOnly ? undefined : 0}
            onFocus={() => !readOnly && setFocusKey(line.key)}
            onClick={(e) => {
              if (!readOnly && !(e.target as Element).closest('a')) setFocusKey(line.key);
            }}
          >
            {line.text ? <InlineMarkdown text={line.text} /> : 'Empty item'}
          </span>
        )}
        {!readOnly && (
          <button
            type="button"
            className="item-remove"
            aria-label="Remove item"
            title="Remove item"
            onClick={() => commit(removeItem(lines, line.key))}
          >
            <Icon name="x" size={16} />
          </button>
        )}
      </li>
    );
  }

  if (all.length === 0 && readOnly) return <p className="muted">This list is empty.</p>;

  return (
    <div className="checklist">
      <ul className="check-items" ref={list}>
        {all.map(renderRow)}
      </ul>
      {!readOnly && (
        <button type="button" className="add-item" onClick={() => addAfter(null)}>
          <Icon name="plus" size={18} />
          Add item
        </button>
      )}
    </div>
  );
}

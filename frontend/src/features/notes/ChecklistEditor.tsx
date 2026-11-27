import { type CSSProperties, type KeyboardEvent, type PointerEvent, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { InlineMarkdown } from '../../markdown/Markdown';
import {
  type ItemLine,
  type Line,
  firstLine,
  insertItem,
  items,
  moveItem,
  parseLines,
  removeItem,
  serializeLines,
  updateItem,
} from '../../markdown/listModel';
import { platform } from '../../platform';

/** Keep the previous keys when the structure is unchanged, so rows and focus survive server updates. */
function reconcile(prev: Line[], next: Line[]): Line[] {
  return next.map((line, i) => {
    const old = prev[i];
    return old && old.kind === line.kind ? { ...line, key: old.key } : line;
  });
}

const depth = (line: ItemLine) => Math.min(4, Math.floor(line.indent.replace(/\t/g, '  ').length / 2));

/**
 * NOTE-4: on phones (the Android app, touch screens), Enter starts a new line in the item, and
 * Enter on an empty last line starts the next item. With a keyboard, Enter starts the next item and
 * Shift+Enter a new line.
 */
const enterBreaksLine = () =>
  platform.kind === 'android' || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);

/** A text area as tall as its text. */
function ItemTextarea(props: React.ComponentProps<'textarea'>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={1} {...props} />;
}

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

  function addAfter(key: string | null, from: Line[] = lines) {
    const result = insertItem(from, key ?? items(from).at(-1)?.key ?? null);
    commit(result.lines);
    setFocusKey(result.key);
  }

  /** Ends a multiline item typed on a phone: its trailing empty lines go, the next item starts. */
  function finishItem(line: ItemLine) {
    addAfter(line.key, updateItem(lines, line.key, { text: line.text.replace(/\n+$/, '') }));
  }

  function toggle(line: ItemLine) {
    // The server knows an item by its position and first line (multiline items, NOTE-4).
    onToggle(
      all.findIndex((l) => l.key === line.key),
      firstLine(line.text),
      !line.checked,
    );
  }

  function onTextChange(line: ItemLine, value: string) {
    // Phone keyboards may skip the keydown: Enter on the empty last line shows up here.
    if (enterBreaksLine() && value === `${line.text}\n` && line.text.endsWith('\n')) {
      finishItem(line);
      return;
    }
    commit(updateItem(lines, line.key, { text: value }));
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>, line: ItemLine) {
    const visible = all;
    const pos = visible.findIndex((l) => l.key === line.key);
    const { selectionStart, selectionEnd } = e.currentTarget;
    const onFirstLine = !line.text.slice(0, selectionStart).includes('\n');
    const onLastLine = !line.text.slice(selectionEnd).includes('\n');
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      if (e.shiftKey) return; // a new line in the item
      if (!enterBreaksLine()) {
        e.preventDefault();
        addAfter(line.key);
      } else if (selectionStart === line.text.length && (line.text === '' || line.text.endsWith('\n'))) {
        e.preventDefault();
        finishItem(line);
      }
    } else if (e.key === 'Backspace' && line.text === '') {
      e.preventDefault();
      const neighbour = visible[pos - 1] ?? visible[pos + 1];
      commit(removeItem(lines, line.key));
      setFocusKey(neighbour?.key ?? null);
    } else if (e.key === 'ArrowUp' && pos > 0 && onFirstLine) {
      e.preventDefault();
      setFocusKey(visible[pos - 1]!.key);
    } else if (e.key === 'ArrowDown' && pos < visible.length - 1 && onLastLine) {
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
          aria-label={`${line.checked ? 'Uncheck' : 'Check'} ${firstLine(line.text) || 'item'}`}
        />
        {editing ? (
          <ItemTextarea
            className="item-input"
            value={line.text}
            autoFocus
            aria-label="Item text"
            onChange={(e) => onTextChange(line, e.target.value)}
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

import { useLayoutEffect, useRef, useState } from 'react';
import { MarkdownView, type TaskToggleHandler } from '../../markdown/Markdown';

/** NOTE-3: Markdown editor with Edit and Preview modes. NOTE-16: checkboxes work in Preview. */
export function TextEditor({
  content,
  readOnly,
  onChange,
  onToggleTask,
}: {
  content: string;
  readOnly: boolean;
  onChange: (content: string) => void;
  onToggleTask: TaskToggleHandler;
}) {
  const [mode, setMode] = useState<'edit' | 'preview'>(readOnly || content.trim() ? 'preview' : 'edit');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const effectiveMode = readOnly ? 'preview' : mode;

  // Grow the textarea with its content.
  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [content, effectiveMode]);

  return (
    <div className="text-editor">
      {!readOnly && (
        <div className="segmented segmented-small" aria-label="Editor mode">
          <button type="button" className={mode === 'edit' ? 'is-active' : ''} onClick={() => setMode('edit')}>
            Edit
          </button>
          <button type="button" className={mode === 'preview' ? 'is-active' : ''} onClick={() => setMode('preview')}>
            Preview
          </button>
        </div>
      )}

      {effectiveMode === 'edit' ? (
        <textarea
          ref={textarea}
          className="text-input"
          value={content}
          onChange={(e) => onChange(e.target.value)}
          placeholder={'Write in Markdown: # heading, **bold**, - list, [link](https://…)'}
          aria-label="Note content"
          autoFocus={!content}
        />
      ) : content.trim() ? (
        <div
          className={`preview ${readOnly ? '' : 'is-clickable'}`}
          onClick={(e) => {
            if (!readOnly && !(e.target as Element).closest('a, input')) setMode('edit');
          }}
        >
          <MarkdownView content={content} onToggleTask={readOnly ? undefined : onToggleTask} />
        </div>
      ) : (
        <p className="muted">This note is empty.</p>
      )}
    </div>
  );
}

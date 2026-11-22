import { type ReactNode, useEffect, useState } from 'react';
import type { DraftController, DraftState, SaveStatus } from './draft';
import { Icon, type IconName } from '../../components/Icon';
import { Progress } from '../../components/Progress';
import { taskProgress } from '../../markdown/tasklist';
import { Button, ErrorNote } from '../../components/ui';
import { ChecklistEditor } from './ChecklistEditor';
import { TextEditor } from './TextEditor';

const STATUS: Record<SaveStatus, { label: string; icon: IconName | null }> = {
  saved: { label: 'Saved', icon: 'check' },
  pending: { label: 'Editing…', icon: null },
  saving: { label: 'Saving…', icon: null },
  offline: { label: 'Offline, will retry', icon: 'cloudOff' },
  conflict: { label: 'Conflict', icon: 'alert' },
  error: { label: 'Not saved', icon: 'alert' },
};

export function SaveStatusBadge({ status }: { status: SaveStatus }) {
  const { label, icon } = STATUS[status];
  return (
    <span className={`save-status is-${status}`} aria-live="polite">
      {icon && <Icon name={icon} size={14} />}
      <span className="save-status-label">{label}</span>
    </span>
  );
}

/** True once the page has scrolled past `threshold` pixels. */
function useScrolled(threshold: number): boolean {
  const [scrolled, setScrolled] = useState(() => window.scrollY > threshold);
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setScrolled(window.scrollY > threshold));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, [threshold]);
  return scrolled;
}

/**
 * Title + content editor, shared by member notes and share-link notes.
 * NOTE-20: the title, `head` (the categories) and a checklist's progress bar stay at the top while
 * the note scrolls, and the title gets smaller once the page has scrolled.
 */
export function NoteEditorBody({
  state,
  ctrl,
  readOnly,
  autoFocusTitle,
  head,
}: {
  state: DraftState;
  ctrl: DraftController;
  readOnly: boolean;
  autoFocusTitle?: boolean;
  head?: ReactNode;
}) {
  const compact = useScrolled(24);
  const progress = state.type === 'list' ? taskProgress(state.content) : null;
  return (
    <article className="editor">
      {state.status === 'conflict' && (
        <div className="banner banner-warning" role="alert">
          <Icon name="alert" />
          <p>This note was changed somewhere else while you were editing it.</p>
          <div className="banner-actions">
            <Button variant="ghost" onClick={() => ctrl.resolveConflict('theirs')}>
              Use their version
            </Button>
            <Button variant="primary" onClick={() => ctrl.resolveConflict('mine')}>
              Keep mine
            </Button>
          </div>
        </div>
      )}
      {state.status === 'error' && state.error && <ErrorNote>{state.error}</ErrorNote>}

      <header className={`note-head ${compact ? 'is-compact' : ''}`}>
        <input
          className="title-input"
          value={state.title}
          readOnly={readOnly}
          placeholder={readOnly ? 'Untitled' : 'Title'}
          maxLength={200}
          aria-label="Title"
          autoFocus={autoFocusTitle}
          onChange={(e) => ctrl.edit({ title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        {head}
        {progress && <Progress checked={progress.checked} total={progress.total} className="checklist-progress" />}
      </header>

      {state.type === 'list' ? (
        <ChecklistEditor
          content={state.content}
          readOnly={readOnly}
          onChange={(content) => ctrl.edit({ content })}
          onToggle={(index, text, checked) => void ctrl.toggleItem(index, text, checked)}
        />
      ) : (
        <TextEditor
          content={state.content}
          readOnly={readOnly}
          onChange={(content) => ctrl.edit({ content })}
          onToggleTask={(index, text, checked) => void ctrl.toggleItem(index, text, checked)}
        />
      )}
    </article>
  );
}

import type { DraftController, DraftState, SaveStatus } from './draft';
import { Icon, type IconName } from '../../components/Icon';
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
      {label}
    </span>
  );
}

/** Title + content editor, shared by member notes and share-link notes. */
export function NoteEditorBody({
  state,
  ctrl,
  readOnly,
  autoFocusTitle,
}: {
  state: DraftState;
  ctrl: DraftController;
  readOnly: boolean;
  autoFocusTitle?: boolean;
}) {
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

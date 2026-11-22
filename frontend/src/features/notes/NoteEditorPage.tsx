import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { notesApi } from '../../api/endpoints';
import { errorMessage, isApiError } from '../../api/errors';
import { useDeleteNote, useLeaveNote, useNote, useNoteState, useStoreNote } from '../../api/queries';
import type { Note } from '../../api/types';
import { useUser } from '../../auth/AuthProvider';
import { AppShell } from '../../components/AppShell';
import { ConfirmDialog } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { MenuItem, Popover } from '../../components/Popover';
import { useToast } from '../../components/Toast';
import { Button, CenteredSpinner, EmptyState, IconButton } from '../../components/ui';
import { relativeTime } from '../../lib/format';
import { CategoryChip } from '../categories/CategoryChip';
import { CategoryPicker } from '../categories/CategoryPicker';
import { ShareDialog } from '../sharing/ShareDialog';
import type { NoteSaver } from './draft';
import { type NoteLock, PasswordDialog, UnlockScreen, lockingSaver, useNoteLock } from './locking';
import { encryptContent, newNoteKey } from './noteCrypto';
import { NoteEditorBody, SaveStatusBadge } from './NoteEditorBody';
import { useDraft } from './useDraft';

function BackLink() {
  return (
    <Link to="/" className="icon-btn" aria-label="Back to notes" title="Back to notes">
      <Icon name="back" />
    </Link>
  );
}

export function NoteEditorPage() {
  const { id = '' } = useParams();
  const note = useNote(id);

  if (note.isPending) {
    return (
      <AppShell bar={<BackLink />}>
        <CenteredSpinner />
      </AppShell>
    );
  }
  if (note.isError) {
    const missing = isApiError(note.error, 'NOT_FOUND') || isApiError(note.error, 'VALIDATION_ERROR');
    return (
      <AppShell bar={<BackLink />}>
        <EmptyState icon="alert" title={missing ? 'Note not found' : 'Could not load the note'}>
          <p>{missing ? 'It was deleted, or it is no longer shared with you.' : errorMessage(note.error)}</p>
          <Link to="/" className="btn btn-secondary">
            Back to notes
          </Link>
        </EmptyState>
      </AppShell>
    );
  }
  return <MemberNoteEditor key={id} note={note.data} />;
}

/** NOTE-17: a locked note asks for its password first; the editor then works on the plain text. */
function MemberNoteEditor({ note }: { note: Note }) {
  const lock = useNoteLock(note);
  if (lock.state.status === 'locked') {
    return (
      <AppShell bar={<BackLink />}>
        <UnlockScreen title={note.title} reason={lock.state.reason} onUnlock={lock.unlock} />
      </AppShell>
    );
  }
  if (lock.state.status === 'decrypting') {
    return (
      <AppShell bar={<BackLink />}>
        <CenteredSpinner />
      </AppShell>
    );
  }
  return <MemberNoteContent note={note} content={lock.state.content} lock={lock} />;
}

function MemberNoteContent({ note, content, lock }: { note: Note; content: string; lock: NoteLock }) {
  const user = useUser();
  const store = useStoreNote();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const noteState = useNoteState(note.id);
  const remove = useDeleteNote();
  const leave = useLeaveNote();
  const [shareOpen, setShareOpen] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'leave' | 'cancel' | 'unlock' | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [passwordDialog, setPasswordDialog] = useState<'lock' | 'change' | null>(null);

  const [saver] = useState<NoteSaver>(() =>
    lockingSaver(
      {
        save: async (input) => {
          const saved = await notesApi.update(note.id, input);
          store(saved);
          return saved;
        },
        toggle: async (input) => {
          const saved = await notesApi.toggleItem(note.id, input);
          store(saved);
          return saved;
        },
      },
      lock.keyRef,
    ),
  );
  const server = useMemo(
    () => ({ title: note.title, type: note.type, content, version: note.version }),
    [note.title, note.type, content, note.version],
  );
  const { state, ctrl } = useDraft(server, saver);

  /** Save what is pending first: the lock changes apply to the latest content. */
  async function flushed(): Promise<{ version: number; plain: string }> {
    await ctrl.save();
    if (ctrl.getState().status === 'conflict' || ctrl.isDirty()) throw new Error('Save your changes first.');
    return { version: ctrl.version, plain: ctrl.getState().content };
  }

  // NOTE-17: lock with a password, or change it (owner). A new key, so a new salt, each time.
  async function choosePassword(password: string) {
    const { version, plain } = await flushed();
    const key = await newNoteKey(password);
    const saved = await notesApi.update(note.id, {
      version,
      ...(note.locked ? {} : { locked: true }),
      content: await encryptContent(plain, key),
    });
    lock.adopt(key, saved.version, plain);
    store(saved);
    toast(note.locked ? 'Password changed' : 'Note locked');
  }

  async function removePassword() {
    try {
      const { version, plain } = await flushed();
      const saved = await notesApi.update(note.id, { version, locked: false, content: plain });
      store(saved);
      lock.forget();
      toast('Password removed');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setConfirm(null);
    }
  }

  async function lockNow() {
    await ctrl.save();
    lock.forget();
  }

  const readOnly = note.role === 'viewer';
  const isOwner = note.role === 'owner';
  const { focusTitle, created } = (location.state as { focusTitle?: boolean; created?: boolean } | null) ?? {};
  // NOTE-14: a note created just now is deleted on cancel; otherwise it goes back to how it was.
  const deleteOnCancel = Boolean(created) && isOwner;
  const canCancel = !readOnly && (deleteOnCancel || ctrl.hasChanges());

  async function cancelEdits() {
    setCancelling(true);
    try {
      if (deleteOnCancel) {
        ctrl.discard();
        await remove.mutateAsync(note.id);
      } else if (!(await ctrl.revert())) {
        toast('Could not cancel the changes. Try again when the server is reachable.', 'error');
        return;
      }
      toast(deleteOnCancel ? 'Note discarded' : 'Changes cancelled');
      navigate('/', { replace: true });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setCancelling(false);
      setConfirm(null);
    }
  }

  async function confirmAction() {
    try {
      if (confirm === 'delete') await remove.mutateAsync(note.id);
      else if (confirm === 'leave') await leave.mutateAsync(note.id);
      navigate('/', { replace: true });
    } catch (err) {
      toast(errorMessage(err), 'error');
      setConfirm(null);
    }
  }

  return (
    <AppShell
      bar={
        <>
          <BackLink />
          {!readOnly && <SaveStatusBadge status={state.status} />}
          {readOnly && <span className="badge">Read-only</span>}
          <span className="spacer" />
          {canCancel && (
            <Button variant="ghost" icon="x" className="cancel-edits" onClick={() => setConfirm('cancel')}>
              Cancel
            </Button>
          )}
          {note.locked && <IconButton icon="lock" label="Lock now" onClick={() => void lockNow()} />}
          <IconButton
            icon={note.pinned ? 'starFilled' : 'star'}
            label={note.pinned ? 'Remove from favorites' : 'Add to favorites'}
            active={note.pinned}
            onClick={() => void noteState.setPinned(!note.pinned).catch((err) => toast(errorMessage(err), 'error'))}
          />
          <CategoryPicker note={note} />
          <IconButton icon="users" label="Share" active={note.shared} onClick={() => setShareOpen(true)} />
          <Popover
            trigger={({ toggle, open }) => <IconButton icon="more" label="More" onClick={toggle} active={open} />}
          >
            {(close) => (
              <div className="menu">
                {!readOnly && (
                  <MenuItem
                    icon={<Icon name={state.type === 'list' ? 'text' : 'checklist'} />}
                    onClick={() => {
                      close();
                      void ctrl.changeType(state.type === 'list' ? 'text' : 'list');
                    }}
                  >
                    {state.type === 'list' ? 'Convert to text' : 'Convert to checklist'}
                  </MenuItem>
                )}
                {isOwner && !note.locked && (
                  <MenuItem
                    icon={<Icon name="lock" />}
                    onClick={() => {
                      close();
                      setPasswordDialog('lock');
                    }}
                  >
                    Lock with a password
                  </MenuItem>
                )}
                {isOwner && note.locked && (
                  <>
                    <MenuItem
                      icon={<Icon name="lock" />}
                      onClick={() => {
                        close();
                        setPasswordDialog('change');
                      }}
                    >
                      Change the password
                    </MenuItem>
                    <MenuItem
                      icon={<Icon name="unlock" />}
                      onClick={() => {
                        close();
                        setConfirm('unlock');
                      }}
                    >
                      Remove the password
                    </MenuItem>
                  </>
                )}
                {isOwner ? (
                  <MenuItem
                    icon={<Icon name="trash" />}
                    danger
                    onClick={() => {
                      close();
                      setConfirm('delete');
                    }}
                  >
                    Delete note
                  </MenuItem>
                ) : (
                  <MenuItem
                    icon={<Icon name="logout" />}
                    danger
                    onClick={() => {
                      close();
                      setConfirm('leave');
                    }}
                  >
                    Leave note
                  </MenuItem>
                )}
              </div>
            )}
          </Popover>
        </>
      }
    >
      <NoteEditorBody
        state={state}
        ctrl={ctrl}
        readOnly={readOnly}
        autoFocusTitle={focusTitle}
      />

      <footer className="editor-meta">
        {note.categories.length > 0 && (
          <div className="chips">
            {note.categories.map((c) => (
              <CategoryChip key={c.id} name={c.name} color={c.color} small />
            ))}
          </div>
        )}
        <p className="muted small">
          {!isOwner && <>Shared by {note.owner.username} · </>}
          Edited {relativeTime(note.updatedAt)}
          {note.updatedBy ? (note.updatedBy.id === user.id ? '' : ` by ${note.updatedBy.username}`) : ' through a share link'}
        </p>
      </footer>

      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} note={note} />
      <ConfirmDialog
        open={confirm === 'delete'}
        title="Delete this note?"
        message="It will be deleted for everyone it is shared with, and its share links will stop working."
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() => void confirmAction()}
        onClose={() => setConfirm(null)}
      />
      <PasswordDialog
        open={passwordDialog !== null}
        mode={passwordDialog ?? 'lock'}
        onClose={() => setPasswordDialog(null)}
        onSubmit={choosePassword}
      />
      <ConfirmDialog
        open={confirm === 'unlock'}
        title="Remove the password?"
        message="The content will be stored readable on the server again, and everyone with access will read it without a password."
        confirmLabel="Remove the password"
        busy={false}
        onConfirm={() => void removePassword()}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'cancel'}
        title={deleteOnCancel ? 'Discard this new note?' : 'Cancel your changes?'}
        message={
          deleteOnCancel
            ? 'The note will be deleted.'
            : 'The note goes back to how it was when you opened it, including the changes already saved.'
        }
        confirmLabel={deleteOnCancel ? 'Discard' : 'Cancel changes'}
        cancelLabel="Keep editing"
        danger
        busy={cancelling}
        onConfirm={() => void cancelEdits()}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'leave'}
        title="Leave this note?"
        message={`You will lose access to it until ${note.owner.username} shares it with you again.`}
        confirmLabel="Leave"
        danger
        busy={leave.isPending}
        onConfirm={() => void confirmAction()}
        onClose={() => setConfirm(null)}
      />
    </AppShell>
  );
}

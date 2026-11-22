import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { publicApi } from '../../api/endpoints';
import { errorMessage, isApiError } from '../../api/errors';
import type { SharedNote } from '../../api/types';
import { AppShell } from '../../components/AppShell';
import { CenteredSpinner, EmptyState } from '../../components/ui';
import type { NoteSaver } from '../notes/draft';
import { type NoteLock, UnlockScreen, lockingSaver, useNoteLock } from '../notes/locking';
import { NoteEditorBody, SaveStatusBadge } from '../notes/NoteEditorBody';
import { useDraft } from '../notes/useDraft';

/** SHARE-8: a note opened through a share link, without an account. */
export function SharedNotePage() {
  const { token = '' } = useParams();
  const shared = useQuery({ queryKey: ['shared', token], queryFn: () => publicApi.shared(token), retry: false });

  const bar = (
    <Link to="/" className="brand">
      Self-Notes
    </Link>
  );

  if (shared.isPending) {
    return (
      <AppShell bar={bar}>
        <CenteredSpinner />
      </AppShell>
    );
  }
  if (shared.isError) {
    const gone = isApiError(shared.error, 'NOT_FOUND') || isApiError(shared.error, 'VALIDATION_ERROR');
    return (
      <AppShell bar={bar}>
        <EmptyState icon="link" title={gone ? 'This link no longer works' : 'Could not open the note'}>
          <p>{gone ? 'It may have been revoked or have expired. Ask its owner for a new one.' : errorMessage(shared.error)}</p>
        </EmptyState>
      </AppShell>
    );
  }
  return <SharedEditor key={token} token={token} shared={shared.data} />;
}

function SharedBar({ shared, children }: { shared: SharedNote; children?: ReactNode }) {
  return (
    <>
      <Link to="/" className="brand">
        Self-Notes
      </Link>
      <span className="muted small shared-by">Shared by {shared.owner.username}</span>
      <span className="spacer" />
      {children}
    </>
  );
}

/** NOTE-17: a locked note needs the same password through a link. */
function SharedEditor({ token, shared }: { token: string; shared: SharedNote }) {
  const lock = useNoteLock(shared.note);
  if (lock.state.status === 'locked') {
    return (
      <AppShell bar={<SharedBar shared={shared} />}>
        <UnlockScreen title={shared.note.title} reason={lock.state.reason} onUnlock={lock.unlock} />
      </AppShell>
    );
  }
  if (lock.state.status === 'decrypting') {
    return (
      <AppShell bar={<SharedBar shared={shared} />}>
        <CenteredSpinner />
      </AppShell>
    );
  }
  return <SharedContent token={token} shared={shared} content={lock.state.content} lock={lock} />;
}

function SharedContent({
  token,
  shared,
  content,
  lock,
}: {
  token: string;
  shared: SharedNote;
  content: string;
  lock: NoteLock;
}) {
  const [saver] = useState<NoteSaver>(() =>
    lockingSaver(
      {
        save: async (input) => (await publicApi.update(token, input)).note,
        toggle: async (input) => (await publicApi.toggleItem(token, input)).note,
      },
      lock.keyRef,
    ),
  );
  const { note } = shared;
  const server = useMemo(
    () => ({ title: note.title, type: note.type, content, version: note.version }),
    [note.title, note.type, content, note.version],
  );
  const { state, ctrl } = useDraft(server, saver);
  const readOnly = shared.role === 'viewer';

  return (
    <AppShell
      bar={
        <SharedBar shared={shared}>
          {readOnly ? <span className="badge">Read-only</span> : <SaveStatusBadge status={state.status} />}
        </SharedBar>
      }
    >
      <NoteEditorBody state={state} ctrl={ctrl} readOnly={readOnly} />
    </AppShell>
  );
}

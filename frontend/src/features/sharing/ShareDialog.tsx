import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { sharingApi } from '../../api/endpoints';
import { errorMessage, isApiError } from '../../api/errors';
import { keys } from '../../api/queries';
import type { Note, ShareRole } from '../../api/types';
import { Dialog } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { Button, ErrorNote, IconButton, Spinner } from '../../components/ui';
import { relativeTime } from '../../lib/format';
import { usernameInputProps } from '../auth/username';

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', editor: 'Can edit', viewer: 'Read-only' };

const EXPIRY = [
  { label: 'Never expires', days: 0 },
  { label: 'Expires in 1 day', days: 1 },
  { label: 'Expires in 7 days', days: 7 },
  { label: 'Expires in 30 days', days: 30 },
];

/** SHARE-1 … SHARE-9: members by username, and share links. */
export function ShareDialog({ open, onClose, note }: { open: boolean; onClose: () => void; note: Note }) {
  const isOwner = note.role === 'owner';
  const client = useQueryClient();
  const toast = useToast();
  const members = useQuery({ queryKey: keys.members(note.id), queryFn: () => sharingApi.members(note.id), enabled: open });
  const links = useQuery({
    queryKey: keys.links(note.id),
    queryFn: () => sharingApi.links(note.id),
    enabled: open && isOwner,
  });

  const [username, setUsername] = useState('');
  const [role, setRole] = useState<ShareRole>('editor');
  const [linkRole, setLinkRole] = useState<ShareRole>('viewer');
  const [expiryDays, setExpiryDays] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: keys.members(note.id) });
    void client.invalidateQueries({ queryKey: keys.links(note.id) });
    void client.invalidateQueries({ queryKey: keys.note(note.id) });
    void client.invalidateQueries({ queryKey: [...keys.notes, 'list'] });
  };

  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (success) toast(success);
      refresh();
    } catch (err) {
      setError(
        isApiError(err, 'NOT_FOUND') && username
          ? 'No account has this username on this server.'
          : isApiError(err, 'ALREADY_MEMBER')
            ? 'This person already has access.'
            : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    } catch {
      window.prompt('Copy this link', url);
    }
  }

  function addMember(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      await sharingApi.addMember(note.id, username, role);
      setUsername('');
    }, 'Shared');
  }

  function createLink() {
    void run(async () => {
      const expiresAt = expiryDays ? new Date(Date.now() + expiryDays * 86_400_000).toISOString() : undefined;
      const link = await sharingApi.createLink(note.id, linkRole, expiresAt);
      await copy(link.url);
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Share" wide>
      {error && <ErrorNote>{error}</ErrorNote>}
      {note.locked && (
        <p className="share-locked muted small">
          <Icon name="lock" size={16} />
          This note is locked: people you share it with, by name or by link, need its password to read it.
        </p>
      )}

      <section className="share-section">
        <h3>People</h3>
        {isOwner && (
          <form className="share-add" onSubmit={addMember}>
            <input
              required
              placeholder="Username of a Self-Notes user"
              {...usernameInputProps}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              aria-label="Username"
            />
            <select value={role} onChange={(e) => setRole(e.target.value as ShareRole)} aria-label="Access">
              <option value="editor">Can edit</option>
              <option value="viewer">Read-only</option>
            </select>
            <Button type="submit" variant="primary" busy={busy}>
              Share
            </Button>
          </form>
        )}
        {members.isPending ? (
          <Spinner />
        ) : (
          <ul className="share-list">
            {members.data?.map((m) => (
              <li key={m.user.id}>
                <span className="avatar" aria-hidden>
                  {m.user.username.slice(0, 1).toUpperCase()}
                </span>
                <span className="share-who">
                  <strong>{m.user.username}</strong>
                </span>
                {isOwner && m.role !== 'owner' ? (
                  <>
                    <select
                      value={m.role}
                      aria-label={`Access for ${m.user.username}`}
                      onChange={(e) => void run(() => sharingApi.setRole(note.id, m.user.id, e.target.value as ShareRole))}
                    >
                      <option value="editor">Can edit</option>
                      <option value="viewer">Read-only</option>
                    </select>
                    <IconButton
                      icon="x"
                      label={`Remove ${m.user.username}`}
                      onClick={() => void run(() => sharingApi.removeMember(note.id, m.user.id), 'Access removed')}
                    />
                  </>
                ) : (
                  <span className="badge">{ROLE_LABEL[m.role]}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isOwner && (
        <section className="share-section">
          <h3>Links</h3>
          <p className="muted small">Anyone with the link can open the note, without an account.</p>
          <div className="share-add">
            <select value={linkRole} onChange={(e) => setLinkRole(e.target.value as ShareRole)} aria-label="Link access">
              <option value="viewer">Read-only</option>
              <option value="editor">Can edit</option>
            </select>
            <select value={expiryDays} onChange={(e) => setExpiryDays(Number(e.target.value))} aria-label="Expiry">
              {EXPIRY.map((x) => (
                <option key={x.days} value={x.days}>
                  {x.label}
                </option>
              ))}
            </select>
            <Button icon="link" onClick={createLink} busy={busy}>
              Create link
            </Button>
          </div>
          {links.data && links.data.length > 0 && (
            <ul className="share-list">
              {links.data.map((l) => (
                <li key={l.id}>
                  <span className="avatar" aria-hidden>
                    <Icon name="link" size={16} />
                  </span>
                  <span className="share-who">
                    <strong>{ROLE_LABEL[l.role]}</strong>
                    <small>
                      Created {relativeTime(l.createdAt)}
                      {l.expiresAt ? ` · expires ${relativeTime(l.expiresAt)}` : ''}
                      {l.lastUsedAt ? ` · opened ${relativeTime(l.lastUsedAt)}` : ''}
                    </small>
                  </span>
                  <IconButton icon="copy" label="Copy link" onClick={() => void copy(l.url)} />
                  <IconButton
                    icon="trash"
                    label="Revoke link"
                    onClick={() => void run(() => sharingApi.revokeLink(note.id, l.id), 'Link revoked')}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Dialog>
  );
}

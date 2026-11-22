import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import type { NoteSummary } from '../../api/types';
import { Icon } from '../../components/Icon';
import { Progress } from '../../components/Progress';
import { relativeTime } from '../../lib/format';
import { CategoryChip } from '../categories/CategoryChip';

export function NoteCard({ note, showOwner }: { note: NoteSummary; showOwner: boolean }) {
  const accent = note.categories[0]?.color;

  return (
    <Link
      to={`/notes/${note.id}`}
      className={`note-card ${accent ? 'has-accent' : ''}`}
      style={accent ? ({ '--card-accent': accent } as CSSProperties) : undefined}
    >
      <div className="note-card-head">
        <h3 className={note.title ? '' : 'is-untitled'}>{note.title || 'Untitled'}</h3>
        <span className="note-card-icons">
          {note.locked && <Icon name="lock" size={16} label="Locked" />}
          {note.pinned && (
            <span className="is-favorite">
              <Icon name="starFilled" size={16} label="Favorite" />
            </span>
          )}
          {note.shared && <Icon name="users" size={16} label="Shared" />}
        </span>
      </div>

      {note.locked ? (
        <p className="note-card-preview is-locked">
          <Icon name="lock" size={14} />
          Locked with a password
        </p>
      ) : note.preview ? (
        <p className="note-card-preview">{note.preview}</p>
      ) : (
        <p className="note-card-preview is-empty">Empty note</p>
      )}

      {note.items && <Progress checked={note.items.checked} total={note.items.total} />}

      {note.categories.length > 0 && (
        <div className="chips">
          {note.categories.map((c) => (
            <CategoryChip key={c.id} name={c.name} color={c.color} small />
          ))}
        </div>
      )}

      <div className="note-card-meta">
        <Icon name={note.type === 'list' ? 'checklist' : 'text'} size={14} />
        <span>{relativeTime(note.updatedAt)}</span>
        {showOwner && <span>· {note.owner.username}</span>}
        {note.role === 'viewer' && <span className="badge">read-only</span>}
      </div>
    </Link>
  );
}

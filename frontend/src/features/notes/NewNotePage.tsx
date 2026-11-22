import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { errorMessage } from '../../api/errors';
import { useCreateNote } from '../../api/queries';
import { AppShell, Brand } from '../../components/AppShell';
import { CenteredSpinner, EmptyState } from '../../components/ui';

/**
 * /notes/new?type=list|text: creates a note and opens it. Target of the app link
 * selfnotes://notes/new (architecture §6.2), used by the Android widgets.
 */
export function NewNotePage() {
  const [params] = useSearchParams();
  const type = params.get('type') === 'list' ? 'list' : 'text';
  const create = useCreateNote();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // Effects run twice in development (StrictMode): create one note only.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    create.mutateAsync({ type }).then(
      (note) => navigate(`/notes/${note.id}`, { replace: true, state: { focusTitle: true, created: true } }),
      (err: unknown) => setError(errorMessage(err)),
    );
  }, [create, type, navigate]);

  if (!error) return <CenteredSpinner />;
  return (
    <AppShell bar={<Brand />}>
      <EmptyState icon="alert" title="Could not create the note">
        <p>{error}</p>
        <Link to="/" className="btn btn-secondary">
          Back to notes
        </Link>
      </EmptyState>
    </AppShell>
  );
}

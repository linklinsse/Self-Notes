import { type FormEvent, useEffect, useState } from 'react';
import { forgetSession } from '../../api/session';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/ui';
import { platform } from '../../platform';
import { type ServerCheck, checkServer, displayHost, normalizeServerUrl } from './server';

/**
 * AUTH-6: shows the backend URL on the login/register pages and lets the user change it.
 * `onCheck` receives each successful check (the page hides sign-up when the server closed it).
 */
export function ServerField({ onCheck }: { onCheck?: (check: ServerCheck | null) => void }) {
  const [server, setServer] = useState(() => platform.getServerUrl());
  const [status, setStatus] = useState<ServerCheck | null>(null);
  // An APK built without DEFAULT_SERVER_URL starts with no server (AUTH-7): ask for one right away.
  const [editing, setEditing] = useState(() => !server);
  const [input, setInput] = useState(server);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!server) return;
    const controller = new AbortController();
    checkServer(server, controller.signal).then(setStatus, () => {});
    return () => controller.abort();
  }, [server]);

  useEffect(() => {
    onCheck?.(status);
  }, [status, onCheck]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const url = normalizeServerUrl(input);
    if (!url) {
      setError('Enter an address such as notes.example.com');
      return;
    }
    setChecking(true);
    setError(null);
    const result = await checkServer(url);
    setChecking(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    if (url !== server) {
      await forgetSession(); // AUTH-7: switching servers signs out of the previous one
      await platform.setServerUrl(url);
      setServer(url);
    }
    setStatus(result);
    setEditing(false);
  }

  if (editing) {
    return (
      <form className="server-field is-editing" onSubmit={save}>
        <label htmlFor="server-url">Server address</label>
        <div className="server-input-row">
          <input
            id="server-url"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="notes.example.com"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
          />
          <Button type="submit" variant="primary" busy={checking}>
            Check & use
          </Button>
        </div>
        {error && <p className="field-error">{error}</p>}
        <div className="server-actions">
          {platform.defaultServerUrl() && (
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setInput(platform.defaultServerUrl());
                setError(null);
              }}
            >
              Use default
            </button>
          )}
          {server && (
            <button type="button" className="link-btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <div className="server-field">
      <Icon name="server" size={18} />
      <div className="server-info">
        <span className="server-host">{displayHost(server)}</span>
        <span className={`server-status ${status?.ok === false ? 'is-bad' : ''}`}>
          {status === null ? 'Checking…' : status.ok ? `Self-Notes ${status.version}` : 'Unreachable'}
        </span>
      </div>
      <button
        type="button"
        className="link-btn"
        onClick={() => {
          setInput(server);
          setEditing(true);
        }}
      >
        Change
      </button>
    </div>
  );
}

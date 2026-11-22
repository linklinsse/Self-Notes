import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkServer, displayHost, normalizeServerUrl } from './server';

describe('AUTH-6: server URL', () => {
  it('normalizes what users type', () => {
    expect(normalizeServerUrl('notes.example.com')).toBe('https://notes.example.com');
    expect(normalizeServerUrl('  https://notes.example.com/  ')).toBe('https://notes.example.com');
    expect(normalizeServerUrl('http://192.168.1.10:8080')).toBe('http://192.168.1.10:8080');
    expect(normalizeServerUrl('https://example.com/notes/api')).toBe('https://example.com/notes');
  });

  it('rejects things that are not http(s) URLs', () => {
    expect(normalizeServerUrl('')).toBeNull();
    expect(normalizeServerUrl('ftp://example.com')).toBeNull();
    expect(normalizeServerUrl('https://exa mple.com')).toBeNull();
  });

  it('shows a short host', () => {
    expect(displayHost('https://notes.example.com')).toBe('notes.example.com');
    expect(displayHost('http://localhost:8080/notes')).toBe('localhost:8080/notes');
  });
});

describe('AUTH-1 / AUTH-6: checkServer', () => {
  const answer = (body: unknown) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
  afterEach(() => vi.unstubAllGlobals());

  it('reads whether sign-up is open (older servers: open)', async () => {
    answer({ status: 'ok', name: 'Self-Notes', version: '0.1.0', registration: false });
    expect(await checkServer('https://notes.test')).toEqual({ ok: true, version: '0.1.0', registration: false });
    answer({ status: 'ok', name: 'Self-Notes', version: '0.0.9' });
    expect(await checkServer('https://notes.test')).toEqual({ ok: true, version: '0.0.9', registration: true });
  });

  it('rejects other servers', async () => {
    answer({ status: 'ok', name: 'Something else' });
    expect(await checkServer('https://notes.test')).toMatchObject({ ok: false });
  });
});

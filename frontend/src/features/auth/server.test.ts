import { describe, expect, it } from 'vitest';
import { displayHost, normalizeServerUrl } from './server';

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

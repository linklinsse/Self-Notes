import { describe, expect, it } from 'vitest';
import { deepLinkPath } from './deepLinks';

const ID = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';

describe('deepLinkPath (architecture §6.2)', () => {
  it('WIDGET-3: opens a note', () => {
    expect(deepLinkPath(`selfnotes://notes/${ID}`)).toBe(`/notes/${ID}`);
    expect(deepLinkPath(`selfnotes://notes/${ID}/`)).toBe(`/notes/${ID}`);
    expect(deepLinkPath(`SELFNOTES://notes/${ID.toUpperCase()}`)).toBe(`/notes/${ID}`);
  });

  it('creates a note of the requested type, text by default', () => {
    expect(deepLinkPath('selfnotes://notes/new?type=list')).toBe('/notes/new?type=list');
    expect(deepLinkPath('selfnotes://notes/new?type=text')).toBe('/notes/new?type=text');
    expect(deepLinkPath('selfnotes://notes/new')).toBe('/notes/new?type=text');
    expect(deepLinkPath('selfnotes://notes/new?type=<script>')).toBe('/notes/new?type=text');
  });

  it('ignores anything else', () => {
    expect(deepLinkPath('https://notes.example.com/notes/new')).toBeNull();
    expect(deepLinkPath('selfnotes://settings')).toBeNull();
    expect(deepLinkPath('selfnotes://notes/not-an-id')).toBeNull();
    expect(deepLinkPath(`selfnotes://notes/${ID}/../../settings`)).toBeNull();
    expect(deepLinkPath('selfnotes://notes/%2F%2Fevil.example.com')).toBeNull();
    expect(deepLinkPath('')).toBeNull();
  });
});

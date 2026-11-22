import { describe, expect, it } from 'vitest';
import { WrongPasswordError, decryptWithKey, encryptContent, newNoteKey, parseEnvelope, unlockContent } from './noteCrypto';

const FAST = 100_000; // the server's minimum: keeps the tests quick

describe('NOTE-17: note encryption', () => {
  it('round-trips the content and needs the password to read it back', async () => {
    const key = await newNoteKey('correct horse', FAST);
    const content = '# Codes\n\n- [ ] Wifi: hunter2 — ünïcödé ✓';
    const sealed = await encryptContent(content, key);

    expect(sealed).not.toContain('hunter2');
    expect(parseEnvelope(sealed)).toMatchObject({ v: 1, kdf: 'PBKDF2-SHA256', iter: FAST });
    expect(await decryptWithKey(sealed, key)).toBe(content);
    const unlocked = await unlockContent(sealed, 'correct horse');
    expect(unlocked.plain).toBe(content);
    await expect(unlockContent(sealed, 'wrong horse')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('uses a new IV for every save and a new salt for every password', async () => {
    const key = await newNoteKey('pw-pw-pw-pw', FAST);
    const a = parseEnvelope(await encryptContent('same', key))!;
    const b = parseEnvelope(await encryptContent('same', key))!;
    expect(a.iv).not.toBe(b.iv);
    expect(a.salt).toBe(b.salt);
    expect((await newNoteKey('pw-pw-pw-pw', FAST)).salt).not.toBe(key.salt);
  });

  it('detects tampering and a key from another password', async () => {
    const key = await newNoteKey('first password', FAST);
    const sealed = await encryptContent('secret', key);
    const envelope = parseEnvelope(sealed)!;
    const tampered = JSON.stringify({ ...envelope, data: envelope.data.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) });
    await expect(decryptWithKey(tampered, key)).rejects.toBeInstanceOf(WrongPasswordError);
    await expect(decryptWithKey(sealed, await newNoteKey('first password', FAST))).rejects.toBeInstanceOf(
      WrongPasswordError,
    );
  });

  it('encrypts large notes', async () => {
    const key = await newNoteKey('big note', FAST);
    const content = 'x'.repeat(300_000);
    expect(await decryptWithKey(await encryptContent(content, key), key)).toBe(content);
  });
});

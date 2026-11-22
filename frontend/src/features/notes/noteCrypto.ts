/**
 * NOTE-17: client-side encryption of locked notes, with the browser's WebCrypto only.
 * - Key: PBKDF2-SHA256 of the note's password and a random 16-byte salt, 600 000 iterations
 *   (OWASP 2023), giving an AES-256-GCM key. The password never leaves the device.
 * - Each save: a new random 12-byte IV. The GCM tag detects a wrong password or tampering.
 * - Stored as a JSON envelope in the note's content; the server checks its shape only
 *   (backend/src/lib/encrypted-content.ts).
 */
export const KDF_ITERATIONS = 600_000;

export interface Envelope {
  v: 1;
  kdf: 'PBKDF2-SHA256';
  iter: number;
  salt: string;
  iv: string;
  data: string;
}

/** A derived key, kept in memory only while the note is open. */
export interface NoteKey {
  key: CryptoKey;
  salt: string;
  iter: number;
}

export class WrongPasswordError extends Error {
  constructor() {
    super('Wrong password.');
    this.name = 'WrongPasswordError';
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function parseEnvelope(content: string): Envelope | null {
  try {
    const value = JSON.parse(content) as Partial<Envelope>;
    return value.v === 1 && value.kdf === 'PBKDF2-SHA256' && value.salt && value.iv && value.data && value.iter
      ? (value as Envelope)
      : null;
  } catch {
    return null;
  }
}

/** A new key (new random salt) for locking a note or changing its password. */
export async function newNoteKey(password: string, iterations = KDF_ITERATIONS): Promise<NoteKey> {
  return deriveKey(password, toBase64(crypto.getRandomValues(new Uint8Array(16))), iterations);
}

async function deriveKey(password: string, salt: string, iter: number): Promise<NoteKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt), iterations: iter },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { key, salt, iter };
}

export async function encryptContent(plain: string, noteKey: NoteKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, noteKey.key, new TextEncoder().encode(plain));
  const envelope: Envelope = {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iter: noteKey.iter,
    salt: noteKey.salt,
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(data)),
  };
  return JSON.stringify(envelope);
}

/** Decrypt with a key already derived. Throws WrongPasswordError if the key does not fit. */
export async function decryptWithKey(content: string, noteKey: NoteKey): Promise<string> {
  const envelope = parseEnvelope(content);
  if (!envelope) throw new Error('This note is not encrypted in a known format.');
  if (envelope.salt !== noteKey.salt || envelope.iter !== noteKey.iter) throw new WrongPasswordError();
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(envelope.iv) },
      noteKey.key,
      fromBase64(envelope.data),
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new WrongPasswordError();
  }
}

/** Unlock with the password: derives the key from the envelope's salt, then decrypts. */
export async function unlockContent(content: string, password: string): Promise<{ plain: string; key: NoteKey }> {
  const envelope = parseEnvelope(content);
  if (!envelope) throw new Error('This note is not encrypted in a known format.');
  const key = await deriveKey(password, envelope.salt, envelope.iter);
  return { plain: await decryptWithKey(content, key), key };
}

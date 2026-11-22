/**
 * NOTE-17: format of a locked note's content. The client encrypts the Markdown with AES-256-GCM
 * using a key derived from the note's password with PBKDF2-SHA256 (frontend/src/features/notes/
 * noteCrypto.ts). The server never sees the password or the plain text: it only checks that the
 * envelope is well formed, so that a broken client cannot store unreadable data by mistake.
 */
import { z } from 'zod';

const base64 = (min: number, max: number) =>
  z
    .string()
    .regex(/^[A-Za-z0-9+/]+={0,2}$/)
    .refine((s) => {
      const bytes = (s.length * 3) / 4 - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0);
      return bytes >= min && bytes <= max;
    });

export const EnvelopeSchema = z.strictObject({
  v: z.literal(1),
  kdf: z.literal('PBKDF2-SHA256'),
  iter: z.number().int().min(100_000).max(10_000_000),
  salt: base64(16, 64),
  iv: base64(12, 12),
  /** Ciphertext followed by the 16-byte GCM tag. */
  data: base64(16, 2_000_000),
});

export function isEncryptedContent(content: string): boolean {
  try {
    return EnvelopeSchema.safeParse(JSON.parse(content)).success;
  } catch {
    return false;
  }
}

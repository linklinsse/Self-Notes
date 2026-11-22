-- NOTE-17: notes locked with a password. The content of a locked note is encrypted by the
-- client (AES-256-GCM, key from the password with PBKDF2); the server only stores the envelope.
ALTER TABLE "notes" ADD COLUMN "locked" BOOLEAN NOT NULL DEFAULT false;

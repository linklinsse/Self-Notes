import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The application version comes from the repository's VERSION file (single source of truth).
 * Looked up next to the backend package (Docker image: /app/VERSION) then at the repo root.
 */
function readVersion(): string {
  const candidates = [
    new URL('../VERSION', import.meta.url), // dist/ or src/ -> backend/VERSION (Docker)
    new URL('../../VERSION', import.meta.url), // dist/ or src/ -> repository root (dev)
  ];
  for (const url of candidates) {
    try {
      const value = readFileSync(fileURLToPath(url), 'utf8').trim();
      if (value) return value;
    } catch {
      // try the next location
    }
  }
  return '0.0.0-unknown';
}

export const APP_NAME = 'Self-Notes';
export const APP_VERSION = readVersion();

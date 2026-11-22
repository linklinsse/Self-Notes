import argon2 from 'argon2';

// argon2id with library defaults in production; much cheaper parameters in tests.
const options: Parameters<typeof argon2.hash>[1] =
  process.env.NODE_ENV === 'test'
    ? { type: argon2.argon2id, memoryCost: 4096, timeCost: 2, parallelism: 1 }
    : { type: argon2.argon2id };

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, options);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/** Spend the same time as a real check, so login timing does not reveal whether a username exists. */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('self-notes-dummy-password');
  await verifyPassword(await dummyHash, password);
}

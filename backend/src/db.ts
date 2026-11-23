import { type Prisma, PrismaClient } from '@prisma/client';

export type Db = PrismaClient | Prisma.TransactionClient;

/** `databaseUrl` is a SQLite file URL, such as `file:/app/db/prod.db`. */
export function createPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({ datasourceUrl: databaseUrl });
}

/**
 * Write-ahead log: readers never wait for a writer, and a crash cannot corrupt the file. The mode
 * is stored in the database file, next to which SQLite keeps `-wal` and `-shm` files.
 */
export async function enableWal(prisma: PrismaClient): Promise<void> {
  await prisma.$queryRaw`PRAGMA journal_mode = WAL`;
}

/** True when the error is a unique-constraint violation (Prisma P2002, raw unique indexes included). */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
}

import { PrismaClient } from '@prisma/client';

/**
 * A single Prisma client across hot reloads. Next.js dev re-evaluates modules
 * on every change; without this you exhaust the connection pool in a minute.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/** True when the schema has been pushed and at least one sync has run. */
export async function isDatabaseReady(): Promise<boolean> {
  try {
    await prisma.testCase.count();
    return true;
  } catch {
    return false;
  }
}

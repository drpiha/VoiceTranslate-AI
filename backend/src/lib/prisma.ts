/**
 * =============================================================================
 * Prisma Client Singleton
 * =============================================================================
 * Provides a singleton instance of the Prisma client for database access.
 * Ensures connection pooling and proper lifecycle management.
 * =============================================================================
 */

import { PrismaClient } from '@prisma/client';
import { isDevelopment } from '../config/env.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('prisma');

/**
 * Global Prisma client instance.
 * Using globalThis to maintain singleton across module reloads in development.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Create Prisma client with logging configuration.
 */
function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: isDevelopment
      ? [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
        ]
      : [{ emit: 'event', level: 'error' }],
  });
}

/**
 * Singleton Prisma client instance.
 */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Store in global for development hot reloading
if (isDevelopment) {
  globalForPrisma.prisma = prisma;
}

// Set up logging event handlers
prisma.$on('error' as never, (e: { message: string }) => {
  logger.error('Prisma error', { error: e.message });
});

if (isDevelopment) {
  prisma.$on('query' as never, (e: { query: string; duration: number }) => {
    logger.database('query', 'prisma', e.duration, { query: e.query });
  });

  prisma.$on('warn' as never, (e: { message: string }) => {
    logger.warn('Prisma warning', { message: e.message });
  });
}

/**
 * Connect to the database.
 * Call this during application startup.
 */
export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('Database connected');
  } catch (error) {
    logger.error('Failed to connect to database', {}, error as Error);
    throw error;
  }
}

/**
 * Disconnect from the database.
 * Call this during application shutdown.
 */
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  } catch (error) {
    logger.error('Failed to disconnect from database', {}, error as Error);
  }
}

/**
 * Health check for database connection.
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database health check failed', {}, error as Error);
    return false;
  }
}

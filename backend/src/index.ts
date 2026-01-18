/**
 * =============================================================================
 * VoiceTranslate AI Backend - Server Entry Point
 * =============================================================================
 * Main entry point for the application.
 * Handles server startup and graceful shutdown.
 * =============================================================================
 */

import { startServer, gracefulShutdown } from './app.js';
import { disconnectDatabase } from './lib/prisma.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('server');

/**
 * Main function to start the server.
 */
async function main(): Promise<void> {
  logger.info('Starting VoiceTranslate AI Backend...');

  try {
    const app = await startServer();

    // ==========================================================================
    // Graceful Shutdown Handlers
    // ==========================================================================

    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      try {
        // Close the HTTP server
        await gracefulShutdown(app);

        // Disconnect from database
        await disconnectDatabase();

        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown', {}, error as Error);
        process.exit(1);
      }
    };

    // Handle termination signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught exception', {}, error);

      // Attempt graceful shutdown
      shutdown('uncaughtException').catch(() => {
        process.exit(1);
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: unknown) => {
      logger.error('Unhandled rejection', {
        reason: reason instanceof Error ? reason.message : String(reason),
      });

      // Don't exit on unhandled rejection, but log it
      // In production, you might want to track these and alert
    });

    // Log successful startup
    logger.info('Server is ready to accept connections');

  } catch (error) {
    logger.error('Failed to start server', {}, error as Error);
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  console.error('Fatal error during startup:', error);
  process.exit(1);
});

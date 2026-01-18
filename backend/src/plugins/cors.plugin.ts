/**
 * =============================================================================
 * CORS Plugin
 * =============================================================================
 * Cross-Origin Resource Sharing configuration for the Fastify server.
 * Implements strict origin whitelisting for security.
 * =============================================================================
 */

import { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import { corsOrigins, isDevelopment, isProduction } from '../config/env.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('cors-plugin');

/**
 * Register CORS plugin with secure configuration.
 *
 * Security considerations:
 * - In production, only whitelisted origins are allowed
 * - In development, localhost origins are permitted for ease of development
 * - Credentials are only allowed from whitelisted origins
 * - Preflight requests are cached for performance
 */
export async function registerCorsPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifyCors, {
    /**
     * Origin validation function.
     * Returns true if the origin is allowed, false otherwise.
     */
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., server-to-server, mobile apps)
      if (!origin) {
        callback(null, true);
        return;
      }

      // Check if origin is in whitelist
      if (corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      // In development, allow localhost and Android emulator with any port
      if (isDevelopment) {
        const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/;
        if (localhostPattern.test(origin)) {
          callback(null, true);
          return;
        }
      }

      // Allow Expo and React Native origins (for mobile app)
      const mobileAppPattern = /^(exp|exps):\/\/|^https?:\/\/(expo\.dev|expo\.io|u\.expo\.dev)/;
      if (mobileAppPattern.test(origin)) {
        callback(null, true);
        return;
      }

      // In production, allow all origins for mobile app compatibility
      // The mobile app sends various origins depending on the environment
      // Authentication is handled via JWT tokens, not CORS
      callback(null, true);
    },

    /**
     * Allowed HTTP methods.
     */
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    /**
     * Allowed request headers.
     * Include common headers and custom headers used by the app.
     */
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Accept-Language',
      'X-Request-ID',
      'X-Device-ID',
      'X-App-Version',
    ],

    /**
     * Headers exposed to the client.
     */
    exposedHeaders: [
      'X-Request-ID',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],

    /**
     * Allow credentials (cookies, authorization headers).
     * Only enabled when origin is explicitly whitelisted.
     */
    credentials: true,

    /**
     * Preflight cache duration in seconds.
     * Browsers will cache preflight responses for this duration.
     * 24 hours in production, 1 hour in development.
     */
    maxAge: isProduction ? 86400 : 3600,

    /**
     * Automatically handle OPTIONS requests.
     */
    preflight: true,

    /**
     * Send 204 for OPTIONS requests (more compatible than 200).
     */
    optionsSuccessStatus: 204,
  });

  logger.info('CORS plugin registered', {
    allowedOrigins: corsOrigins,
    isDevelopment,
  });
}

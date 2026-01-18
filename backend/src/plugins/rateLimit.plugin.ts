/**
 * =============================================================================
 * Rate Limiting Plugin
 * =============================================================================
 * Implements multiple layers of rate limiting for API protection:
 * - Global rate limit for all requests
 * - Per-user rate limit for authenticated users
 * - Endpoint-specific limits for sensitive operations
 * =============================================================================
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';
import { env, subscriptionLimits, SubscriptionTier } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import { RateLimitExceededError } from '../utils/errors.js';

const logger = createLogger('rate-limit-plugin');

/**
 * In-memory store for rate limiting.
 * In production, use Redis for distributed rate limiting.
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Clean up expired entries periodically.
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean up every minute

/**
 * Custom key generator that includes user ID for authenticated requests.
 */
function generateKey(request: FastifyRequest): string {
  // Get user ID from authenticated request
  const userId = (request as FastifyRequest & { user?: { userId: string } }).user?.userId;

  if (userId) {
    return `user:${userId}`;
  }

  // Fall back to IP address for unauthenticated requests
  const ip = request.ip || request.headers['x-forwarded-for'] || 'unknown';
  return `ip:${ip}`;
}

/**
 * Get rate limit configuration based on user's subscription tier.
 */
export function getRateLimitForUser(subscription: string): { max: number; windowMs: number } {
  const tier = subscription as SubscriptionTier;
  const limits = subscriptionLimits[tier] || subscriptionLimits.free;

  return {
    max: limits.rateLimit,
    windowMs: limits.rateLimitWindow,
  };
}

/**
 * Register global rate limiting plugin.
 */
export async function registerRateLimitPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifyRateLimit, {
    global: true,

    /**
     * Maximum requests per window.
     */
    max: env.RATE_LIMIT_GLOBAL_MAX,

    /**
     * Time window in milliseconds.
     */
    timeWindow: env.RATE_LIMIT_GLOBAL_WINDOW_MS,

    /**
     * Custom key generator.
     */
    keyGenerator: generateKey,

    /**
     * Custom error handler.
     */
    errorResponseBuilder: (request: FastifyRequest, context) => {
      const retryAfter = Math.ceil((context.ttl || 0) / 1000);

      logger.warn('Rate limit exceeded', {
        requestId: request.id,
        ip: request.ip,
        path: request.url,
        retryAfter,
      });

      const error = new RateLimitExceededError(retryAfter);
      return error.toResponse(request.id);
    },

    /**
     * Add rate limit headers to response.
     */
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },

    /**
     * Skip rate limiting for health check endpoints.
     */
    allowList: (request: FastifyRequest) => {
      const skipPaths = ['/health', '/ready', '/metrics'];
      return skipPaths.includes(request.url);
    },

    /**
     * Hook to run when rate limit is reached.
     */
    onExceeded: (request: FastifyRequest) => {
      logger.security('Rate limit exceeded', {
        requestId: request.id,
        ip: request.ip,
        path: request.url,
        userId: (request as FastifyRequest & { user?: { userId: string } }).user?.userId,
      });
    },
  });

  logger.info('Rate limit plugin registered', {
    globalMax: env.RATE_LIMIT_GLOBAL_MAX,
    globalWindowMs: env.RATE_LIMIT_GLOBAL_WINDOW_MS,
  });
}

/**
 * Apply stricter rate limit to a specific route.
 * Use this for sensitive operations like authentication.
 */
export function strictRateLimit(max: number, windowMs: number) {
  return {
    config: {
      rateLimit: {
        max,
        timeWindow: windowMs,
      },
    },
  };
}

/**
 * Middleware to check translation-specific rate limits.
 * This checks against subscription-based limits.
 */
export async function checkTranslationRateLimit(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = (request as FastifyRequest & { user?: { userId: string; subscription: string } }).user;

  if (!user) {
    // Unauthenticated users get the free tier limits
    const key = `translation:ip:${request.ip}`;
    await checkRateLimit(
      key,
      env.RATE_LIMIT_TRANSLATION_FREE_MAX,
      env.RATE_LIMIT_TRANSLATION_FREE_WINDOW_MS,
      request,
      reply
    );
    return;
  }

  const limits = getRateLimitForUser(user.subscription);
  const key = `translation:user:${user.userId}`;

  await checkRateLimit(key, limits.max, limits.windowMs, request, reply);
}

/**
 * Generic rate limit checker using in-memory store.
 */
async function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetTime < now) {
    // Create new entry
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });

    // Add headers
    reply.header('X-RateLimit-Limit', max);
    reply.header('X-RateLimit-Remaining', max - 1);
    reply.header('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000));
    return;
  }

  // Increment count
  entry.count++;
  rateLimitStore.set(key, entry);

  // Calculate remaining
  const remaining = Math.max(0, max - entry.count);
  const resetTimestamp = Math.ceil(entry.resetTime / 1000);

  // Add headers
  reply.header('X-RateLimit-Limit', max);
  reply.header('X-RateLimit-Remaining', remaining);
  reply.header('X-RateLimit-Reset', resetTimestamp);

  // Check if limit exceeded
  if (entry.count > max) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    reply.header('Retry-After', retryAfter);

    logger.warn('Translation rate limit exceeded', {
      requestId: request.id,
      key,
      count: entry.count,
      max,
      retryAfter,
    });

    throw new RateLimitExceededError(retryAfter, 'Translation rate limit exceeded');
  }
}

/**
 * Rate limit configuration for specific endpoints.
 */
export const rateLimitConfigs = {
  /**
   * Authentication endpoints - strict limits to prevent brute force.
   */
  auth: {
    login: { max: 5, windowMs: 60000 },      // 5 attempts per minute
    register: { max: 3, windowMs: 60000 },   // 3 registrations per minute
    refresh: { max: 10, windowMs: 60000 },   // 10 refreshes per minute
    passwordReset: { max: 3, windowMs: 3600000 }, // 3 per hour
  },

  /**
   * Translation endpoints - based on subscription.
   */
  translation: {
    text: { max: 30, windowMs: 60000 },      // 30 text translations per minute
    detect: { max: 60, windowMs: 60000 },    // 60 detections per minute
    websocket: { max: 1, windowMs: 1000 },   // 1 WebSocket connection per second
  },

  /**
   * User endpoints.
   */
  user: {
    profile: { max: 30, windowMs: 60000 },   // 30 requests per minute
    history: { max: 20, windowMs: 60000 },   // 20 history requests per minute
  },
};

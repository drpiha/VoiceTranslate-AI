/**
 * =============================================================================
 * Authentication Plugin
 * =============================================================================
 * JWT-based authentication plugin for Fastify.
 * Handles token verification and user context injection.
 * =============================================================================
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import {
  verifyAccessToken,
  extractBearerToken,
  AccessTokenPayload,
} from '../utils/jwt.js';
import {
  UnauthorizedError,
  InvalidTokenError,
  TokenExpiredError,
} from '../utils/errors.js';

const logger = createLogger('auth-plugin');

/**
 * Extended request interface with user context.
 */
export interface AuthUser {
  userId: string;
  email: string;
  subscription: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

// For backward compatibility, we'll use authUser instead of user
// to avoid conflict with @fastify/jwt's user property

/**
 * Register authentication plugin.
 */
export async function registerAuthPlugin(fastify: FastifyInstance): Promise<void> {
  // Register cookie plugin for secure cookie handling
  await fastify.register(fastifyCookie, {
    secret: env.JWT_ACCESS_SECRET.substring(0, 32), // Cookie signing secret
    parseOptions: {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
    },
  });

  // Register JWT plugin (for token signing/verification utilities)
  await fastify.register(fastifyJwt, {
    secret: env.JWT_ACCESS_SECRET,
    sign: {
      expiresIn: env.JWT_ACCESS_EXPIRY,
    },
  });

  // Decorate fastify with authentication utilities
  fastify.decorate('authenticate', authenticate);
  fastify.decorate('authenticateOptional', authenticateOptional);

  logger.info('Auth plugin registered');
}

/**
 * Authentication middleware - requires valid token.
 * Use this for protected routes.
 */
export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = request.headers.authorization;
    const token = extractBearerToken(authHeader);

    // Also check for token in cookies (for web clients)
    const cookieToken = request.cookies['access_token'];

    const finalToken = token || cookieToken;

    if (!finalToken) {
      throw new UnauthorizedError('No authentication token provided');
    }

    // Verify and decode the token
    let payload: AccessTokenPayload;
    try {
      payload = verifyAccessToken(finalToken);
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw error;
      }
      if (error instanceof InvalidTokenError) {
        throw error;
      }
      throw new InvalidTokenError('Failed to verify token');
    }

    // Attach user context to request
    request.authUser = {
      userId: payload.userId,
      email: payload.email,
      subscription: payload.subscription,
    };

    logger.debug('User authenticated', {
      userId: payload.userId,
      subscription: payload.subscription,
      requestId: request.id,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError ||
        error instanceof InvalidTokenError ||
        error instanceof TokenExpiredError) {
      throw error;
    }

    logger.error('Authentication error', { requestId: request.id }, error as Error);
    throw new UnauthorizedError('Authentication failed');
  }
}

/**
 * Optional authentication middleware.
 * Attaches user context if token is present, but doesn't fail if missing.
 * Use this for routes that have different behavior for authenticated users.
 */
export async function authenticateOptional(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    const token = extractBearerToken(authHeader);
    const cookieToken = request.cookies['access_token'];

    const finalToken = token || cookieToken;

    if (!finalToken) {
      // No token - that's okay for optional auth
      return;
    }

    const payload = verifyAccessToken(finalToken);

    request.authUser = {
      userId: payload.userId,
      email: payload.email,
      subscription: payload.subscription,
    };

    logger.debug('Optional auth: user authenticated', {
      userId: payload.userId,
      requestId: request.id,
    });
  } catch (error) {
    // For optional auth, we just log and continue without user context
    logger.debug('Optional auth: token invalid or expired', {
      requestId: request.id,
    });
  }
}

/**
 * Subscription tier check middleware factory.
 * Returns middleware that verifies user has required subscription tier.
 */
export function requireSubscription(requiredTiers: string[]) {
  return async function checkSubscription(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    // First ensure user is authenticated
    if (!request.authUser) {
      throw new UnauthorizedError('Authentication required');
    }

    const userTier = request.authUser.subscription;

    if (!requiredTiers.includes(userTier)) {
      logger.warn('Subscription check failed', {
        userId: request.authUser.userId,
        userTier,
        requiredTiers,
        requestId: request.id,
      });

      throw new UnauthorizedError(
        `This feature requires one of the following subscriptions: ${requiredTiers.join(', ')}`
      );
    }

    logger.debug('Subscription check passed', {
      userId: request.authUser.userId,
      userTier,
      requestId: request.id,
    });
  };
}

/**
 * Check if user has premium or higher subscription.
 */
export const requirePremium = requireSubscription(['premium', 'enterprise']);

/**
 * Check if user has basic or higher subscription.
 */
export const requireBasic = requireSubscription(['basic', 'premium', 'enterprise']);

/**
 * Extract device information from request headers.
 * Used for session management and security logging.
 */
export function extractDeviceInfo(request: FastifyRequest): {
  deviceId: string | null;
  userAgent: string | null;
  ipAddress: string;
  appVersion: string | null;
} {
  return {
    deviceId: (request.headers['x-device-id'] as string) || null,
    userAgent: request.headers['user-agent'] || null,
    ipAddress: request.ip || request.headers['x-forwarded-for'] as string || 'unknown',
    appVersion: (request.headers['x-app-version'] as string) || null,
  };
}

/**
 * Set authentication cookies for web clients.
 */
export function setAuthCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string,
  accessTokenExpiry: Date,
  refreshTokenExpiry: Date
): void {
  // Access token cookie (shorter lived)
  reply.setCookie('access_token', accessToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    expires: accessTokenExpiry,
  });

  // Refresh token cookie (longer lived, restricted path)
  reply.setCookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth', // Only sent to auth endpoints
    expires: refreshTokenExpiry,
  });
}

/**
 * Clear authentication cookies.
 */
export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie('access_token', { path: '/' });
  reply.clearCookie('refresh_token', { path: '/api/auth' });
}

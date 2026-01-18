/**
 * =============================================================================
 * Google OAuth Service
 * =============================================================================
 * Handles Google OAuth authentication for web and mobile clients.
 * Verifies Google ID tokens and creates/authenticates users.
 * =============================================================================
 */

import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import {
  generateTokenPair,
  generateTokenId,
  TokenPair,
} from '../utils/jwt.js';
import { UnauthorizedError } from '../utils/errors.js';

const logger = createLogger('google-auth-service');

interface GoogleTokenPayload {
  sub: string; // Google user ID
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

interface GoogleAuthResult {
  user: {
    id: string;
    email: string;
    name: string | null;
    subscription: string;
    isNewUser: boolean;
  };
  tokens: TokenPair;
}

export class GoogleAuthService {
  private prisma: PrismaClient;
  private clientIds: string[];

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;

    // Collect all valid client IDs
    this.clientIds = [
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_ANDROID_CLIENT_ID,
      env.GOOGLE_IOS_CLIENT_ID,
    ].filter((id): id is string => !!id);

    if (this.clientIds.length === 0) {
      logger.warn('No Google OAuth client IDs configured');
    } else {
      logger.info('Google OAuth service initialized', {
        clientIdCount: this.clientIds.length,
      });
    }
  }

  /**
   * Verify Google ID token using Google's tokeninfo endpoint
   */
  async verifyIdToken(idToken: string): Promise<GoogleTokenPayload> {
    try {
      // Use Google's tokeninfo endpoint
      const response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
      );

      if (!response.ok) {
        const error = await response.text();
        logger.warn('Google token verification failed', { error });
        throw new UnauthorizedError('Invalid Google token');
      }

      const payload = await response.json() as any;

      // Verify audience (client ID)
      if (this.clientIds.length > 0 && !this.clientIds.includes(payload.aud)) {
        logger.warn('Google token has invalid audience', {
          audience: payload.aud,
          expected: this.clientIds,
        });
        throw new UnauthorizedError('Invalid token audience');
      }

      // Verify email is verified
      if (payload.email_verified !== 'true' && payload.email_verified !== true) {
        logger.warn('Google email not verified', { email: payload.email });
        throw new UnauthorizedError('Email not verified with Google');
      }

      return {
        sub: payload.sub,
        email: payload.email,
        email_verified: true,
        name: payload.name,
        picture: payload.picture,
        given_name: payload.given_name,
        family_name: payload.family_name,
      };
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      logger.error('Google token verification error', { error });
      throw new UnauthorizedError('Failed to verify Google token');
    }
  }

  /**
   * Verify Google access token using Google's userinfo endpoint
   */
  async verifyAccessToken(accessToken: string): Promise<GoogleTokenPayload> {
    try {
      // Use Google's userinfo endpoint to get user data
      const response = await fetch(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.text();
        logger.warn('Google access token verification failed', { error });
        throw new UnauthorizedError('Invalid Google access token');
      }

      const payload = await response.json() as any;

      // Check if email is verified
      if (payload.verified_email === false) {
        logger.warn('Google email not verified', { email: payload.email });
        throw new UnauthorizedError('Email not verified with Google');
      }

      return {
        sub: payload.id,
        email: payload.email,
        email_verified: payload.verified_email !== false,
        name: payload.name,
        picture: payload.picture,
        given_name: payload.given_name,
        family_name: payload.family_name,
      };
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      logger.error('Google access token verification error', { error });
      throw new UnauthorizedError('Failed to verify Google access token');
    }
  }

  /**
   * Authenticate or register user with Google credentials
   */
  async authenticateWithGoogle(
    token: string,
    tokenType: 'id_token' | 'access_token',
    deviceId?: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<GoogleAuthResult> {
    // Verify the token based on type
    const payload = tokenType === 'id_token'
      ? await this.verifyIdToken(token)
      : await this.verifyAccessToken(token);

    logger.info('Google token verified', {
      tokenType,
      email: payload.email,
      sub: payload.sub,
    });

    // Check if user exists with this Google ID
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { googleId: payload.sub },
          { email: payload.email.toLowerCase() },
        ],
      },
    });

    let isNewUser = false;

    if (!user) {
      // Create new user
      user = await this.prisma.user.create({
        data: {
          email: payload.email.toLowerCase(),
          googleId: payload.sub,
          name: payload.name || null,
          profileImage: payload.picture || null,
          isEmailVerified: true, // Google emails are already verified
          subscription: 'free',
          dailyUsage: 0,
          monthlyUsage: 0,
          lastUsageReset: new Date(),
          passwordHash: '', // No password for Google users
        },
      });
      isNewUser = true;
      logger.info('New user registered via Google', {
        userId: user.id,
        email: user.email,
      });
    } else if (!user.googleId) {
      // Link existing account to Google
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: payload.sub,
          isEmailVerified: true,
          profileImage: user.profileImage || payload.picture || null,
        },
      });
      logger.info('Existing account linked to Google', {
        userId: user.id,
        email: user.email,
      });
    }

    // Check if account is active
    if (!user.isActive) {
      logger.warn('Google login attempt for inactive account', { userId: user.id });
      throw new UnauthorizedError('Account is disabled');
    }

    // Generate tokens
    const tokenId = generateTokenId();
    const tokens = generateTokenPair(user.id, user.email, user.subscription, tokenId);

    // Store refresh token
    const { hashRefreshToken } = await import('../utils/jwt.js');
    const tokenHash = hashRefreshToken(tokens.refreshToken);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        deviceId: deviceId || null,
        userAgent: userAgent || null,
        ipAddress: ipAddress || null,
        expiresAt: tokens.refreshTokenExpiresAt,
      },
    });

    logger.info('User authenticated via Google', {
      userId: user.id,
      isNewUser,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscription: user.subscription,
        isNewUser,
      },
      tokens,
    };
  }
}

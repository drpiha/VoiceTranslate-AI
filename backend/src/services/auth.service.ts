import { maskEmail } from '../utils/crypto.js';
/**
 * =============================================================================
 * Authentication Service
 * =============================================================================
 * Handles user authentication, registration, and token management.
 * Implements secure password hashing and JWT token lifecycle.
 * =============================================================================
 */

import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import {
  generateTokenPair,
  generateTokenId,
  verifyRefreshToken,
  hashRefreshToken,
  TokenPair,
} from '../utils/jwt.js';
import {
  InvalidCredentialsError,
  DuplicateEntryError,
  UserNotFoundError,
  InvalidTokenError,
  UnauthorizedError,
} from '../utils/errors.js';

const logger = createLogger('auth-service');

/**
 * User registration input.
 */
export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

/**
 * User login input.
 */
export interface LoginInput {
  email: string;
  password: string;
  deviceId?: string;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Authentication result returned after login/register.
 */
export interface AuthResult {
  user: {
    id: string;
    email: string;
    name: string | null;
    subscription: string;
    createdAt: Date;
  };
  tokens: TokenPair;
}

/**
 * Authentication service class.
 */
export class AuthService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Register a new user.
   *
   * @param input - Registration data
   * @returns Authentication result with user and tokens
   * @throws DuplicateEntryError if email already exists
   */
  async register(input: RegisterInput): Promise<AuthResult> {
    const { email, password, name } = input;

    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      logger.warn('Registration attempt with existing email', { email: maskEmail(email) });
      throw new DuplicateEntryError('Email');
    }

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        name: name || null,
        subscription: 'free',
        dailyUsage: 0,
        monthlyUsage: 0,
        lastUsageReset: new Date(),
      },
    });

    logger.info('User registered', { userId: user.id, email: user.email });

    // Generate tokens
    const tokens = await this.createTokens(user.id, user.email, user.subscription);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscription: user.subscription,
        createdAt: user.createdAt,
      },
      tokens,
    };
  }

  /**
   * Authenticate user with email and password.
   *
   * @param input - Login credentials
   * @returns Authentication result with user and tokens
   * @throws InvalidCredentialsError if credentials are invalid
   */
  async login(input: LoginInput): Promise<AuthResult> {
    const { email, password, deviceId, userAgent, ipAddress } = input;

    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      // Use timing-safe comparison to prevent timing attacks
      await bcrypt.hash(password, env.BCRYPT_ROUNDS);
      logger.warn('Login attempt for non-existent user', { email: maskEmail(email) });
      throw new InvalidCredentialsError();
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      logger.warn('Login attempt with invalid password', { userId: user.id });
      throw new InvalidCredentialsError();
    }

    // Check if account is active
    if (!user.isActive) {
      logger.warn('Login attempt for inactive account', { userId: user.id });
      throw new UnauthorizedError('Account is disabled');
    }

    logger.info('User logged in', {
      userId: user.id,
      deviceId,
      ipAddress,
    });

    // Generate tokens
    const tokens = await this.createTokens(
      user.id,
      user.email,
      user.subscription,
      deviceId,
      userAgent,
      ipAddress
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscription: user.subscription,
        createdAt: user.createdAt,
      },
      tokens,
    };
  }

  /**
   * Refresh access token using a valid refresh token.
   *
   * @param refreshToken - The refresh token
   * @param deviceId - Optional device ID for validation
   * @returns New token pair
   * @throws InvalidTokenError if refresh token is invalid or revoked
   */
  async refresh(refreshToken: string, deviceId?: string): Promise<TokenPair> {
    // Verify refresh token
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (error) {
      logger.warn('Refresh token verification failed');
      throw new InvalidTokenError('Invalid refresh token');
    }

    // Hash the token to look up in database
    const tokenHash = hashRefreshToken(refreshToken);

    // Find the refresh token in database
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!storedToken) {
      logger.warn('Refresh token not found in database', { userId: payload.userId });
      throw new InvalidTokenError('Refresh token not found');
    }

    // Check if token is revoked
    if (storedToken.isRevoked) {
      logger.security('Attempt to use revoked refresh token', {
        userId: payload.userId,
        tokenId: storedToken.id,
      });
      // Revoke all tokens for this user (potential token theft)
      await this.revokeAllUserTokens(payload.userId);
      throw new InvalidTokenError('Refresh token has been revoked');
    }

    // Check if token is expired
    if (storedToken.expiresAt < new Date()) {
      logger.warn('Attempt to use expired refresh token', { userId: payload.userId });
      throw new InvalidTokenError('Refresh token has expired');
    }

    // Validate device ID if provided
    if (deviceId && storedToken.deviceId && storedToken.deviceId !== deviceId) {
      logger.security('Refresh token used from different device', {
        userId: payload.userId,
        expectedDevice: storedToken.deviceId,
        actualDevice: deviceId,
      });
      throw new InvalidTokenError('Device mismatch');
    }

    // Revoke the old refresh token (token rotation)
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { isRevoked: true, revokedAt: new Date() },
    });

    // Generate new token pair
    const tokens = await this.createTokens(
      storedToken.user.id,
      storedToken.user.email,
      storedToken.user.subscription,
      deviceId,
      storedToken.userAgent || undefined,
      storedToken.ipAddress || undefined
    );

    logger.info('Tokens refreshed', { userId: storedToken.user.id });

    return tokens;
  }

  /**
   * Logout user by revoking their refresh token.
   *
   * @param refreshToken - The refresh token to revoke
   * @param userId - The user ID for validation
   */
  async logout(refreshToken: string, userId: string): Promise<void> {
    const tokenHash = hashRefreshToken(refreshToken);

    const result = await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash,
        userId,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });

    if (result.count > 0) {
      logger.info('User logged out', { userId });
    } else {
      logger.debug('Logout called but no token found', { userId });
    }
  }

  /**
   * Logout user from all devices by revoking all refresh tokens.
   *
   * @param userId - The user ID
   */
  async logoutAll(userId: string): Promise<void> {
    await this.revokeAllUserTokens(userId);
    logger.info('User logged out from all devices', { userId });
  }

  /**
   * Create a new token pair and store refresh token in database.
   */
  private async createTokens(
    userId: string,
    email: string,
    subscription: string,
    deviceId?: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<TokenPair> {
    // Generate unique token ID
    const tokenId = generateTokenId();

    // Generate token pair
    const tokens = generateTokenPair(userId, email, subscription, tokenId);

    // Hash refresh token for storage
    const tokenHash = hashRefreshToken(tokens.refreshToken);

    // Store refresh token in database
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        deviceId: deviceId || null,
        userAgent: userAgent || null,
        ipAddress: ipAddress || null,
        expiresAt: tokens.refreshTokenExpiresAt,
      },
    });

    return tokens;
  }

  /**
   * Revoke all refresh tokens for a user.
   * Used when suspicious activity is detected.
   */
  private async revokeAllUserTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });

    logger.security('All refresh tokens revoked for user', { userId });
  }

  /**
   * Verify user password (for sensitive operations).
   *
   * @param userId - The user ID
   * @param password - The password to verify
   * @returns True if password is valid
   */
  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user) {
      throw new UserNotFoundError();
    }

    return bcrypt.compare(password, user.passwordHash);
  }

  /**
   * Change user password.
   *
   * @param userId - The user ID
   * @param currentPassword - Current password for verification
   * @param newPassword - New password
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    // Verify current password
    const isValid = await this.verifyPassword(userId, currentPassword);

    if (!isValid) {
      throw new InvalidCredentialsError('Current password is incorrect');
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);

    // Update password
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Revoke all refresh tokens (force re-login)
    await this.revokeAllUserTokens(userId);

    logger.info('Password changed', { userId });
  }

  /**
   * Clean up expired refresh tokens.
   * Should be run periodically as a cron job.
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    if (result.count > 0) {
      logger.info('Expired refresh tokens cleaned up', { count: result.count });
    }

    return result.count;
  }
}

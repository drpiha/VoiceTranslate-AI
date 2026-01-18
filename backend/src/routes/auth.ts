/**
 * =============================================================================
 * Authentication Routes
 * =============================================================================
 * Handles user registration, login, token refresh, and logout.
 * Implements secure authentication flow with JWT tokens.
 * =============================================================================
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../services/auth.service.js';
import { GoogleAuthService } from '../services/google-auth.service.js';
import { emailService } from '../services/email.service.js';
import { validateBody } from '../middleware/validateRequest.js';
import {
  authenticate,
  extractDeviceInfo,
  setAuthCookies,
  clearAuthCookies,
} from '../middleware/authenticate.js';
import { emailSchema, passwordSchema } from '../middleware/validateRequest.js';
import { createLogger } from '../utils/logger.js';
import { rateLimitConfigs } from '../plugins/rateLimit.plugin.js';
import { prisma } from '../lib/prisma.js';
import crypto from 'crypto';

const logger = createLogger('auth-routes');

// =============================================================================
// Validation Schemas
// =============================================================================

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1).max(100).optional(),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const googleAuthSchema = z.object({
  idToken: z.string().optional(),
  accessToken: z.string().optional(),
}).refine(data => data.idToken || data.accessToken, {
  message: 'Either idToken or accessToken is required',
});

const forgotPasswordSchema = z.object({
  email: emailSchema,
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: passwordSchema,
});

// =============================================================================
// Route Types
// =============================================================================

interface RegisterBody {
  email: string;
  password: string;
  name?: string;
}

interface LoginBody {
  email: string;
  password: string;
}

interface RefreshBody {
  refreshToken: string;
}

interface GoogleAuthBody {
  idToken?: string;
  accessToken?: string;
}

interface ForgotPasswordBody {
  email: string;
}

interface ResetPasswordBody {
  token: string;
  password: string;
}

// =============================================================================
// Routes
// =============================================================================

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const authService = new AuthService(prisma);
  const googleAuthService = new GoogleAuthService(prisma);

  /**
   * POST /api/auth/register
   * Register a new user account.
   */
  fastify.post<{ Body: RegisterBody }>(
    '/register',
    {
      config: {
        rateLimit: rateLimitConfigs.auth.register,
      },
      preHandler: [validateBody(registerSchema)],
    },
    async (request: FastifyRequest<{ Body: RegisterBody }>, reply: FastifyReply) => {
      const { email, password, name } = request.body;

      logger.info('Registration attempt', { email, requestId: request.id });

      const result = await authService.register({ email, password, name });

      // Set cookies for web clients
      setAuthCookies(
        reply,
        result.tokens.accessToken,
        result.tokens.refreshToken,
        result.tokens.accessTokenExpiresAt,
        result.tokens.refreshTokenExpiresAt
      );

      // Send welcome email (async, don't wait)
      emailService.sendWelcomeEmail(result.user.email, result.user.name || undefined)
        .catch(err => logger.error('Failed to send welcome email', { error: err.message }));

      logger.info('Registration successful', {
        userId: result.user.id,
        requestId: request.id,
      });

      return reply.status(201).send({
        success: true,
        data: {
          user: result.user,
          tokens: {
            accessToken: result.tokens.accessToken,
            refreshToken: result.tokens.refreshToken,
            accessTokenExpiresAt: result.tokens.accessTokenExpiresAt.toISOString(),
            refreshTokenExpiresAt: result.tokens.refreshTokenExpiresAt.toISOString(),
          },
        },
      });
    }
  );

  /**
   * POST /api/auth/login
   * Authenticate user with email and password.
   */
  fastify.post<{ Body: LoginBody }>(
    '/login',
    {
      config: {
        rateLimit: rateLimitConfigs.auth.login,
      },
      preHandler: [validateBody(loginSchema)],
    },
    async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
      const { email, password } = request.body;
      const deviceInfo = extractDeviceInfo(request);

      logger.info('Login attempt', { email, requestId: request.id });

      const result = await authService.login({
        email,
        password,
        deviceId: deviceInfo.deviceId || undefined,
        userAgent: deviceInfo.userAgent || undefined,
        ipAddress: deviceInfo.ipAddress,
      });

      // Set cookies for web clients
      setAuthCookies(
        reply,
        result.tokens.accessToken,
        result.tokens.refreshToken,
        result.tokens.accessTokenExpiresAt,
        result.tokens.refreshTokenExpiresAt
      );

      logger.info('Login successful', {
        userId: result.user.id,
        requestId: request.id,
      });

      return reply.send({
        success: true,
        data: {
          user: result.user,
          tokens: {
            accessToken: result.tokens.accessToken,
            refreshToken: result.tokens.refreshToken,
            accessTokenExpiresAt: result.tokens.accessTokenExpiresAt.toISOString(),
            refreshTokenExpiresAt: result.tokens.refreshTokenExpiresAt.toISOString(),
          },
        },
      });
    }
  );

  /**
   * POST /api/auth/refresh
   * Refresh access token using refresh token.
   */
  fastify.post<{ Body: RefreshBody }>(
    '/refresh',
    {
      config: {
        rateLimit: rateLimitConfigs.auth.refresh,
      },
      preHandler: [validateBody(refreshSchema)],
    },
    async (request: FastifyRequest<{ Body: RefreshBody }>, reply: FastifyReply) => {
      // Get refresh token from body or cookie
      let refreshToken = request.body.refreshToken;

      // Fall back to cookie if not in body
      if (!refreshToken && request.cookies['refresh_token']) {
        refreshToken = request.cookies['refresh_token'];
      }

      const deviceInfo = extractDeviceInfo(request);

      logger.debug('Token refresh attempt', { requestId: request.id });

      const tokens = await authService.refresh(
        refreshToken,
        deviceInfo.deviceId || undefined
      );

      // Set new cookies
      setAuthCookies(
        reply,
        tokens.accessToken,
        tokens.refreshToken,
        tokens.accessTokenExpiresAt,
        tokens.refreshTokenExpiresAt
      );

      logger.info('Token refresh successful', { requestId: request.id });

      return reply.send({
        success: true,
        data: {
          tokens: {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
            refreshTokenExpiresAt: tokens.refreshTokenExpiresAt.toISOString(),
          },
        },
      });
    }
  );

  /**
   * POST /api/auth/logout
   * Logout user and invalidate refresh token.
   */
  fastify.post(
    '/logout',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.userId;

      // Get refresh token from body or cookie
      const body = request.body as { refreshToken?: string } | undefined;
      const refreshToken = body?.refreshToken || request.cookies['refresh_token'];

      if (refreshToken) {
        await authService.logout(refreshToken, userId);
      }

      // Clear cookies
      clearAuthCookies(reply);

      logger.info('Logout successful', { userId, requestId: request.id });

      return reply.send({
        success: true,
        message: 'Logged out successfully',
      });
    }
  );

  /**
   * POST /api/auth/logout-all
   * Logout user from all devices.
   */
  fastify.post(
    '/logout-all',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.userId;

      await authService.logoutAll(userId);

      // Clear cookies
      clearAuthCookies(reply);

      logger.info('Logout from all devices successful', {
        userId,
        requestId: request.id,
      });

      return reply.send({
        success: true,
        message: 'Logged out from all devices',
      });
    }
  );

  /**
   * POST /api/auth/change-password
   * Change user password.
   */
  fastify.post<{ Body: { currentPassword: string; newPassword: string } }>(
    '/change-password',
    {
      preHandler: [
        authenticate,
        validateBody(
          z.object({
            currentPassword: z.string().min(1, 'Current password is required'),
            newPassword: passwordSchema,
          })
        ),
      ],
    },
    async (request, reply) => {
      const userId = request.authUser!.userId;
      const { currentPassword, newPassword } = request.body;

      await authService.changePassword(userId, currentPassword, newPassword);

      // Clear cookies (user needs to re-login)
      clearAuthCookies(reply);

      logger.info('Password changed', { userId, requestId: request.id });

      return reply.send({
        success: true,
        message: 'Password changed successfully. Please login again.',
      });
    }
  );

  /**
   * GET /api/auth/me
   * Get current authenticated user info.
   */
  fastify.get(
    '/me',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.authUser!;

      // Get full user data
      const fullUser = await prisma.user.findUnique({
        where: { id: user.userId },
        select: {
          id: true,
          email: true,
          name: true,
          profileImage: true,
          subscription: true,
          isEmailVerified: true,
          createdAt: true,
        },
      });

      return reply.send({
        success: true,
        data: {
          user: fullUser,
        },
      });
    }
  );

  /**
   * POST /api/auth/google
   * Authenticate or register with Google OAuth.
   */
  fastify.post<{ Body: GoogleAuthBody }>(
    '/google',
    {
      config: {
        rateLimit: rateLimitConfigs.auth.login,
      },
      preHandler: [validateBody(googleAuthSchema)],
    },
    async (request: FastifyRequest<{ Body: GoogleAuthBody }>, reply: FastifyReply) => {
      const { idToken, accessToken } = request.body;
      const deviceInfo = extractDeviceInfo(request);

      logger.info('Google auth attempt', {
        requestId: request.id,
        hasIdToken: !!idToken,
        hasAccessToken: !!accessToken,
      });

      // Use idToken if available, otherwise use accessToken
      const token = idToken || accessToken!;
      const tokenType = idToken ? 'id_token' : 'access_token';

      const result = await googleAuthService.authenticateWithGoogle(
        token,
        tokenType,
        deviceInfo.deviceId || undefined,
        deviceInfo.userAgent || undefined,
        deviceInfo.ipAddress
      );

      // Send welcome email for new users
      if (result.user.isNewUser) {
        emailService.sendWelcomeEmail(result.user.email, result.user.name || undefined)
          .catch(err => logger.error('Failed to send welcome email', { error: err.message }));
      }

      // Set cookies for web clients
      setAuthCookies(
        reply,
        result.tokens.accessToken,
        result.tokens.refreshToken,
        result.tokens.accessTokenExpiresAt,
        result.tokens.refreshTokenExpiresAt
      );

      logger.info('Google auth successful', {
        userId: result.user.id,
        isNewUser: result.user.isNewUser,
        requestId: request.id,
      });

      return reply.send({
        success: true,
        data: {
          user: result.user,
          tokens: {
            accessToken: result.tokens.accessToken,
            refreshToken: result.tokens.refreshToken,
            accessTokenExpiresAt: result.tokens.accessTokenExpiresAt.toISOString(),
            refreshTokenExpiresAt: result.tokens.refreshTokenExpiresAt.toISOString(),
          },
          isNewUser: result.user.isNewUser,
        },
      });
    }
  );

  /**
   * POST /api/auth/forgot-password
   * Request password reset email.
   */
  fastify.post<{ Body: ForgotPasswordBody }>(
    '/forgot-password',
    {
      config: {
        rateLimit: rateLimitConfigs.auth.register, // Same rate limit as register
      },
      preHandler: [validateBody(forgotPasswordSchema)],
    },
    async (request: FastifyRequest<{ Body: ForgotPasswordBody }>, reply: FastifyReply) => {
      const { email } = request.body;

      logger.info('Password reset request', { email, requestId: request.id });

      // Find user
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      // Always return success to prevent email enumeration
      if (!user) {
        logger.debug('Password reset requested for non-existent email');
        return reply.send({
          success: true,
          message: 'If an account with that email exists, a password reset link has been sent.',
        });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Save token
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: resetToken,
          passwordResetExpires: resetExpires,
        },
      });

      // Send reset email
      await emailService.sendPasswordResetEmail(user.email, resetToken, user.name || undefined);

      logger.info('Password reset email sent', { userId: user.id, requestId: request.id });

      return reply.send({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
    }
  );

  /**
   * POST /api/auth/reset-password
   * Reset password with token.
   */
  fastify.post<{ Body: ResetPasswordBody }>(
    '/reset-password',
    {
      config: {
        rateLimit: rateLimitConfigs.auth.register,
      },
      preHandler: [validateBody(resetPasswordSchema)],
    },
    async (request: FastifyRequest<{ Body: ResetPasswordBody }>, reply: FastifyReply) => {
      const { token, password } = request.body;

      logger.info('Password reset attempt', { requestId: request.id });

      // Find user with valid token
      const user = await prisma.user.findFirst({
        where: {
          passwordResetToken: token,
          passwordResetExpires: { gt: new Date() },
        },
      });

      if (!user) {
        logger.warn('Invalid or expired reset token');
        return reply.status(400).send({
          success: false,
          error: 'Invalid or expired reset token',
        });
      }

      // Hash new password
      const bcrypt = await import('bcrypt');
      const { env } = await import('../config/env.js');
      const passwordHash = await bcrypt.default.hash(password, env.BCRYPT_ROUNDS);

      // Update password and clear token
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordResetToken: null,
          passwordResetExpires: null,
        },
      });

      // Revoke all refresh tokens
      await prisma.refreshToken.updateMany({
        where: { userId: user.id, isRevoked: false },
        data: { isRevoked: true, revokedAt: new Date() },
      });

      logger.info('Password reset successful', { userId: user.id, requestId: request.id });

      return reply.send({
        success: true,
        message: 'Password has been reset successfully. Please login with your new password.',
      });
    }
  );

  /**
   * POST /api/auth/verify-email
   * Verify email with token.
   */
  fastify.post(
    '/verify-email',
    {
      preHandler: [
        validateBody(z.object({
          token: z.string().min(1, 'Verification token is required'),
        })),
      ],
    },
    async (request: FastifyRequest<{ Body: { token: string } }>, reply: FastifyReply) => {
      const { token } = request.body;

      logger.info('Email verification attempt', { requestId: request.id });

      // Find user with valid token
      const user = await prisma.user.findFirst({
        where: {
          emailVerificationToken: token,
          emailVerificationExpires: { gt: new Date() },
        },
      });

      if (!user) {
        logger.warn('Invalid or expired verification token');
        return reply.status(400).send({
          success: false,
          error: 'Invalid or expired verification token',
        });
      }

      // Verify email
      await prisma.user.update({
        where: { id: user.id },
        data: {
          isEmailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpires: null,
        },
      });

      logger.info('Email verified', { userId: user.id, requestId: request.id });

      return reply.send({
        success: true,
        message: 'Email verified successfully.',
      });
    }
  );

  /**
   * POST /api/auth/resend-verification
   * Resend email verification.
   */
  fastify.post(
    '/resend-verification',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.userId;

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: 'User not found',
        });
      }

      if (user.isEmailVerified) {
        return reply.send({
          success: true,
          message: 'Email is already verified.',
        });
      }

      // Generate verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationToken: verificationToken,
          emailVerificationExpires: verificationExpires,
        },
      });

      // Send verification email
      await emailService.sendVerificationEmail(user.email, verificationToken, user.name || undefined);

      logger.info('Verification email resent', { userId, requestId: request.id });

      return reply.send({
        success: true,
        message: 'Verification email sent.',
      });
    }
  );
}

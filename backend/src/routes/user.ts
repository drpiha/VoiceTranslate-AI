/**
 * =============================================================================
 * User Routes
 * =============================================================================
 * Handles user profile, usage statistics, and account management.
 * =============================================================================
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { UserService } from '../services/user.service.js';
import { TranslateService } from '../services/translate.service.js';
import { validateBody, validateQuery, paginationSchema } from '../middleware/validateRequest.js';
import { authenticate } from '../middleware/authenticate.js';
import { createLogger } from '../utils/logger.js';
import { prisma } from '../lib/prisma.js';

const logger = createLogger('user-routes');

// =============================================================================
// Validation Schemas
// =============================================================================

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

const historyQuerySchema = paginationSchema.extend({
  sourceLang: z.string().optional(),
  targetLang: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

// =============================================================================
// Route Types
// =============================================================================

interface UpdateProfileBody {
  name?: string;
}

interface HistoryQuery {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  sourceLang?: string;
  targetLang?: string;
  startDate?: Date;
  endDate?: Date;
}

// =============================================================================
// Routes
// =============================================================================

export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  const userService = new UserService(prisma);
  const translateService = new TranslateService(prisma);

  /**
   * GET /api/user/profile
   * Get current user's profile.
   */
  fastify.get(
    '/profile',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.userId;

      const profile = await userService.getProfile(userId);

      return reply.send({
        success: true,
        data: { profile },
      });
    }
  );

  /**
   * PATCH /api/user/profile
   * Update current user's profile.
   */
  fastify.patch<{ Body: UpdateProfileBody }>(
    '/profile',
    {
      preHandler: [authenticate, validateBody(updateProfileSchema)],
    },
    async (request: FastifyRequest<{ Body: UpdateProfileBody }>, reply: FastifyReply) => {
      const userId = request.authUser!.userId;
      const { name } = request.body;

      logger.debug('Profile update request', { userId, requestId: request.id });

      const profile = await userService.updateProfile(userId, { name });

      return reply.send({
        success: true,
        data: { profile },
      });
    }
  );

  /**
   * GET /api/user/usage
   * Get current user's usage statistics.
   */
  fastify.get(
    '/usage',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.userId;

      const usage = await userService.getUsage(userId);

      return reply.send({
        success: true,
        data: { usage },
      });
    }
  );

  /**
   * GET /api/user/stats
   * Get current user's statistics summary.
   */
  fastify.get(
    '/stats',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.userId;

      const stats = await userService.getStats(userId);

      return reply.send({
        success: true,
        data: { stats },
      });
    }
  );

  /**
   * GET /api/user/history
   * Get current user's translation history.
   */
  fastify.get<{ Querystring: HistoryQuery }>(
    '/history',
    {
      preHandler: [authenticate, validateQuery(historyQuerySchema)],
    },
    async (request: FastifyRequest<{ Querystring: HistoryQuery }>, reply: FastifyReply) => {
      const userId = request.authUser!.userId;
      const { page, limit, sourceLang, targetLang, startDate, endDate } = request.query;

      const result = await translateService.getHistory({
        userId,
        page,
        limit,
        sourceLang,
        targetLang,
        startDate,
        endDate,
      });

      return reply.send({
        success: true,
        data: {
          translations: result.translations,
          pagination: {
            total: result.total,
            page: result.page,
            limit: result.limit,
            hasMore: result.hasMore,
            totalPages: Math.ceil(result.total / result.limit),
          },
        },
      });
    }
  );

  /**
   * DELETE /api/user/account
   * Delete current user's account.
   * This is a destructive action that cannot be undone.
   */
  fastify.delete(
    '/account',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.userId;

      logger.warn('Account deletion requested', { userId, requestId: request.id });

      await userService.deleteAccount(userId);

      return reply.send({
        success: true,
        message: 'Account deleted successfully',
      });
    }
  );

  /**
   * GET /api/user/export
   * Export user data (GDPR compliance).
   */
  fastify.get(
    '/export',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.userId;

      logger.info('Data export requested', { userId, requestId: request.id });

      // Get user profile
      const profile = await userService.getProfile(userId);

      // Get usage stats
      const usage = await userService.getUsage(userId);

      // Get all translations (up to 10000)
      const history = await translateService.getHistory({
        userId,
        page: 1,
        limit: 10000,
      });

      const exportData = {
        exportDate: new Date().toISOString(),
        profile: {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          subscription: profile.subscription,
          createdAt: profile.createdAt,
        },
        usage: {
          daily: usage.dailyUsage,
          monthly: usage.monthlyUsage,
          lastReset: usage.lastReset,
        },
        translations: history.translations.map((t) => ({
          id: t.id,
          sourceText: t.sourceText,
          targetText: t.targetText,
          sourceLang: t.sourceLang,
          targetLang: t.targetLang,
          isVoice: t.isVoice,
          createdAt: t.createdAt,
        })),
        totalTranslations: history.total,
      };

      // Set headers for file download
      reply.header('Content-Type', 'application/json');
      reply.header('Content-Disposition', `attachment; filename="voicetranslate-export-${userId}.json"`);

      return reply.send(exportData);
    }
  );
}

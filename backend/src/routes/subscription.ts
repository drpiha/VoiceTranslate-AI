/**
 * =============================================================================
 * Subscription Routes
 * =============================================================================
 * Handles subscription plans, status, and receipt verification.
 * =============================================================================
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { SubscriptionService } from '../services/subscription.service.js';
import { validateBody } from '../middleware/validateRequest.js';
import { authenticate } from '../middleware/authenticate.js';
import { createLogger } from '../utils/logger.js';
import { prisma } from '../lib/prisma.js';

const logger = createLogger('subscription-routes');

// =============================================================================
// Validation Schemas
// =============================================================================

const verifyReceiptSchema = z.object({
  platform: z.enum(['apple', 'google']),
  receiptData: z.string().min(1, 'Receipt data is required'),
  productId: z.string().min(1, 'Product ID is required'),
});

// =============================================================================
// Route Types
// =============================================================================

interface VerifyReceiptBody {
  platform: 'apple' | 'google';
  receiptData: string;
  productId: string;
}

// =============================================================================
// Routes
// =============================================================================

export async function subscriptionRoutes(fastify: FastifyInstance): Promise<void> {
  const subscriptionService = new SubscriptionService(prisma);

  /**
   * GET /api/subscription/plans
   * Get available subscription plans.
   */
  fastify.get('/plans', async (_request: FastifyRequest, reply: FastifyReply) => {
    const plans = subscriptionService.getPlans();

    return reply.send({
      success: true,
      data: {
        plans: plans.map((plan) => ({
          id: plan.id,
          name: plan.name,
          tier: plan.tier,
          price: plan.price,
          currency: plan.currency,
          interval: plan.interval,
          features: plan.features,
          limits: {
            dailyMinutes: plan.limits.dailyMinutes < 0 ? 'Unlimited' : plan.limits.dailyMinutes,
            monthlyMinutes: plan.limits.monthlyMinutes < 0 ? 'Unlimited' : plan.limits.monthlyMinutes,
            maxHistoryDays: plan.limits.maxHistoryDays,
          },
        })),
      },
    });
  });

  /**
   * GET /api/subscription/status
   * Get current subscription status for the authenticated user.
   */
  fastify.get(
    '/status',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.userId;

      const status = await subscriptionService.getStatus(userId);

      return reply.send({
        success: true,
        data: {
          subscription: {
            tier: status.tier,
            isActive: status.isActive,
            expiresAt: status.expiresAt?.toISOString() || null,
            autoRenew: status.autoRenew,
            platform: status.platform,
            productId: status.productId,
          },
        },
      });
    }
  );

  /**
   * POST /api/subscription/verify
   * Verify a receipt from app store and update subscription.
   */
  fastify.post<{ Body: VerifyReceiptBody }>(
    '/verify',
    {
      preHandler: [authenticate, validateBody(verifyReceiptSchema)],
    },
    async (request: FastifyRequest<{ Body: VerifyReceiptBody }>, reply: FastifyReply) => {
      const userId = request.authUser!.userId;
      const { platform, receiptData, productId } = request.body;

      logger.info('Receipt verification request', {
        userId,
        platform,
        productId,
        requestId: request.id,
      });

      const result = await subscriptionService.verifyReceipt({
        userId,
        platform,
        receiptData,
        productId,
      });

      if (!result.isValid) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_RECEIPT',
            message: 'Receipt verification failed',
          },
        });
      }

      return reply.send({
        success: true,
        data: {
          tier: result.tier,
          expiresAt: result.expiresAt?.toISOString() || null,
          transactionId: result.transactionId,
          isNewPurchase: result.isNewPurchase,
          message: result.isNewPurchase
            ? 'Subscription activated successfully'
            : 'Subscription renewed successfully',
        },
      });
    }
  );

  /**
   * POST /api/subscription/cancel
   * Cancel the current subscription.
   * Note: This doesn't refund - just prevents renewal.
   */
  fastify.post(
    '/cancel',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.userId;

      logger.warn('Subscription cancellation request', {
        userId,
        requestId: request.id,
      });

      await subscriptionService.cancelSubscription(userId);

      return reply.send({
        success: true,
        message: 'Subscription cancelled. You will retain access until the end of the billing period.',
      });
    }
  );

  /**
   * GET /api/subscription/features
   * Get features comparison for all plans.
   */
  fastify.get('/features', async (_request: FastifyRequest, reply: FastifyReply) => {
    const plans = subscriptionService.getPlans();

    // Group by tier and extract unique features
    const tiers = ['free', 'basic', 'premium', 'enterprise'];
    const features: Record<string, Record<string, boolean | string | number>> = {};

    for (const tier of tiers) {
      const plan = plans.find((p) => p.tier === tier);
      if (plan) {
        features[tier] = {
          price: plan.price === 0 ? 'Free' : `$${plan.price}/${plan.interval}`,
          dailyMinutes: plan.limits.dailyMinutes < 0 ? 'Unlimited' : plan.limits.dailyMinutes,
          monthlyMinutes: plan.limits.monthlyMinutes < 0 ? 'Unlimited' : plan.limits.monthlyMinutes,
          historyDays: plan.limits.maxHistoryDays,
          allLanguages: tier !== 'free',
          priorityProcessing: tier !== 'free',
          offlineMode: tier === 'premium' || tier === 'enterprise',
          customVoices: tier === 'premium' || tier === 'enterprise',
          apiAccess: tier === 'enterprise',
          dedicatedSupport: tier === 'enterprise',
        };
      }
    }

    return reply.send({
      success: true,
      data: { features },
    });
  });

  /**
   * POST /api/subscription/restore
   * Restore purchases from app store.
   */
  fastify.post<{ Body: { platform: 'apple' | 'google'; receiptData: string } }>(
    '/restore',
    {
      preHandler: [
        authenticate,
        validateBody(
          z.object({
            platform: z.enum(['apple', 'google']),
            receiptData: z.string().min(1),
          })
        ),
      ],
    },
    async (request: FastifyRequest<{ Body: { platform: 'apple' | 'google'; receiptData: string } }>, reply: FastifyReply) => {
      const userId = request.authUser!.userId;
      const { platform, receiptData: _receiptData } = request.body;

      logger.info('Restore purchases request', {
        userId,
        platform,
        requestId: request.id,
      });

      // In a real implementation, this would:
      // 1. Send receipt to store for validation
      // 2. Get all purchases for this user
      // 3. Find the latest active subscription
      // 4. Update user's subscription accordingly

      // For now, we'll return a mock response
      return reply.send({
        success: true,
        message: 'Purchases restored. Please wait while we verify your subscriptions.',
        data: {
          restoredCount: 0,
          activeSubscription: null,
        },
      });
    }
  );
}

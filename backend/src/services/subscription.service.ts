/**
 * =============================================================================
 * Subscription Service
 * =============================================================================
 * Business logic for subscription management and receipt verification.
 * Supports both Apple App Store and Google Play Store.
 * =============================================================================
 */

import { PrismaClient } from '@prisma/client';
import { subscriptionLimits, SubscriptionTier, env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import { encrypt } from '../utils/crypto.js';
import { ValidationError, ExternalServiceError, NotFoundError } from '../utils/errors.js';

const logger = createLogger('subscription-service');

/**
 * Subscription plan information.
 */
export interface SubscriptionPlan {
  id: string;
  name: string;
  tier: SubscriptionTier;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
  limits: {
    dailyMinutes: number;
    monthlyMinutes: number;
    maxHistoryDays: number;
  };
}

/**
 * Current subscription status.
 */
export interface SubscriptionStatus {
  tier: string;
  isActive: boolean;
  expiresAt: Date | null;
  autoRenew: boolean;
  platform: 'apple' | 'google' | 'none';
  productId: string | null;
}

/**
 * Receipt verification input.
 */
export interface VerifyReceiptInput {
  userId: string;
  platform: 'apple' | 'google';
  receiptData: string;
  productId: string;
}

/**
 * Receipt verification result.
 */
export interface VerifyReceiptResult {
  isValid: boolean;
  tier: SubscriptionTier;
  expiresAt: Date | null;
  transactionId: string;
  productId: string;
  isNewPurchase: boolean;
}

/**
 * Subscription plans definition.
 */
const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'Free',
    tier: 'free',
    price: 0,
    currency: 'USD',
    interval: 'month',
    features: [
      '10 minutes daily translation',
      '100 minutes monthly translation',
      'Basic language support',
      '7 days history',
    ],
    limits: subscriptionLimits.free,
  },
  {
    id: 'basic_monthly',
    name: 'Basic Monthly',
    tier: 'basic',
    price: 4.99,
    currency: 'USD',
    interval: 'month',
    features: [
      '60 minutes daily translation',
      '1000 minutes monthly translation',
      'All languages supported',
      '30 days history',
      'Priority processing',
    ],
    limits: subscriptionLimits.basic,
  },
  {
    id: 'basic_yearly',
    name: 'Basic Yearly',
    tier: 'basic',
    price: 39.99,
    currency: 'USD',
    interval: 'year',
    features: [
      '60 minutes daily translation',
      '1000 minutes monthly translation',
      'All languages supported',
      '30 days history',
      'Priority processing',
      '2 months free',
    ],
    limits: subscriptionLimits.basic,
  },
  {
    id: 'premium_monthly',
    name: 'Premium Monthly',
    tier: 'premium',
    price: 9.99,
    currency: 'USD',
    interval: 'month',
    features: [
      '300 minutes daily translation',
      '5000 minutes monthly translation',
      'All languages supported',
      '90 days history',
      'Priority processing',
      'Offline mode',
      'Custom voices',
    ],
    limits: subscriptionLimits.premium,
  },
  {
    id: 'premium_yearly',
    name: 'Premium Yearly',
    tier: 'premium',
    price: 79.99,
    currency: 'USD',
    interval: 'year',
    features: [
      '300 minutes daily translation',
      '5000 minutes monthly translation',
      'All languages supported',
      '90 days history',
      'Priority processing',
      'Offline mode',
      'Custom voices',
      '2 months free',
    ],
    limits: subscriptionLimits.premium,
  },
  {
    id: 'enterprise_monthly',
    name: 'Enterprise Monthly',
    tier: 'enterprise',
    price: 29.99,
    currency: 'USD',
    interval: 'month',
    features: [
      'Unlimited daily translation',
      'Unlimited monthly translation',
      'All languages supported',
      '365 days history',
      'Priority processing',
      'Offline mode',
      'Custom voices',
      'API access',
      'Dedicated support',
    ],
    limits: subscriptionLimits.enterprise,
  },
];

/**
 * Product ID to tier mapping.
 */
const PRODUCT_TIER_MAP: Record<string, SubscriptionTier> = {
  'com.voicetranslate.basic.monthly': 'basic',
  'com.voicetranslate.basic.yearly': 'basic',
  'com.voicetranslate.premium.monthly': 'premium',
  'com.voicetranslate.premium.yearly': 'premium',
  'com.voicetranslate.enterprise.monthly': 'enterprise',
};

/**
 * Subscription service class.
 */
export class SubscriptionService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Get available subscription plans.
   */
  getPlans(): SubscriptionPlan[] {
    return SUBSCRIPTION_PLANS;
  }

  /**
   * Get a specific plan by ID.
   */
  getPlan(planId: string): SubscriptionPlan | null {
    return SUBSCRIPTION_PLANS.find((p) => p.id === planId) || null;
  }

  /**
   * Get current subscription status for a user.
   *
   * @param userId - User ID
   * @returns Subscription status
   */
  async getStatus(userId: string): Promise<SubscriptionStatus> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { subscription: true },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    // Find active subscription receipt
    const activeReceipt = await this.prisma.subscriptionReceipt.findFirst({
      where: {
        userId,
        isActive: true,
        expirationDate: { gt: new Date() },
      },
      orderBy: { expirationDate: 'desc' },
    });

    if (!activeReceipt) {
      return {
        tier: user.subscription,
        isActive: user.subscription !== 'free',
        expiresAt: null,
        autoRenew: false,
        platform: 'none',
        productId: null,
      };
    }

    return {
      tier: user.subscription,
      isActive: true,
      expiresAt: activeReceipt.expirationDate,
      autoRenew: true, // Would need to check with store API
      platform: activeReceipt.platform as 'apple' | 'google',
      productId: activeReceipt.productId,
    };
  }

  /**
   * Verify a receipt from app store and update subscription.
   *
   * @param input - Receipt verification input
   * @returns Verification result
   */
  async verifyReceipt(input: VerifyReceiptInput): Promise<VerifyReceiptResult> {
    const { userId, platform, receiptData, productId } = input;

    // Get tier from product ID
    const tier = PRODUCT_TIER_MAP[productId];
    if (!tier) {
      throw new ValidationError(`Unknown product ID: ${productId}`);
    }

    let result: VerifyReceiptResult;

    if (platform === 'apple') {
      result = await this.verifyAppleReceipt(receiptData, productId, tier);
    } else {
      result = await this.verifyGoogleReceipt(receiptData, productId, tier);
    }

    if (!result.isValid) {
      return result;
    }

    // Check if this transaction already exists
    const existingReceipt = await this.prisma.subscriptionReceipt.findUnique({
      where: { transactionId: result.transactionId },
    });

    const isNewPurchase = !existingReceipt;

    if (isNewPurchase) {
      // Store the receipt
      await this.prisma.subscriptionReceipt.create({
        data: {
          userId,
          platform,
          receiptData: encrypt(receiptData), // Encrypt for storage
          transactionId: result.transactionId,
          productId: result.productId,
          purchaseDate: new Date(),
          expirationDate: result.expiresAt,
          isActive: true,
        },
      });

      // Update user subscription
      await this.prisma.user.update({
        where: { id: userId },
        data: { subscription: tier },
      });

      logger.info('Subscription activated', {
        userId,
        tier,
        platform,
        transactionId: result.transactionId,
      });
    } else {
      // Update existing receipt
      await this.prisma.subscriptionReceipt.update({
        where: { transactionId: result.transactionId },
        data: {
          expirationDate: result.expiresAt,
          isActive: true,
        },
      });

      logger.info('Subscription renewed', {
        userId,
        tier,
        platform,
        transactionId: result.transactionId,
      });
    }

    return {
      ...result,
      isNewPurchase,
    };
  }

  /**
   * Verify Apple App Store receipt.
   * This is a mock implementation - real implementation would call Apple's API.
   */
  private async verifyAppleReceipt(
    _receiptData: string,
    productId: string,
    tier: SubscriptionTier
  ): Promise<VerifyReceiptResult> {
    // In production, this would:
    // 1. Send receipt to Apple's verifyReceipt endpoint
    // 2. Validate the response
    // 3. Extract purchase information

    logger.debug('Verifying Apple receipt (mock)', { productId });

    // Simulate API latency
    await this.delay(100 + Math.random() * 100);

    // Check if we have real API credentials
    if (!env.APPLE_SHARED_SECRET || env.USE_MOCK_AI_SERVICES) {
      // Mock verification
      logger.warn('Using mock Apple receipt verification');

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

      return {
        isValid: true,
        tier,
        expiresAt,
        transactionId: `apple_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        productId,
        isNewPurchase: true,
      };
    }

    // Real implementation would go here
    throw new ExternalServiceError('Apple', 'Receipt verification not implemented');
  }

  /**
   * Verify Google Play receipt.
   * This is a mock implementation - real implementation would call Google's API.
   */
  private async verifyGoogleReceipt(
    _receiptData: string,
    productId: string,
    tier: SubscriptionTier
  ): Promise<VerifyReceiptResult> {
    // In production, this would:
    // 1. Use Google Play Developer API
    // 2. Validate the purchase token
    // 3. Extract subscription information

    logger.debug('Verifying Google receipt (mock)', { productId });

    // Simulate API latency
    await this.delay(100 + Math.random() * 100);

    // Check if we have real API credentials
    if (!env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY || env.USE_MOCK_AI_SERVICES) {
      // Mock verification
      logger.warn('Using mock Google receipt verification');

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

      return {
        isValid: true,
        tier,
        expiresAt,
        transactionId: `google_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        productId,
        isNewPurchase: true,
      };
    }

    // Real implementation would go here
    throw new ExternalServiceError('Google', 'Receipt verification not implemented');
  }

  /**
   * Cancel a subscription.
   *
   * @param userId - User ID
   */
  async cancelSubscription(userId: string): Promise<void> {
    // Mark all active receipts as inactive
    await this.prisma.subscriptionReceipt.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    // Downgrade to free tier
    await this.prisma.user.update({
      where: { id: userId },
      data: { subscription: 'free' },
    });

    logger.info('Subscription cancelled', { userId });
  }

  /**
   * Check and expire old subscriptions.
   * Should be run as a scheduled job.
   */
  async expireSubscriptions(): Promise<number> {
    const now = new Date();

    // Find expired subscriptions
    const expiredReceipts = await this.prisma.subscriptionReceipt.findMany({
      where: {
        isActive: true,
        expirationDate: { lt: now },
      },
      select: { id: true, userId: true },
    });

    if (expiredReceipts.length === 0) {
      return 0;
    }

    // Mark receipts as inactive
    await this.prisma.subscriptionReceipt.updateMany({
      where: {
        id: { in: expiredReceipts.map((r) => r.id) },
      },
      data: { isActive: false },
    });

    // Downgrade users to free tier
    const userIds = [...new Set(expiredReceipts.map((r) => r.userId))];

    for (const userId of userIds) {
      // Check if user has any other active subscriptions
      const hasActive = await this.prisma.subscriptionReceipt.findFirst({
        where: { userId, isActive: true },
      });

      if (!hasActive) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { subscription: 'free' },
        });
      }
    }

    logger.info('Expired subscriptions processed', { count: expiredReceipts.length });

    return expiredReceipts.length;
  }

  /**
   * Utility: delay for specified milliseconds.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

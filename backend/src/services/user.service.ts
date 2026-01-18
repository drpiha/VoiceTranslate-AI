/**
 * =============================================================================
 * User Service
 * =============================================================================
 * Business logic for user profile and usage management.
 * =============================================================================
 */

import { PrismaClient } from '@prisma/client';
import { subscriptionLimits, SubscriptionTier } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import { UserNotFoundError, ValidationError } from '../utils/errors.js';

const logger = createLogger('user-service');

/**
 * User profile data.
 */
export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  subscription: string;
  isEmailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User usage statistics.
 */
export interface UserUsage {
  dailyUsage: number;
  dailyLimit: number;
  dailyRemaining: number;
  monthlyUsage: number;
  monthlyLimit: number;
  monthlyRemaining: number;
  lastReset: Date;
  subscription: string;
}

/**
 * Profile update input.
 */
export interface UpdateProfileInput {
  name?: string;
}

/**
 * User statistics summary.
 */
export interface UserStats {
  totalTranslations: number;
  translationsThisMonth: number;
  translationsToday: number;
  favoriteLanguages: Array<{ code: string; count: number }>;
  averageConfidence: number;
}

/**
 * User service class.
 */
export class UserService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Get user profile by ID.
   *
   * @param userId - User ID
   * @returns User profile
   */
  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        subscription: true,
        isEmailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new UserNotFoundError();
    }

    return user;
  }

  /**
   * Update user profile.
   *
   * @param userId - User ID
   * @param input - Profile update data
   * @returns Updated profile
   */
  async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserProfile> {
    // Validate name if provided
    if (input.name !== undefined) {
      if (input.name.length > 100) {
        throw new ValidationError('Name cannot exceed 100 characters');
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: input.name,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        name: true,
        subscription: true,
        isEmailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logger.info('Profile updated', { userId });

    return user;
  }

  /**
   * Get user usage statistics.
   *
   * @param userId - User ID
   * @returns Usage statistics
   */
  async getUsage(userId: string): Promise<UserUsage> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        dailyUsage: true,
        monthlyUsage: true,
        lastUsageReset: true,
        subscription: true,
      },
    });

    if (!user) {
      throw new UserNotFoundError();
    }

    // Get subscription limits
    const tier = user.subscription as SubscriptionTier;
    const limits = subscriptionLimits[tier] || subscriptionLimits.free;

    // Check if usage needs to be reset
    const now = new Date();
    const lastReset = new Date(user.lastUsageReset);
    const isNewDay = now.toDateString() !== lastReset.toDateString();
    const isNewMonth = now.getMonth() !== lastReset.getMonth();

    let dailyUsage = user.dailyUsage;
    let monthlyUsage = user.monthlyUsage;

    if (isNewDay) {
      dailyUsage = 0;
      if (isNewMonth) {
        monthlyUsage = 0;
      }
    }

    return {
      dailyUsage,
      dailyLimit: limits.dailyMinutes,
      dailyRemaining: limits.dailyMinutes < 0 ? -1 : Math.max(0, limits.dailyMinutes - dailyUsage),
      monthlyUsage,
      monthlyLimit: limits.monthlyMinutes,
      monthlyRemaining: limits.monthlyMinutes < 0 ? -1 : Math.max(0, limits.monthlyMinutes - monthlyUsage),
      lastReset: user.lastUsageReset,
      subscription: user.subscription,
    };
  }

  /**
   * Get user statistics summary.
   *
   * @param userId - User ID
   * @returns Statistics summary
   */
  async getStats(userId: string): Promise<UserStats> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get total translations
    const totalTranslations = await this.prisma.translation.count({
      where: { userId },
    });

    // Get translations this month
    const translationsThisMonth = await this.prisma.translation.count({
      where: {
        userId,
        createdAt: { gte: startOfMonth },
      },
    });

    // Get translations today
    const translationsToday = await this.prisma.translation.count({
      where: {
        userId,
        createdAt: { gte: startOfDay },
      },
    });

    // Get favorite target languages
    const languageStats = await this.prisma.translation.groupBy({
      by: ['targetLang'],
      where: { userId },
      _count: { targetLang: true },
      orderBy: { _count: { targetLang: 'desc' } },
      take: 5,
    });

    const favoriteLanguages = languageStats.map((stat) => ({
      code: stat.targetLang,
      count: stat._count.targetLang,
    }));

    // Get average confidence
    const confidenceStats = await this.prisma.translation.aggregate({
      where: { userId, confidence: { not: null } },
      _avg: { confidence: true },
    });

    return {
      totalTranslations,
      translationsThisMonth,
      translationsToday,
      favoriteLanguages,
      averageConfidence: confidenceStats._avg.confidence || 0,
    };
  }

  /**
   * Delete user account and all associated data.
   *
   * @param userId - User ID
   */
  async deleteAccount(userId: string): Promise<void> {
    // Delete in order to respect foreign key constraints
    await this.prisma.$transaction(async (tx) => {
      // Delete translations
      await tx.translation.deleteMany({ where: { userId } });

      // Delete refresh tokens
      await tx.refreshToken.deleteMany({ where: { userId } });

      // Delete subscription receipts
      await tx.subscriptionReceipt.deleteMany({ where: { userId } });

      // Delete user
      await tx.user.delete({ where: { id: userId } });
    });

    logger.info('User account deleted', { userId });
  }

  /**
   * Reset daily usage for all users.
   * Should be run as a scheduled job at midnight UTC.
   */
  async resetDailyUsage(): Promise<number> {
    const result = await this.prisma.user.updateMany({
      data: {
        dailyUsage: 0,
        lastUsageReset: new Date(),
      },
    });

    logger.info('Daily usage reset completed', { count: result.count });

    return result.count;
  }

  /**
   * Reset monthly usage for all users.
   * Should be run as a scheduled job on the first day of each month.
   */
  async resetMonthlyUsage(): Promise<number> {
    const result = await this.prisma.user.updateMany({
      data: {
        monthlyUsage: 0,
        lastUsageReset: new Date(),
      },
    });

    logger.info('Monthly usage reset completed', { count: result.count });

    return result.count;
  }
}

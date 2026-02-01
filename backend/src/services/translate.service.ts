/**
 * =============================================================================
 * Translation Service
 * =============================================================================
 * Business logic for translation operations.
 * Coordinates between AI services and database for translation history.
 * =============================================================================
 */

import { PrismaClient } from '@prisma/client';
import { aiTranslationService, SupportedLanguage } from './ai/translation.service.js';
import { subscriptionLimits, SubscriptionTier } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import {
  UsageLimitExceededError,
  ValidationError,
} from '../utils/errors.js';

const logger = createLogger('translate-service');

/**
 * Text translation input.
 */
export interface TranslateTextInput {
  userId: string;
  subscription: string;
  text: string;
  sourceLang: string;
  targetLang: string;
  saveHistory?: boolean;
  provider?: 'backend' | 'deepl';
}

/**
 * Text translation result.
 */
export interface TranslateTextResult {
  translatedText: string;
  detectedSourceLang: string;
  targetLang: string;
  confidence: number;
  characterCount: number;
  savedToHistory: boolean;
  translationId?: string;
}

/**
 * Language detection input.
 */
export interface DetectLanguageInput {
  text: string;
}

/**
 * Language detection result.
 */
export interface DetectLanguageResult {
  language: string;
  confidence: number;
  languageName: string;
}

/**
 * Translation history query.
 */
export interface HistoryQuery {
  userId: string;
  page: number;
  limit: number;
  sourceLang?: string;
  targetLang?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Translation history entry.
 */
export interface HistoryEntry {
  id: string;
  sourceText: string;
  targetText: string;
  sourceLang: string;
  targetLang: string;
  isVoice: boolean;
  createdAt: Date;
}

/**
 * Translation history result.
 */
export interface HistoryResult {
  translations: HistoryEntry[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * Translation service class.
 */
export class TranslateService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Translate text from source to target language.
   *
   * @param input - Translation input
   * @returns Translation result
   */
  async translateText(input: TranslateTextInput): Promise<TranslateTextResult> {
    const { userId, subscription, text, sourceLang, targetLang, saveHistory = true, provider } = input;

    // Validate input
    if (!text || text.trim().length === 0) {
      throw new ValidationError('Text is required');
    }

    if (text.length > 5000) {
      throw new ValidationError('Text exceeds maximum length of 5000 characters');
    }

    // Check usage limits
    await this.checkUsageLimits(userId, subscription, text.length);

    // Perform translation (pass provider preference)
    const result = await aiTranslationService.translate({
      text,
      sourceLang,
      targetLang,
      provider,
    });

    // Update usage
    await this.updateUsage(userId, text.length);

    // Save to history if requested
    let translationId: string | undefined;
    if (saveHistory) {
      const saved = await this.saveTranslation({
        userId,
        sourceText: text,
        targetText: result.translatedText,
        sourceLang: result.detectedSourceLang,
        targetLang: result.targetLang,
        isVoice: false,
        confidence: result.confidence,
      });
      translationId = saved.id;
    }

    logger.info('Text translation completed', {
      userId,
      sourceLang: result.detectedSourceLang,
      targetLang: result.targetLang,
      characterCount: text.length,
    });

    return {
      translatedText: result.translatedText,
      detectedSourceLang: result.detectedSourceLang,
      targetLang: result.targetLang,
      confidence: result.confidence,
      characterCount: result.characterCount,
      savedToHistory: saveHistory,
      translationId,
    };
  }

  /**
   * Detect the language of given text.
   *
   * @param input - Detection input
   * @returns Detection result
   */
  async detectLanguage(input: DetectLanguageInput): Promise<DetectLanguageResult> {
    const { text } = input;

    if (!text || text.trim().length === 0) {
      throw new ValidationError('Text is required');
    }

    if (text.length > 1000) {
      throw new ValidationError('Text for detection should not exceed 1000 characters');
    }

    const result = await aiTranslationService.detectLanguage({ text });

    // Get language name
    const languages = aiTranslationService.getSupportedLanguages();
    const langInfo = languages.find((l) => l.code === result.language);

    return {
      language: result.language,
      confidence: result.confidence,
      languageName: langInfo?.name || result.language,
    };
  }

  /**
   * Get list of supported languages.
   */
  getSupportedLanguages(): SupportedLanguage[] {
    return aiTranslationService.getSupportedLanguages();
  }

  /**
   * Get translation history for a user.
   *
   * @param query - History query parameters
   * @returns Paginated history result
   */
  async getHistory(query: HistoryQuery): Promise<HistoryResult> {
    const { userId, page, limit, sourceLang, targetLang, startDate, endDate } = query;

    // Build where clause
    const where: Record<string, unknown> = { userId };

    if (sourceLang) {
      where.sourceLang = sourceLang;
    }

    if (targetLang) {
      where.targetLang = targetLang;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        (where.createdAt as Record<string, Date>).gte = startDate;
      }
      if (endDate) {
        (where.createdAt as Record<string, Date>).lte = endDate;
      }
    }

    // Get total count
    const total = await this.prisma.translation.count({ where });

    // Get translations
    const translations = await this.prisma.translation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      translations: translations.map((t) => ({
        id: t.id,
        sourceText: t.sourceText,
        targetText: t.targetText,
        sourceLang: t.sourceLang,
        targetLang: t.targetLang,
        isVoice: t.isVoice,
        createdAt: t.createdAt,
      })),
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  }

  /**
   * Delete a translation from history.
   *
   * @param translationId - Translation ID
   * @param userId - User ID for ownership verification
   */
  async deleteTranslation(translationId: string, userId: string): Promise<void> {
    const result = await this.prisma.translation.deleteMany({
      where: {
        id: translationId,
        userId,
      },
    });

    if (result.count === 0) {
      throw new ValidationError('Translation not found or not owned by user');
    }

    logger.info('Translation deleted', { translationId, userId });
  }

  /**
   * Clear all translation history for a user.
   *
   * @param userId - User ID
   */
  async clearHistory(userId: string): Promise<number> {
    const result = await this.prisma.translation.deleteMany({
      where: { userId },
    });

    logger.info('Translation history cleared', { userId, count: result.count });

    return result.count;
  }

  /**
   * Check if user has exceeded usage limits.
   */
  private async checkUsageLimits(
    userId: string,
    subscription: string,
    characterCount: number
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        dailyUsage: true,
        monthlyUsage: true,
        lastUsageReset: true,
      },
    });

    if (!user) {
      return; // User check will happen in auth middleware
    }

    const tier = subscription as SubscriptionTier;
    const limits = subscriptionLimits[tier] || subscriptionLimits.free;

    // Reset daily usage if needed
    const now = new Date();
    const lastReset = new Date(user.lastUsageReset);
    const isNewDay = now.toDateString() !== lastReset.toDateString();

    let currentDailyUsage = user.dailyUsage;
    let currentMonthlyUsage = user.monthlyUsage;

    if (isNewDay) {
      currentDailyUsage = 0;

      // Reset monthly usage if it's a new month
      if (now.getMonth() !== lastReset.getMonth()) {
        currentMonthlyUsage = 0;
      }
    }

    // Convert characters to approximate minutes (assuming 150 words/min, 5 chars/word)
    const estimatedMinutes = Math.ceil(characterCount / (150 * 5));

    // Check daily limit
    if (limits.dailyMinutes > 0 && currentDailyUsage + estimatedMinutes > limits.dailyMinutes) {
      throw new UsageLimitExceededError('daily', limits.dailyMinutes);
    }

    // Check monthly limit
    if (limits.monthlyMinutes > 0 && currentMonthlyUsage + estimatedMinutes > limits.monthlyMinutes) {
      throw new UsageLimitExceededError('monthly', limits.monthlyMinutes);
    }
  }

  /**
   * Update user usage statistics.
   */
  private async updateUsage(userId: string, characterCount: number): Promise<void> {
    const estimatedMinutes = Math.max(1, Math.ceil(characterCount / (150 * 5)));

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { lastUsageReset: true },
    });

    if (!user) {
      return;
    }

    const now = new Date();
    const lastReset = new Date(user.lastUsageReset);
    const isNewDay = now.toDateString() !== lastReset.toDateString();

    if (isNewDay) {
      // Reset and set new usage
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          dailyUsage: estimatedMinutes,
          monthlyUsage: now.getMonth() !== lastReset.getMonth()
            ? estimatedMinutes
            : { increment: estimatedMinutes },
          lastUsageReset: now,
        },
      });
    } else {
      // Increment usage
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          dailyUsage: { increment: estimatedMinutes },
          monthlyUsage: { increment: estimatedMinutes },
        },
      });
    }
  }

  /**
   * Save translation to history.
   */
  private async saveTranslation(data: {
    userId: string;
    sourceText: string;
    targetText: string;
    sourceLang: string;
    targetLang: string;
    isVoice: boolean;
    confidence?: number;
    durationMs?: number;
  }) {
    return this.prisma.translation.create({
      data: {
        userId: data.userId,
        sourceText: data.sourceText,
        targetText: data.targetText,
        sourceLang: data.sourceLang,
        targetLang: data.targetLang,
        isVoice: data.isVoice,
        confidence: data.confidence,
        durationMs: data.durationMs,
      },
    });
  }
}

/**
 * =============================================================================
 * Translation Routes
 * =============================================================================
 * Handles text translation, language detection, and translation history.
 * =============================================================================
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { TranslateService } from '../services/translate.service.js';
import { sttService } from '../services/ai/stt.service.js';
import { validateBody, validateQuery, languageCodeSchema, paginationSchema } from '../middleware/validateRequest.js';
import { authenticate, authenticateOptional } from '../middleware/authenticate.js';
import { checkTranslationRateLimit } from '../plugins/rateLimit.plugin.js';
import { createLogger } from '../utils/logger.js';
import { prisma } from '../lib/prisma.js';

const logger = createLogger('translate-routes');

// =============================================================================
// Validation Schemas
// =============================================================================

const translateTextSchema = z.object({
  text: z.string().min(1, 'Text is required').max(5000, 'Text exceeds 5000 characters'),
  sourceLang: z.string().default('auto'),
  targetLang: languageCodeSchema,
  saveHistory: z.boolean().default(true),
  provider: z.enum(['backend', 'deepl']).optional(),
});

const detectLanguageSchema = z.object({
  text: z.string().min(1, 'Text is required').max(1000, 'Text exceeds 1000 characters'),
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

interface TranslateTextBody {
  text: string;
  sourceLang: string;
  targetLang: string;
  saveHistory: boolean;
  provider?: 'backend' | 'deepl';
}

interface DetectLanguageBody {
  text: string;
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

export async function translateRoutes(fastify: FastifyInstance): Promise<void> {
  const translateService = new TranslateService(prisma);

  /**
   * POST /api/translate/text
   * Translate text from source to target language.
   * Supports both authenticated and guest users.
   */
  fastify.post<{ Body: TranslateTextBody }>(
    '/text',
    {
      preHandler: [
        authenticateOptional,
        checkTranslationRateLimit,
        validateBody(translateTextSchema),
      ],
    },
    async (request: FastifyRequest<{ Body: TranslateTextBody }>, reply: FastifyReply) => {
      const { text, sourceLang, targetLang, saveHistory, provider } = request.body;
      const user = request.authUser;

      // Guest users: use a default guest ID and free subscription
      const userId = user?.userId || 'guest-' + request.ip;
      const subscription = user?.subscription || 'free';
      const shouldSaveHistory = user ? saveHistory : false; // Guests don't save history

      logger.debug('Translation request', {
        userId,
        isGuest: !user,
        sourceLang,
        targetLang,
        textLength: text.length,
        requestId: request.id,
      });

      const result = await translateService.translateText({
        userId,
        subscription,
        text,
        sourceLang,
        targetLang,
        saveHistory: shouldSaveHistory,
        provider,
      });

      return reply.send({
        success: true,
        data: {
          translatedText: result.translatedText,
          detectedSourceLang: result.detectedSourceLang,
          targetLang: result.targetLang,
          confidence: result.confidence,
          characterCount: result.characterCount,
          savedToHistory: result.savedToHistory,
          translationId: result.translationId,
        },
      });
    }
  );

  /**
   * POST /api/translate/detect
   * Detect the language of given text.
   */
  fastify.post<{ Body: DetectLanguageBody }>(
    '/detect',
    {
      preHandler: [authenticateOptional, validateBody(detectLanguageSchema)],
    },
    async (request: FastifyRequest<{ Body: DetectLanguageBody }>, reply: FastifyReply) => {
      const { text } = request.body;

      logger.debug('Language detection request', {
        textLength: text.length,
        requestId: request.id,
      });

      const result = await translateService.detectLanguage({ text });

      return reply.send({
        success: true,
        data: {
          language: result.language,
          languageName: result.languageName,
          confidence: result.confidence,
        },
      });
    }
  );

  /**
   * POST /api/translate/stt
   * Speech-to-text transcription.
   * Accepts JSON body with base64-encoded audio data.
   */
  fastify.post(
    '/stt',
    {
      preHandler: [authenticateOptional, checkTranslationRateLimit],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as {
          audio: string;
          encoding?: string;
          language?: string;
          mimeType?: string;
        };

        if (!body || !body.audio) {
          return reply.code(400).send({
            success: false,
            error: 'No audio data provided. Send { audio: "<base64>", encoding: "M4A", language: "auto" }',
          });
        }

        // Determine encoding from mimeType or explicit encoding field
        let encoding: 'MP3' | 'M4A' | 'WAV' | 'WEBM_OPUS' = 'M4A';
        const mime = body.mimeType || '';
        const enc = body.encoding || '';
        if (enc === 'WEBM_OPUS' || mime.includes('webm')) {
          encoding = 'WEBM_OPUS';
        } else if (enc === 'WAV' || mime.includes('wav')) {
          encoding = 'WAV';
        } else if (enc === 'MP3' || mime.includes('mp3') || mime.includes('mpeg')) {
          encoding = 'MP3';
        } else if (enc === 'M4A' || mime.includes('m4a') || mime.includes('mp4') || mime.includes('aac')) {
          encoding = 'M4A';
        }

        const languageCode = body.language || 'auto';

        logger.info('STT request', {
          encoding,
          audioSize: body.audio.length,
          languageCode,
        });

        const result = await sttService.transcribe({
          audioData: body.audio,
          encoding,
          sampleRateHertz: 16000,
          languageCode,
          enableAutomaticPunctuation: true,
        });

        return reply.send({
          success: true,
          data: {
            transcript: result.transcript,
            confidence: result.confidence,
            detectedLanguage: result.detectedLanguage,
            durationMs: result.durationMs,
          },
        });
      } catch (error: any) {
        logger.error('STT error', { error: error.message });
        return reply.code(500).send({
          success: false,
          error: 'Speech-to-text failed',
          message: error.message,
        });
      }
    }
  );

  /**
   * GET /api/translate/languages
   * Get list of supported languages.
   */
  fastify.get('/languages', async (_request: FastifyRequest, reply: FastifyReply) => {
    const languages = translateService.getSupportedLanguages();

    return reply.send({
      success: true,
      data: {
        languages: languages.map((lang) => ({
          code: lang.code,
          name: lang.name,
          nativeName: lang.nativeName,
          supportsSource: lang.supportsSource,
          supportsTarget: lang.supportsTarget,
        })),
        total: languages.length,
      },
    });
  });

  /**
   * GET /api/translate/history
   * Get translation history for the authenticated user.
   */
  fastify.get<{ Querystring: HistoryQuery }>(
    '/history',
    {
      preHandler: [authenticate, validateQuery(historyQuerySchema)],
    },
    async (request: FastifyRequest<{ Querystring: HistoryQuery }>, reply: FastifyReply) => {
      const user = request.authUser!;
      const { page, limit, sourceLang, targetLang, startDate, endDate } = request.query;

      const result = await translateService.getHistory({
        userId: user.userId,
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
   * DELETE /api/translate/history/:id
   * Delete a specific translation from history.
   */
  fastify.delete<{ Params: { id: string } }>(
    '/history/:id',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = request.authUser!;
      const { id } = request.params;

      await translateService.deleteTranslation(id, user.userId);

      return reply.send({
        success: true,
        message: 'Translation deleted successfully',
      });
    }
  );

  /**
   * DELETE /api/translate/history
   * Clear all translation history for the authenticated user.
   */
  fastify.delete(
    '/history',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.authUser!;

      const count = await translateService.clearHistory(user.userId);

      return reply.send({
        success: true,
        message: `Cleared ${count} translations from history`,
        data: { deletedCount: count },
      });
    }
  );
}

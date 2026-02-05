/**
 * =============================================================================
 * AI Punctuation Service
 * =============================================================================
 * Adds proper punctuation to STT transcripts using a fast AI model.
 * Whisper often omits punctuation in real-time scenarios, making text
 * hard to read. This service post-processes transcripts to add natural
 * punctuation without changing the words.
 * =============================================================================
 */

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('punctuation-service');

/**
 * Punctuation request.
 */
export interface PunctuationRequest {
  /** Raw transcript text without proper punctuation */
  text: string;
  /** Language code for language-specific punctuation rules */
  languageCode: string;
  /** Context from previous segments for better punctuation */
  context?: string;
}

/**
 * Punctuation response.
 */
export interface PunctuationResponse {
  /** Text with proper punctuation added */
  punctuatedText: string;
  /** Whether punctuation was actually added */
  wasModified: boolean;
  /** Processing time in milliseconds */
  processingTimeMs: number;
}

/**
 * Sentence-ending punctuation marks across various languages.
 * Includes: period, exclamation, question mark + language-specific variants
 */
const SENTENCE_ENDINGS_PATTERN = /[.!?。？！؟।۔჻᙮᠃᠉⸮︖﹖？！．‽⁇⁈⁉]/;

/**
 * Check if text already has sentence-ending punctuation.
 */
export function hasSentenceEndingPunctuation(text: string): boolean {
  if (!text || text.trim().length === 0) return true;
  const trimmed = text.trim();
  return SENTENCE_ENDINGS_PATTERN.test(trimmed.charAt(trimmed.length - 1));
}

/**
 * Check if text likely needs punctuation.
 * Returns false for very short texts or texts with punctuation.
 */
export function needsPunctuation(text: string, minLength: number = 20): boolean {
  if (!text || text.trim().length < minLength) return false;
  return !hasSentenceEndingPunctuation(text);
}

/**
 * Simple punctuation cache to avoid redundant API calls.
 * Key: normalized text, Value: punctuated result
 */
const punctuationCache = new Map<string, string>();
const MAX_CACHE_SIZE = 500;

/**
 * Get cache key for text.
 */
function getCacheKey(text: string, languageCode: string): string {
  return `${languageCode}:${text.toLowerCase().trim()}`;
}

/**
 * AI Punctuation Service class.
 */
export class PunctuationService {
  private enabled: boolean;
  private openRouterApiKey?: string;
  private model: string;

  constructor() {
    // Check if AI punctuation is enabled via environment
    this.enabled = process.env.ENABLE_AI_PUNCTUATION === 'true';
    this.openRouterApiKey = env.OPENROUTER_API_KEY;
    this.model = process.env.PUNCTUATION_MODEL || 'openai/gpt-4o-mini';

    if (this.enabled && !this.openRouterApiKey) {
      logger.warn('AI punctuation enabled but OPENROUTER_API_KEY not set, disabling');
      this.enabled = false;
    }

    logger.info('Punctuation service initialized', {
      enabled: this.enabled,
      model: this.model,
    });
  }

  /**
   * Check if punctuation service is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Add punctuation to text if needed.
   * Returns original text if punctuation is not needed or service is disabled.
   */
  async addPunctuation(request: PunctuationRequest): Promise<PunctuationResponse> {
    const startTime = Date.now();

    // If disabled, return original text
    if (!this.enabled) {
      return {
        punctuatedText: request.text,
        wasModified: false,
        processingTimeMs: 0,
      };
    }

    // Skip if text is too short or already has punctuation
    if (!needsPunctuation(request.text)) {
      return {
        punctuatedText: request.text,
        wasModified: false,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Check cache first
    const cacheKey = getCacheKey(request.text, request.languageCode);
    const cached = punctuationCache.get(cacheKey);
    if (cached) {
      logger.debug('Punctuation cache hit', { text: request.text.substring(0, 30) });
      return {
        punctuatedText: cached,
        wasModified: cached !== request.text,
        processingTimeMs: Date.now() - startTime,
      };
    }

    try {
      const punctuatedText = await this.callPunctuationAPI(request);
      const processingTimeMs = Date.now() - startTime;

      // Cache the result
      if (punctuationCache.size >= MAX_CACHE_SIZE) {
        // Remove oldest entries (first 100)
        const keysToRemove = Array.from(punctuationCache.keys()).slice(0, 100);
        keysToRemove.forEach(key => punctuationCache.delete(key));
      }
      punctuationCache.set(cacheKey, punctuatedText);

      logger.debug('Punctuation added', {
        original: request.text.substring(0, 50),
        punctuated: punctuatedText.substring(0, 50),
        timeMs: processingTimeMs,
      });

      return {
        punctuatedText,
        wasModified: punctuatedText !== request.text,
        processingTimeMs,
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      logger.error('Punctuation API call failed', { error: (error as Error).message });

      // Return original text on error - don't break the flow
      return {
        punctuatedText: request.text,
        wasModified: false,
        processingTimeMs,
      };
    }
  }

  /**
   * Call the AI API to add punctuation.
   */
  private async callPunctuationAPI(request: PunctuationRequest): Promise<string> {
    const languageName = this.getLanguageName(request.languageCode);

    // Optimized prompt for fast, accurate punctuation
    const systemPrompt = `You are a punctuation assistant. Add natural punctuation to transcribed speech.

RULES:
1. Add periods, commas, question marks, and exclamation points where appropriate
2. Do NOT change any words - only add punctuation
3. Do NOT add quotation marks or parentheses
4. Output ONLY the punctuated text, nothing else
5. Keep the original capitalization
6. For ${languageName}, use appropriate punctuation marks`;

    const userPrompt = request.context
      ? `Context: "${request.context}"\n\nAdd punctuation to: ${request.text}`
      : `Add punctuation to: ${request.text}`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openRouterApiKey}`,
        'HTTP-Referer': 'https://voicetranslate.ai',
        'X-Title': 'VoiceTranslate AI Punctuation',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1, // Low temperature for deterministic output
        max_tokens: 500,  // Keep it short for speed
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const punctuatedText = data.choices?.[0]?.message?.content?.trim();

    if (!punctuatedText) {
      throw new Error('Empty response from punctuation API');
    }

    // Validate that the response is similar to input (prevent hallucination)
    if (!this.isValidPunctuation(request.text, punctuatedText)) {
      logger.warn('Punctuation response seems invalid, using original', {
        original: request.text.substring(0, 50),
        response: punctuatedText.substring(0, 50),
      });
      return request.text;
    }

    return punctuatedText;
  }

  /**
   * Validate that punctuated text is close to original.
   * Prevents AI from changing words or adding extra content.
   */
  private isValidPunctuation(original: string, punctuated: string): boolean {
    // Remove all punctuation for comparison
    const stripPunctuation = (text: string) =>
      text.replace(/[^\w\s\u00C0-\u024F\u0400-\u04FF\u4E00-\u9FFF\u0600-\u06FF\u0900-\u097F]/g, '').toLowerCase().trim();

    const originalStripped = stripPunctuation(original);
    const punctuatedStripped = stripPunctuation(punctuated);

    // Check if words are mostly the same (allow small differences for normalization)
    const originalWords = originalStripped.split(/\s+/).filter(w => w.length > 0);
    const punctuatedWords = punctuatedStripped.split(/\s+/).filter(w => w.length > 0);

    // If word count differs by more than 20%, reject
    if (Math.abs(originalWords.length - punctuatedWords.length) > originalWords.length * 0.2) {
      return false;
    }

    // Check that at least 80% of words match
    let matchCount = 0;
    for (let i = 0; i < Math.min(originalWords.length, punctuatedWords.length); i++) {
      if (originalWords[i] === punctuatedWords[i]) {
        matchCount++;
      }
    }

    return matchCount >= originalWords.length * 0.8;
  }

  /**
   * Get language name from code.
   */
  private getLanguageName(code: string): string {
    const languageNames: Record<string, string> = {
      'en': 'English',
      'tr': 'Turkish',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'ar': 'Arabic',
      'zh': 'Chinese',
      'ja': 'Japanese',
      'ko': 'Korean',
      'hi': 'Hindi',
      'th': 'Thai',
      'vi': 'Vietnamese',
      'nl': 'Dutch',
      'pl': 'Polish',
      'uk': 'Ukrainian',
      'cs': 'Czech',
      'sv': 'Swedish',
      'da': 'Danish',
      'fi': 'Finnish',
      'no': 'Norwegian',
      'el': 'Greek',
      'he': 'Hebrew',
      'id': 'Indonesian',
      'ms': 'Malay',
    };
    return languageNames[code] || 'the target language';
  }

  /**
   * Clear the punctuation cache.
   */
  clearCache(): void {
    punctuationCache.clear();
    logger.info('Punctuation cache cleared');
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: punctuationCache.size,
      maxSize: MAX_CACHE_SIZE,
    };
  }
}

// Export singleton instance
export const punctuationService = new PunctuationService();

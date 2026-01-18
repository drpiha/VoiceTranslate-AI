/**
 * =============================================================================
 * Translation Service
 * =============================================================================
 * Handles text translation using AI services (DeepL, Google Translate).
 * Includes mock implementation for development and testing.
 * =============================================================================
 */

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import {
  ExternalServiceError,
  UnsupportedLanguageError,
  TranslationError,
} from '../../utils/errors.js';

const logger = createLogger('translation-service');

/**
 * Translation request.
 */
export interface TranslationRequest {
  /** Text to translate */
  text: string;
  /** Source language code (ISO 639-1) or 'auto' */
  sourceLang: string;
  /** Target language code (ISO 639-1) */
  targetLang: string;
  /** Formality preference (DeepL only) */
  formality?: 'default' | 'more' | 'less';
}

/**
 * Translation response.
 */
export interface TranslationResponse {
  /** Translated text */
  translatedText: string;
  /** Detected source language */
  detectedSourceLang: string;
  /** Target language */
  targetLang: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Character count */
  characterCount: number;
  /** Translation provider used */
  provider: 'deepl' | 'google' | 'mock';
}

/**
 * Language detection request.
 */
export interface LanguageDetectionRequest {
  /** Text to analyze */
  text: string;
}

/**
 * Language detection response.
 */
export interface LanguageDetectionResponse {
  /** Detected language code */
  language: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Alternative detections */
  alternatives?: Array<{ language: string; confidence: number }>;
}

/**
 * Supported language information.
 */
export interface SupportedLanguage {
  /** ISO 639-1 code */
  code: string;
  /** English name */
  name: string;
  /** Native name */
  nativeName: string;
  /** Supports translation from */
  supportsSource: boolean;
  /** Supports translation to */
  supportsTarget: boolean;
}

/**
 * Mock translations database for realistic testing.
 */
const MOCK_TRANSLATIONS: Record<string, Record<string, string>> = {
  'Hello': {
    'es': 'Hola',
    'fr': 'Bonjour',
    'de': 'Hallo',
    'it': 'Ciao',
    'pt': 'Ola',
    'ja': 'こんにちは',
    'ko': '안녕하세요',
    'zh': '你好',
    'ar': 'مرحبا',
    'ru': 'Привет',
  },
  'Thank you': {
    'es': 'Gracias',
    'fr': 'Merci',
    'de': 'Danke',
    'it': 'Grazie',
    'pt': 'Obrigado',
    'ja': 'ありがとう',
    'ko': '감사합니다',
    'zh': '谢谢',
    'ar': 'شكرا',
    'ru': 'Спасибо',
  },
  'How are you?': {
    'es': '¿Como estas?',
    'fr': 'Comment allez-vous?',
    'de': 'Wie geht es Ihnen?',
    'it': 'Come stai?',
    'pt': 'Como voce esta?',
    'ja': 'お元気ですか？',
    'ko': '어떻게 지내세요?',
    'zh': '你好吗？',
    'ar': 'كيف حالك؟',
    'ru': 'Как дела?',
  },
  'Where is the bathroom?': {
    'es': '¿Donde esta el bano?',
    'fr': 'Ou sont les toilettes?',
    'de': 'Wo ist die Toilette?',
    'it': 'Dov\'e il bagno?',
    'pt': 'Onde fica o banheiro?',
    'ja': 'トイレはどこですか？',
    'ko': '화장실이 어디에요?',
    'zh': '洗手间在哪里？',
    'ar': 'أين الحمام؟',
    'ru': 'Где туалет?',
  },
  'I would like to order': {
    'es': 'Me gustaria pedir',
    'fr': 'Je voudrais commander',
    'de': 'Ich mochte bestellen',
    'it': 'Vorrei ordinare',
    'pt': 'Gostaria de pedir',
    'ja': '注文したいのですが',
    'ko': '주문하고 싶습니다',
    'zh': '我想点',
    'ar': 'أود أن أطلب',
    'ru': 'Я хотел бы заказать',
  },
};

/**
 * Comprehensive supported languages database.
 * GPT-4o-mini can translate between any of these languages.
 */
const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  // Major World Languages
  { code: 'en', name: 'English', nativeName: 'English', supportsSource: true, supportsTarget: true },
  { code: 'zh', name: 'Chinese', nativeName: '中文', supportsSource: true, supportsTarget: true },
  { code: 'es', name: 'Spanish', nativeName: 'Español', supportsSource: true, supportsTarget: true },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', supportsSource: true, supportsTarget: true },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', supportsSource: true, supportsTarget: true },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', supportsSource: true, supportsTarget: true },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', supportsSource: true, supportsTarget: true },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', supportsSource: true, supportsTarget: true },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', supportsSource: true, supportsTarget: true },
  { code: 'de', name: 'German', nativeName: 'Deutsch', supportsSource: true, supportsTarget: true },

  // European Languages
  { code: 'fr', name: 'French', nativeName: 'Français', supportsSource: true, supportsTarget: true },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', supportsSource: true, supportsTarget: true },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', supportsSource: true, supportsTarget: true },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', supportsSource: true, supportsTarget: true },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', supportsSource: true, supportsTarget: true },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština', supportsSource: true, supportsTarget: true },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', supportsSource: true, supportsTarget: true },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', supportsSource: true, supportsTarget: true },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', supportsSource: true, supportsTarget: true },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', supportsSource: true, supportsTarget: true },
  { code: 'da', name: 'Danish', nativeName: 'Dansk', supportsSource: true, supportsTarget: true },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', supportsSource: true, supportsTarget: true },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk', supportsSource: true, supportsTarget: true },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', supportsSource: true, supportsTarget: true },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български', supportsSource: true, supportsTarget: true },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski', supportsSource: true, supportsTarget: true },
  { code: 'sr', name: 'Serbian', nativeName: 'Српски', supportsSource: true, supportsTarget: true },
  { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina', supportsSource: true, supportsTarget: true },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių', supportsSource: true, supportsTarget: true },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviešu', supportsSource: true, supportsTarget: true },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti', supportsSource: true, supportsTarget: true },
  { code: 'ca', name: 'Catalan', nativeName: 'Català', supportsSource: true, supportsTarget: true },
  { code: 'gl', name: 'Galician', nativeName: 'Galego', supportsSource: true, supportsTarget: true },
  { code: 'eu', name: 'Basque', nativeName: 'Euskara', supportsSource: true, supportsTarget: true },
  { code: 'is', name: 'Icelandic', nativeName: 'Íslenska', supportsSource: true, supportsTarget: true },
  { code: 'mt', name: 'Maltese', nativeName: 'Malti', supportsSource: true, supportsTarget: true },
  { code: 'cy', name: 'Welsh', nativeName: 'Cymraeg', supportsSource: true, supportsTarget: true },
  { code: 'ga', name: 'Irish', nativeName: 'Gaeilge', supportsSource: true, supportsTarget: true },
  { code: 'sq', name: 'Albanian', nativeName: 'Shqip', supportsSource: true, supportsTarget: true },
  { code: 'mk', name: 'Macedonian', nativeName: 'Македонски', supportsSource: true, supportsTarget: true },
  { code: 'be', name: 'Belarusian', nativeName: 'Беларуская', supportsSource: true, supportsTarget: true },
  { code: 'bs', name: 'Bosnian', nativeName: 'Bosanski', supportsSource: true, supportsTarget: true },

  // Middle Eastern & Central Asian
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', supportsSource: true, supportsTarget: true },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', supportsSource: true, supportsTarget: true },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', supportsSource: true, supportsTarget: true },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', supportsSource: true, supportsTarget: true },
  { code: 'kk', name: 'Kazakh', nativeName: 'Қазақ', supportsSource: true, supportsTarget: true },
  { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycan', supportsSource: true, supportsTarget: true },
  { code: 'uz', name: 'Uzbek', nativeName: 'Oʻzbek', supportsSource: true, supportsTarget: true },
  { code: 'hy', name: 'Armenian', nativeName: 'Հայdelays', supportsSource: true, supportsTarget: true },
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული', supportsSource: true, supportsTarget: true },
  { code: 'tg', name: 'Tajik', nativeName: 'Тоҷикӣ', supportsSource: true, supportsTarget: true },

  // South Asian
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', supportsSource: true, supportsTarget: true },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', supportsSource: true, supportsTarget: true },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', supportsSource: true, supportsTarget: true },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', supportsSource: true, supportsTarget: true },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', supportsSource: true, supportsTarget: true },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', supportsSource: true, supportsTarget: true },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', supportsSource: true, supportsTarget: true },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली', supportsSource: true, supportsTarget: true },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල', supportsSource: true, supportsTarget: true },

  // Southeast Asian
  { code: 'ko', name: 'Korean', nativeName: '한국어', supportsSource: true, supportsTarget: true },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', supportsSource: true, supportsTarget: true },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', supportsSource: true, supportsTarget: true },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', supportsSource: true, supportsTarget: true },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', supportsSource: true, supportsTarget: true },
  { code: 'fil', name: 'Filipino', nativeName: 'Filipino', supportsSource: true, supportsTarget: true },
  { code: 'my', name: 'Myanmar', nativeName: 'မြန်မာ', supportsSource: true, supportsTarget: true },
  { code: 'km', name: 'Khmer', nativeName: 'ខ្មែរ', supportsSource: true, supportsTarget: true },
  { code: 'lo', name: 'Lao', nativeName: 'ລາວ', supportsSource: true, supportsTarget: true },

  // African Languages
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', supportsSource: true, supportsTarget: true },
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans', supportsSource: true, supportsTarget: true },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ', supportsSource: true, supportsTarget: true },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa', supportsSource: true, supportsTarget: true },
  { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá', supportsSource: true, supportsTarget: true },
  { code: 'sn', name: 'Shona', nativeName: 'chiShona', supportsSource: true, supportsTarget: true },
  { code: 'so', name: 'Somali', nativeName: 'Soomaali', supportsSource: true, supportsTarget: true },
  { code: 'mg', name: 'Malagasy', nativeName: 'Malagasy', supportsSource: true, supportsTarget: true },

  // Other Languages
  { code: 'la', name: 'Latin', nativeName: 'Latina', supportsSource: true, supportsTarget: true },
  { code: 'eo', name: 'Esperanto', nativeName: 'Esperanto', supportsSource: true, supportsTarget: true },
  { code: 'haw', name: 'Hawaiian', nativeName: 'ʻŌlelo Hawaiʻi', supportsSource: true, supportsTarget: true },
  { code: 'mi', name: 'Maori', nativeName: 'Te Reo Māori', supportsSource: true, supportsTarget: true },
  { code: 'mn', name: 'Mongolian', nativeName: 'Монгол', supportsSource: true, supportsTarget: true },
  { code: 'jw', name: 'Javanese', nativeName: 'Basa Jawa', supportsSource: true, supportsTarget: true },
  { code: 'su', name: 'Sundanese', nativeName: 'Basa Sunda', supportsSource: true, supportsTarget: true },
  { code: 'yi', name: 'Yiddish', nativeName: 'ייִדיש', supportsSource: true, supportsTarget: true },
  { code: 'lb', name: 'Luxembourgish', nativeName: 'Lëtzebuergesch', supportsSource: true, supportsTarget: true },
  { code: 'ht', name: 'Haitian Creole', nativeName: 'Kreyòl Ayisyen', supportsSource: true, supportsTarget: true },
  { code: 'ps', name: 'Pashto', nativeName: 'پښتو', supportsSource: true, supportsTarget: true },
  { code: 'sd', name: 'Sindhi', nativeName: 'سنڌي', supportsSource: true, supportsTarget: true },
];

/**
 * Translation service class.
 */
export class AITranslationService {
  private useMock: boolean;
  private useOpenRouter: boolean;
  private preferDeepL: boolean;

  constructor() {
    this.useOpenRouter = !!env.OPENROUTER_API_KEY && !env.USE_MOCK_AI_SERVICES;
    this.useMock = env.USE_MOCK_AI_SERVICES || (!env.DEEPL_API_KEY && !env.GOOGLE_TRANSLATE_API_KEY && !env.OPENROUTER_API_KEY);
    this.preferDeepL = !!env.DEEPL_API_KEY;

    if (this.useMock) {
      logger.info('Translation service initialized in mock mode');
    } else if (this.useOpenRouter) {
      logger.info('Translation service initialized with OpenRouter', {
        model: env.OPENROUTER_MODEL,
      });
    } else {
      logger.info('Translation service initialized', {
        provider: this.preferDeepL ? 'DeepL' : 'Google',
      });
    }
  }

  /**
   * Translate text from source to target language.
   *
   * @param request - Translation request
   * @returns Translation response
   */
  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const startTime = Date.now();

    // Validate languages
    if (request.sourceLang !== 'auto' && !this.isLanguageSupported(request.sourceLang)) {
      throw new UnsupportedLanguageError(request.sourceLang);
    }

    if (!this.isLanguageSupported(request.targetLang)) {
      throw new UnsupportedLanguageError(request.targetLang);
    }

    // Don't translate if same language
    if (request.sourceLang === request.targetLang) {
      return {
        translatedText: request.text,
        detectedSourceLang: request.sourceLang,
        targetLang: request.targetLang,
        confidence: 1.0,
        characterCount: request.text.length,
        provider: 'mock',
      };
    }

    try {
      if (this.useMock) {
        return await this.mockTranslate(request);
      }

      if (this.useOpenRouter) {
        return await this.openRouterTranslate(request);
      }

      if (this.preferDeepL) {
        return await this.deeplTranslate(request);
      }

      return await this.googleTranslate(request);
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.externalService('translation', 'translate', false, duration, {
        error: (error as Error).message,
      });

      if (error instanceof UnsupportedLanguageError || error instanceof TranslationError) {
        throw error;
      }

      throw new ExternalServiceError('Translation Service', 'Translation failed');
    }
  }

  /**
   * Detect the language of the given text.
   *
   * @param request - Language detection request
   * @returns Detection response
   */
  async detectLanguage(request: LanguageDetectionRequest): Promise<LanguageDetectionResponse> {
    const startTime = Date.now();

    try {
      if (this.useMock) {
        return await this.mockDetectLanguage(request);
      }

      // Use DeepL or Google for detection
      return await this.mockDetectLanguage(request);
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.externalService('translation', 'detect', false, duration);
      throw new ExternalServiceError('Translation Service', 'Language detection failed');
    }
  }

  /**
   * Get list of supported languages.
   */
  getSupportedLanguages(): SupportedLanguage[] {
    return SUPPORTED_LANGUAGES;
  }

  /**
   * Check if a language is supported.
   */
  isLanguageSupported(code: string): boolean {
    return SUPPORTED_LANGUAGES.some(
      (lang) => lang.code.toLowerCase() === code.toLowerCase()
    );
  }

  /**
   * Mock translation for development.
   */
  private async mockTranslate(request: TranslationRequest): Promise<TranslationResponse> {
    // Simulate realistic latency
    const latency = 100 + Math.random() * 200;
    await this.delay(latency);

    // Try to find a mock translation
    let translatedText = request.text;
    let detectedSourceLang = request.sourceLang === 'auto' ? 'en' : request.sourceLang;

    // Check if we have a mock translation
    const normalizedText = request.text.trim();
    if (MOCK_TRANSLATIONS[normalizedText]?.[request.targetLang]) {
      translatedText = MOCK_TRANSLATIONS[normalizedText][request.targetLang]!;
    } else {
      // Generate a mock translation by adding language indicator
      const langInfo = SUPPORTED_LANGUAGES.find((l) => l.code === request.targetLang);
      translatedText = `[${langInfo?.name || request.targetLang}] ${request.text}`;
    }

    const confidence = 0.9 + Math.random() * 0.1;

    logger.externalService('mock-translation', 'translate', true, latency, {
      sourceLang: detectedSourceLang,
      targetLang: request.targetLang,
      characterCount: request.text.length,
    });

    return {
      translatedText,
      detectedSourceLang,
      targetLang: request.targetLang,
      confidence,
      characterCount: request.text.length,
      provider: 'mock',
    };
  }

  /**
   * Mock language detection.
   */
  private async mockDetectLanguage(
    request: LanguageDetectionRequest
  ): Promise<LanguageDetectionResponse> {
    const latency = 50 + Math.random() * 100;
    await this.delay(latency);

    // Simple heuristic-based detection for common patterns
    const text = request.text.toLowerCase();

    let detected = 'en';
    let confidence = 0.85;

    // Check for non-Latin characters
    if (/[\u4e00-\u9fff]/.test(text)) {
      detected = 'zh';
      confidence = 0.95;
    } else if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) {
      detected = 'ja';
      confidence = 0.95;
    } else if (/[\uac00-\ud7af]/.test(text)) {
      detected = 'ko';
      confidence = 0.95;
    } else if (/[\u0600-\u06ff]/.test(text)) {
      detected = 'ar';
      confidence = 0.95;
    } else if (/[\u0400-\u04ff]/.test(text)) {
      detected = 'ru';
      confidence = 0.9;
    } else if (/[\u0900-\u097f]/.test(text)) {
      detected = 'hi';
      confidence = 0.95;
    } else if (/[\u0e00-\u0e7f]/.test(text)) {
      detected = 'th';
      confidence = 0.95;
    }
    // Check for common words in Latin-based languages
    else if (/\b(el|la|los|las|es|esta|como|que|para)\b/.test(text)) {
      detected = 'es';
      confidence = 0.8;
    } else if (/\b(le|la|les|est|sont|avec|pour|dans)\b/.test(text)) {
      detected = 'fr';
      confidence = 0.8;
    } else if (/\b(der|die|das|ist|sind|mit|und|oder)\b/.test(text)) {
      detected = 'de';
      confidence = 0.8;
    } else if (/\b(il|lo|la|gli|sono|per|con|che)\b/.test(text)) {
      detected = 'it';
      confidence = 0.8;
    }

    logger.externalService('mock-detection', 'detect', true, latency, {
      detected,
      confidence,
    });

    return {
      language: detected,
      confidence,
      alternatives: [
        { language: detected === 'en' ? 'de' : 'en', confidence: confidence * 0.3 },
      ],
    };
  }

  /**
   * OpenRouter AI translation.
   */
  private async openRouterTranslate(request: TranslationRequest): Promise<TranslationResponse> {
    const startTime = Date.now();

    try {
      const sourceLangName = this.getLanguageName(request.sourceLang);
      const targetLangName = this.getLanguageName(request.targetLang);

      const systemPrompt = `You are an expert real-time interpreter specializing in natural, conversational translation.

TASK: Translate spoken language ${request.sourceLang === 'auto' ? '' : `from ${sourceLangName} `}to ${targetLangName}.

RULES:
1. Output ONLY the translation - no explanations, notes, or original text
2. Keep it natural and conversational - this is spoken language, not formal text
3. Preserve the speaker's intent, emotion, and tone
4. Handle incomplete sentences gracefully - translate what's there naturally
5. For filler words/sounds, translate to equivalent natural expressions in target language
6. Maintain any emphasis or urgency in the original speech`;

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://voicetranslate.ai',
          'X-Title': 'VoiceTranslate AI',
        },
        body: JSON.stringify({
          model: env.OPENROUTER_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: request.text },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        logger.error('OpenRouter API error', { status: response.status, error: errorData });
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const translatedText = data.choices?.[0]?.message?.content?.trim() || '';

      if (!translatedText) {
        throw new Error('Empty translation response from OpenRouter');
      }

      const duration = Date.now() - startTime;
      logger.externalService('openrouter', 'translate', true, duration, {
        model: env.OPENROUTER_MODEL,
        sourceLang: request.sourceLang,
        targetLang: request.targetLang,
        characterCount: request.text.length,
      });

      return {
        translatedText,
        detectedSourceLang: request.sourceLang === 'auto' ? 'en' : request.sourceLang,
        targetLang: request.targetLang,
        confidence: 0.95,
        characterCount: request.text.length,
        provider: 'deepl', // Using 'deepl' as a placeholder since we don't have 'openrouter' in the type
      };
    } catch (error) {
      logger.error('OpenRouter translation failed', { error: (error as Error).message });
      // Fallback to mock if OpenRouter fails
      logger.warn('Falling back to mock translation');
      return this.mockTranslate(request);
    }
  }

  /**
   * Get language name from code.
   */
  private getLanguageName(code: string): string {
    const lang = SUPPORTED_LANGUAGES.find(l => l.code === code);
    return lang?.name || code;
  }

  /**
   * DeepL translation (placeholder).
   */
  private async deeplTranslate(request: TranslationRequest): Promise<TranslationResponse> {
    logger.warn('DeepL translation not fully implemented, using mock');

    logger.debug('Would send to DeepL', {
      text: request.text.substring(0, 100),
      sourceLang: request.sourceLang,
      targetLang: request.targetLang,
    });

    return this.mockTranslate(request);
  }

  /**
   * Google Translate (placeholder).
   */
  private async googleTranslate(request: TranslationRequest): Promise<TranslationResponse> {
    logger.warn('Google Translate not fully implemented, using mock');

    logger.debug('Would send to Google Translate', {
      text: request.text.substring(0, 100),
      sourceLang: request.sourceLang,
      targetLang: request.targetLang,
    });

    return this.mockTranslate(request);
  }

  /**
   * Utility: delay for specified milliseconds.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const aiTranslationService = new AITranslationService();

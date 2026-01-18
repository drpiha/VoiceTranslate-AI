/**
 * =============================================================================
 * Text-to-Speech (TTS) Service
 * =============================================================================
 * Handles conversion of text to audio using AI services.
 * Includes mock implementation for development and testing.
 * =============================================================================
 */

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import { ExternalServiceError, UnsupportedLanguageError } from '../../utils/errors.js';

const logger = createLogger('tts-service');

/**
 * TTS request configuration.
 */
export interface TTSRequest {
  /** Text to synthesize */
  text: string;
  /** Language code (ISO 639-1) */
  languageCode: string;
  /** Voice name/ID (optional) */
  voiceName?: string;
  /** Voice gender preference */
  gender?: 'MALE' | 'FEMALE' | 'NEUTRAL';
  /** Speech rate (0.25 to 4.0, 1.0 is normal) */
  speakingRate?: number;
  /** Pitch adjustment (-20.0 to 20.0, 0 is default) */
  pitch?: number;
  /** Audio encoding format */
  audioEncoding?: AudioEncoding;
  /** Sample rate for the output audio */
  sampleRateHertz?: number;
}

/**
 * Supported audio encoding formats for TTS output.
 */
export type AudioEncoding = 'MP3' | 'LINEAR16' | 'OGG_OPUS' | 'MULAW' | 'ALAW';

/**
 * TTS response structure.
 */
export interface TTSResponse {
  /** Audio data as base64 encoded string */
  audioContent: string;
  /** Audio encoding format */
  audioEncoding: AudioEncoding;
  /** Sample rate of the audio */
  sampleRateHertz: number;
  /** Duration of the audio in milliseconds */
  durationMs: number;
  /** Character count of input text */
  characterCount: number;
  /** Voice used for synthesis */
  voiceUsed: string;
}

/**
 * Available voice information.
 */
export interface Voice {
  /** Voice name/ID */
  name: string;
  /** Language code */
  languageCode: string;
  /** Gender */
  gender: 'MALE' | 'FEMALE' | 'NEUTRAL';
  /** Natural sounding rate (higher is more natural) */
  naturalSampleRateHertz: number;
  /** Supported audio formats */
  supportedFormats: AudioEncoding[];
}

/**
 * Mock voices database.
 */
const MOCK_VOICES: Voice[] = [
  { name: 'en-US-Neural2-A', languageCode: 'en', gender: 'MALE', naturalSampleRateHertz: 24000, supportedFormats: ['MP3', 'LINEAR16', 'OGG_OPUS'] },
  { name: 'en-US-Neural2-C', languageCode: 'en', gender: 'FEMALE', naturalSampleRateHertz: 24000, supportedFormats: ['MP3', 'LINEAR16', 'OGG_OPUS'] },
  { name: 'es-ES-Neural2-A', languageCode: 'es', gender: 'MALE', naturalSampleRateHertz: 24000, supportedFormats: ['MP3', 'LINEAR16', 'OGG_OPUS'] },
  { name: 'es-ES-Neural2-B', languageCode: 'es', gender: 'FEMALE', naturalSampleRateHertz: 24000, supportedFormats: ['MP3', 'LINEAR16', 'OGG_OPUS'] },
  { name: 'fr-FR-Neural2-A', languageCode: 'fr', gender: 'MALE', naturalSampleRateHertz: 24000, supportedFormats: ['MP3', 'LINEAR16', 'OGG_OPUS'] },
  { name: 'fr-FR-Neural2-C', languageCode: 'fr', gender: 'FEMALE', naturalSampleRateHertz: 24000, supportedFormats: ['MP3', 'LINEAR16', 'OGG_OPUS'] },
  { name: 'de-DE-Neural2-B', languageCode: 'de', gender: 'MALE', naturalSampleRateHertz: 24000, supportedFormats: ['MP3', 'LINEAR16', 'OGG_OPUS'] },
  { name: 'de-DE-Neural2-C', languageCode: 'de', gender: 'FEMALE', naturalSampleRateHertz: 24000, supportedFormats: ['MP3', 'LINEAR16', 'OGG_OPUS'] },
  { name: 'it-IT-Neural2-A', languageCode: 'it', gender: 'MALE', naturalSampleRateHertz: 24000, supportedFormats: ['MP3', 'LINEAR16', 'OGG_OPUS'] },
  { name: 'it-IT-Neural2-B', languageCode: 'it', gender: 'FEMALE', naturalSampleRateHertz: 24000, supportedFormats: ['MP3', 'LINEAR16', 'OGG_OPUS'] },
  { name: 'ja-JP-Neural2-B', languageCode: 'ja', gender: 'MALE', naturalSampleRateHertz: 24000, supportedFormats: ['MP3', 'LINEAR16', 'OGG_OPUS'] },
  { name: 'ja-JP-Neural2-C', languageCode: 'ja', gender: 'FEMALE', naturalSampleRateHertz: 24000, supportedFormats: ['MP3', 'LINEAR16', 'OGG_OPUS'] },
  { name: 'ko-KR-Neural2-A', languageCode: 'ko', gender: 'MALE', naturalSampleRateHertz: 24000, supportedFormats: ['MP3', 'LINEAR16', 'OGG_OPUS'] },
  { name: 'ko-KR-Neural2-B', languageCode: 'ko', gender: 'FEMALE', naturalSampleRateHertz: 24000, supportedFormats: ['MP3', 'LINEAR16', 'OGG_OPUS'] },
  { name: 'zh-CN-Neural2-C', languageCode: 'zh', gender: 'MALE', naturalSampleRateHertz: 24000, supportedFormats: ['MP3', 'LINEAR16', 'OGG_OPUS'] },
  { name: 'zh-CN-Neural2-D', languageCode: 'zh', gender: 'FEMALE', naturalSampleRateHertz: 24000, supportedFormats: ['MP3', 'LINEAR16', 'OGG_OPUS'] },
  { name: 'ar-XA-Neural2-A', languageCode: 'ar', gender: 'MALE', naturalSampleRateHertz: 24000, supportedFormats: ['MP3', 'LINEAR16', 'OGG_OPUS'] },
  { name: 'ar-XA-Neural2-C', languageCode: 'ar', gender: 'FEMALE', naturalSampleRateHertz: 24000, supportedFormats: ['MP3', 'LINEAR16', 'OGG_OPUS'] },
  { name: 'ru-RU-Neural2-B', languageCode: 'ru', gender: 'MALE', naturalSampleRateHertz: 24000, supportedFormats: ['MP3', 'LINEAR16', 'OGG_OPUS'] },
  { name: 'ru-RU-Neural2-C', languageCode: 'ru', gender: 'FEMALE', naturalSampleRateHertz: 24000, supportedFormats: ['MP3', 'LINEAR16', 'OGG_OPUS'] },
  { name: 'pt-BR-Neural2-A', languageCode: 'pt', gender: 'MALE', naturalSampleRateHertz: 24000, supportedFormats: ['MP3', 'LINEAR16', 'OGG_OPUS'] },
  { name: 'pt-BR-Neural2-C', languageCode: 'pt', gender: 'FEMALE', naturalSampleRateHertz: 24000, supportedFormats: ['MP3', 'LINEAR16', 'OGG_OPUS'] },
];

/**
 * Text-to-Speech service class.
 */
export class TTSService {
  private useMock: boolean;

  constructor() {
    this.useMock = env.USE_MOCK_AI_SERVICES || !env.GOOGLE_CLOUD_TTS_API_KEY;

    if (this.useMock) {
      logger.info('TTS service initialized in mock mode');
    } else {
      logger.info('TTS service initialized with Google Cloud');
    }
  }

  /**
   * Synthesize text to speech.
   *
   * @param request - TTS request with text and options
   * @returns TTS response with audio data
   */
  async synthesize(request: TTSRequest): Promise<TTSResponse> {
    const startTime = Date.now();

    // Validate language
    if (!this.isLanguageSupported(request.languageCode)) {
      throw new UnsupportedLanguageError(request.languageCode);
    }

    // Validate text length
    if (request.text.length > 5000) {
      throw new ExternalServiceError('TTS', 'Text exceeds maximum length of 5000 characters');
    }

    try {
      if (this.useMock) {
        return await this.mockSynthesize(request);
      }

      return await this.googleSynthesize(request);
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.externalService('google-tts', 'synthesize', false, duration, {
        error: (error as Error).message,
      });

      if (error instanceof UnsupportedLanguageError) {
        throw error;
      }

      throw new ExternalServiceError('Google Text-to-Speech', 'Synthesis failed');
    }
  }

  /**
   * Get available voices for a language.
   *
   * @param languageCode - Language code to filter by (optional)
   * @returns List of available voices
   */
  getVoices(languageCode?: string): Voice[] {
    if (languageCode) {
      return MOCK_VOICES.filter(
        (v) => v.languageCode.toLowerCase() === languageCode.toLowerCase()
      );
    }
    return MOCK_VOICES;
  }

  /**
   * Get supported languages for TTS.
   */
  getSupportedLanguages(): string[] {
    const languages = new Set(MOCK_VOICES.map((v) => v.languageCode));
    return Array.from(languages);
  }

  /**
   * Check if a language is supported.
   */
  isLanguageSupported(languageCode: string): boolean {
    return this.getSupportedLanguages().includes(languageCode.toLowerCase());
  }

  /**
   * Mock synthesis for development.
   */
  private async mockSynthesize(request: TTSRequest): Promise<TTSResponse> {
    // Simulate realistic latency based on text length
    const baseLatency = 100;
    const perCharLatency = 2;
    const latency = baseLatency + (request.text.length * perCharLatency);
    await this.delay(Math.min(latency, 500)); // Cap at 500ms

    // Calculate mock duration based on text length
    // Average speaking rate is about 150 words per minute
    // Average word length is about 5 characters
    const wordsPerMinute = 150 / (request.speakingRate || 1.0);
    const estimatedWords = request.text.length / 5;
    const durationMs = Math.floor((estimatedWords / wordsPerMinute) * 60 * 1000);

    // Find appropriate voice
    const voices = this.getVoices(request.languageCode);
    let voice = voices[0];

    if (request.voiceName) {
      voice = voices.find((v) => v.name === request.voiceName) || voice;
    } else if (request.gender) {
      voice = voices.find((v) => v.gender === request.gender) || voice;
    }

    const audioEncoding = request.audioEncoding || 'MP3';
    const sampleRate = request.sampleRateHertz || voice?.naturalSampleRateHertz || 24000;

    // Generate mock audio data
    // In a real implementation, this would be actual audio
    // For mock, we generate a placeholder that represents the audio size
    const estimatedBytesPerSecond = sampleRate * 2; // 16-bit audio
    const estimatedBytes = Math.floor((durationMs / 1000) * estimatedBytesPerSecond);

    // Create a small mock audio placeholder (not real audio, just for testing)
    const mockAudioBuffer = Buffer.alloc(Math.min(estimatedBytes, 1024));
    const audioContent = mockAudioBuffer.toString('base64');

    logger.externalService('mock-tts', 'synthesize', true, latency, {
      languageCode: request.languageCode,
      characterCount: request.text.length,
      durationMs,
      voice: voice?.name,
    });

    return {
      audioContent,
      audioEncoding,
      sampleRateHertz: sampleRate,
      durationMs,
      characterCount: request.text.length,
      voiceUsed: voice?.name || 'unknown',
    };
  }

  /**
   * Real Google Cloud TTS implementation.
   * Currently a placeholder - would use @google-cloud/text-to-speech in production.
   */
  private async googleSynthesize(request: TTSRequest): Promise<TTSResponse> {
    logger.warn('Google TTS not fully implemented, using mock');

    logger.debug('Would send to Google TTS', {
      text: request.text.substring(0, 100),
      languageCode: request.languageCode,
      voice: request.voiceName,
      encoding: request.audioEncoding,
    });

    return this.mockSynthesize(request);
  }

  /**
   * Utility: delay for specified milliseconds.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const ttsService = new TTSService();

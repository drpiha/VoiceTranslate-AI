/**
 * =============================================================================
 * Speech-to-Text (STT) Service with Groq Whisper
 * =============================================================================
 * Handles conversion of audio to text using Groq's Whisper API (fast & free).
 * Falls back to mock when API key is not configured.
 * =============================================================================
 */

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import { ExternalServiceError, AudioProcessingError } from '../../utils/errors.js';
import FormData from 'form-data';
import axios from 'axios';
import { Buffer } from 'buffer';

const logger = createLogger('stt-service');

export interface STTRequest {
  audioData: string;
  encoding: AudioEncoding;
  sampleRateHertz: number;
  languageCode: string;
  enableAutomaticPunctuation?: boolean;
  enableWordTimeOffsets?: boolean;
  // Context for better accuracy
  prompt?: string; // Previous transcription for context
  temperature?: number; // 0 = more deterministic, 1 = more creative
}

export type AudioEncoding =
  | 'LINEAR16'
  | 'FLAC'
  | 'MULAW'
  | 'AMR'
  | 'AMR_WB'
  | 'OGG_OPUS'
  | 'WEBM_OPUS'
  | 'MP3'
  | 'M4A'
  | 'WAV';

export interface STTResponse {
  transcript: string;
  confidence: number;
  detectedLanguage: string;
  durationMs: number;
  words?: WordInfo[];
  isFinal: boolean;
}

export interface WordInfo {
  word: string;
  startTimeMs: number;
  endTimeMs: number;
  confidence: number;
}

export interface StreamingSTTSession {
  id: string;
  sendAudio: (chunk: Buffer) => void;
  close: () => Promise<STTResponse>;
  onInterimResult?: (result: STTResponse) => void;
}

// Comprehensive language name to ISO code mapping (Whisper returns full names)
// Whisper large-v3 supports 99 languages
const languageNameToCode: Record<string, string> = {
  // Major World Languages
  'english': 'en',
  'chinese': 'zh',
  'mandarin': 'zh',
  'spanish': 'es',
  'arabic': 'ar',
  'hindi': 'hi',
  'bengali': 'bn',
  'portuguese': 'pt',
  'russian': 'ru',
  'japanese': 'ja',
  'german': 'de',

  // European Languages
  'french': 'fr',
  'italian': 'it',
  'dutch': 'nl',
  'polish': 'pl',
  'ukrainian': 'uk',
  'czech': 'cs',
  'romanian': 'ro',
  'greek': 'el',
  'hungarian': 'hu',
  'swedish': 'sv',
  'danish': 'da',
  'finnish': 'fi',
  'norwegian': 'no',
  'slovak': 'sk',
  'bulgarian': 'bg',
  'croatian': 'hr',
  'serbian': 'sr',
  'slovenian': 'sl',
  'lithuanian': 'lt',
  'latvian': 'lv',
  'estonian': 'et',
  'catalan': 'ca',
  'galician': 'gl',
  'basque': 'eu',
  'icelandic': 'is',
  'maltese': 'mt',
  'welsh': 'cy',
  'irish': 'ga',
  'albanian': 'sq',
  'macedonian': 'mk',
  'belarusian': 'be',
  'bosnian': 'bs',

  // Middle Eastern & Central Asian
  'turkish': 'tr',
  'persian': 'fa',
  'farsi': 'fa',
  'hebrew': 'he',
  'urdu': 'ur',
  'kazakh': 'kk',
  'azerbaijani': 'az',
  'uzbek': 'uz',
  'armenian': 'hy',
  'georgian': 'ka',
  'tajik': 'tg',

  // South Asian
  'tamil': 'ta',
  'telugu': 'te',
  'malayalam': 'ml',
  'kannada': 'kn',
  'marathi': 'mr',
  'gujarati': 'gu',
  'punjabi': 'pa',
  'nepali': 'ne',
  'sinhala': 'si',
  'sinhalese': 'si',

  // Southeast Asian
  'korean': 'ko',
  'vietnamese': 'vi',
  'thai': 'th',
  'indonesian': 'id',
  'malay': 'ms',
  'filipino': 'fil',
  'tagalog': 'fil',
  'burmese': 'my',
  'myanmar': 'my',
  'khmer': 'km',
  'cambodian': 'km',
  'lao': 'lo',
  'laotian': 'lo',

  // African Languages
  'swahili': 'sw',
  'afrikaans': 'af',
  'amharic': 'am',
  'hausa': 'ha',
  'yoruba': 'yo',
  'shona': 'sn',
  'somali': 'so',
  'malagasy': 'mg',

  // Other Languages
  'latin': 'la',
  'esperanto': 'eo',
  'hawaiian': 'haw',
  'maori': 'mi',
  'mongolian': 'mn',
  'javanese': 'jw',
  'sundanese': 'su',
  'yiddish': 'yi',
  'luxembourgish': 'lb',
  'occitan': 'oc',
  'breton': 'br',
  'faroese': 'fo',
  'nynorsk': 'nn',
  'tatar': 'tt',
  'bashkir': 'ba',
  'turkmen': 'tk',
  'haitian': 'ht',
  'haitian creole': 'ht',
  'pashto': 'ps',
  'sindhi': 'sd',
  'assamese': 'as',
  'lingala': 'ln',
  'cantonese': 'yue',
  'scottish gaelic': 'gd',
  'tibetan': 'bo',
  'sanskrit': 'sa',
};

function normalizeLanguageCode(lang: string): string {
  if (!lang) return 'en';
  const lower = lang.toLowerCase().trim();
  // If it's already a code (2-3 chars), return it
  if (lower.length <= 3) return lower;
  // Otherwise look up the name
  return languageNameToCode[lower] || 'en';
}

export class STTService {
  private useMock: boolean;
  private groqApiKey?: string;

  constructor() {
    this.groqApiKey = env.GROQ_API_KEY;
    this.useMock = env.USE_MOCK_AI_SERVICES || !this.groqApiKey;

    if (this.useMock) {
      logger.info('STT service initialized in mock mode');
    } else {
      logger.info('STT service initialized with Groq Whisper', {
        model: 'whisper-large-v3',
      });
    }
  }

  async transcribe(request: STTRequest): Promise<STTResponse> {
    const startTime = Date.now();

    try {
      if (this.useMock) {
        return await this.mockTranscribe(request);
      }

      return await this.groqTranscribe(request);
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.externalService('groq-whisper', 'transcribe', false, duration, {
        error: (error as Error).message,
      });

      if (error instanceof AudioProcessingError) {
        throw error;
      }

      throw new ExternalServiceError('Groq Whisper', 'Transcription failed');
    }
  }

  /**
   * Groq Whisper transcription implementation with optimized settings.
   */
  private async groqTranscribe(request: STTRequest): Promise<STTResponse> {
    const startTime = Date.now();

    try {
      // Convert base64 to buffer
      const audioBuffer = Buffer.from(request.audioData, 'base64');

      // Skip if audio is too small (likely silence)
      if (audioBuffer.length < 1000) {
        logger.debug('Audio buffer too small, skipping transcription', {
          size: audioBuffer.length,
        });
        return {
          transcript: '',
          confidence: 0,
          detectedLanguage: request.languageCode || 'en',
          durationMs: 0,
          isFinal: true,
        };
      }

      // Get file extension based on encoding
      const extension = this.getFileExtension(request.encoding);

      // Create form data with optimized parameters
      const formData = new FormData();
      formData.append('file', audioBuffer, {
        filename: `audio.${extension}`,
        contentType: this.getContentType(request.encoding),
      });

      // Use whisper-large-v3-turbo for faster processing with good accuracy
      formData.append('model', 'whisper-large-v3-turbo');

      // Add language if not auto-detect (improves accuracy significantly)
      if (request.languageCode && request.languageCode !== 'auto') {
        formData.append('language', request.languageCode);
      }

      // Response format with word-level timestamps for better accuracy tracking
      formData.append('response_format', 'verbose_json');

      // Add prompt for context (previous transcription helps with accuracy)
      if (request.prompt && request.prompt.length > 0) {
        // Use last 200 chars as context to help with word boundaries
        const contextPrompt = request.prompt.slice(-200);
        formData.append('prompt', contextPrompt);
      }

      // Temperature: 0 = more deterministic/accurate, good for transcription
      const temperature = request.temperature ?? 0;
      formData.append('temperature', temperature.toString());

      // Call Groq API with optimized timeout
      const response = await axios.post(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${this.groqApiKey}`,
          },
          timeout: 60000, // Increased timeout for larger segments
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      const duration = Date.now() - startTime;
      const result = response.data;

      // Clean up transcript (remove artifacts)
      let transcript = result.text || '';
      transcript = this.cleanTranscript(transcript);

      logger.externalService('groq-whisper', 'transcribe', true, duration, {
        audioSize: audioBuffer.length,
        textLength: transcript.length,
        language: result.language,
        hasPrompt: !!request.prompt,
      });

      // Calculate audio duration (approximate from segments if available)
      const durationMs = result.duration
        ? Math.floor(result.duration * 1000)
        : this.estimateDuration(audioBuffer.length, request.sampleRateHertz);

      // Extract words with timing from segments if available
      const words: WordInfo[] | undefined = result.segments
        ? this.extractWordsFromSegments(result.segments)
        : undefined;

      return {
        transcript,
        confidence: this.calculateConfidence(result.segments),
        detectedLanguage: normalizeLanguageCode(result.language || request.languageCode || 'en'),
        durationMs,
        words: request.enableWordTimeOffsets ? words : undefined,
        isFinal: true,
      };
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || error.message;
      const errorType = error.response?.data?.error?.type || 'unknown';

      logger.error('Groq Whisper API error', {
        error: errorMessage,
        type: errorType,
        response: error.response?.data,
        status: error.response?.status,
        audioSize: Buffer.from(request.audioData, 'base64').length,
      });

      // Don't fall back to mock - return empty result with error info
      // This prevents fake translations from appearing
      if (errorType === 'invalid_request_error' && errorMessage.includes('valid media file')) {
        // Audio format issue - return empty but don't throw
        logger.warn('Invalid audio format, returning empty transcript');
        return {
          transcript: '',
          confidence: 0,
          detectedLanguage: request.languageCode || 'en',
          durationMs: 0,
          isFinal: true,
        };
      }

      // For other errors, throw to let caller handle
      throw new ExternalServiceError('Groq Whisper', `Transcription failed: ${errorMessage}`);
    }
  }

  /**
   * Clean up transcript artifacts.
   */
  private cleanTranscript(text: string): string {
    if (!text) return '';

    let cleaned = text.trim();

    // Remove common Whisper artifacts
    cleaned = cleaned.replace(/\[.*?\]/g, ''); // Remove bracketed annotations like [Music], [Applause]
    cleaned = cleaned.replace(/\(.*?\)/g, ''); // Remove parenthetical annotations
    cleaned = cleaned.replace(/♪.*?♪/g, ''); // Remove music notes
    cleaned = cleaned.replace(/\s+/g, ' '); // Normalize whitespace
    cleaned = cleaned.trim();

    return cleaned;
  }

  /**
   * Extract word timings from Whisper segments.
   */
  private extractWordsFromSegments(segments: any[]): WordInfo[] {
    const words: WordInfo[] = [];

    for (const segment of segments) {
      if (segment.words && Array.isArray(segment.words)) {
        for (const word of segment.words) {
          words.push({
            word: word.word || word.text || '',
            startTimeMs: Math.floor((word.start || 0) * 1000),
            endTimeMs: Math.floor((word.end || 0) * 1000),
            confidence: word.confidence || 0.9,
          });
        }
      } else if (segment.text) {
        // If words not available, split text and estimate timing
        const text = segment.text.trim();
        const textWords = text.split(/\s+/);
        const segmentStart = (segment.start || 0) * 1000;
        const segmentEnd = (segment.end || segmentStart + 1000) * 1000;
        const wordDuration = (segmentEnd - segmentStart) / textWords.length;

        textWords.forEach((word: string, index: number) => {
          words.push({
            word,
            startTimeMs: Math.floor(segmentStart + index * wordDuration),
            endTimeMs: Math.floor(segmentStart + (index + 1) * wordDuration),
            confidence: 0.85,
          });
        });
      }
    }

    return words;
  }

  /**
   * Calculate average confidence from segments.
   */
  private calculateConfidence(segments: any[]): number {
    if (!segments || segments.length === 0) return 0.9;

    const confidences = segments
      .map((s) => s.confidence || s.avg_logprob || 0.9)
      .filter((c) => typeof c === 'number');

    if (confidences.length === 0) return 0.9;

    const avg = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    return Math.max(0, Math.min(1, avg));
  }

  /**
   * Get file extension for audio encoding.
   */
  private getFileExtension(encoding: AudioEncoding): string {
    const map: Record<AudioEncoding, string> = {
      LINEAR16: 'wav',
      FLAC: 'flac',
      MULAW: 'wav',
      AMR: 'amr',
      AMR_WB: 'amr',
      OGG_OPUS: 'ogg',
      WEBM_OPUS: 'webm',
      MP3: 'mp3',
      M4A: 'm4a',
      WAV: 'wav',
    };
    return map[encoding] || 'wav';
  }

  /**
   * Get content type for audio encoding.
   */
  private getContentType(encoding: AudioEncoding): string {
    const map: Record<AudioEncoding, string> = {
      LINEAR16: 'audio/wav',
      FLAC: 'audio/flac',
      MULAW: 'audio/wav',
      AMR: 'audio/amr',
      AMR_WB: 'audio/amr-wb',
      OGG_OPUS: 'audio/ogg',
      WEBM_OPUS: 'audio/webm',
      MP3: 'audio/mpeg',
      M4A: 'audio/m4a',
      WAV: 'audio/wav',
    };
    return map[encoding] || 'audio/wav';
  }

  /**
   * Estimate audio duration from buffer size.
   */
  private estimateDuration(audioBytes: number, sampleRate: number): number {
    // Assuming 16-bit audio (2 bytes per sample)
    return Math.floor((audioBytes / (2 * sampleRate)) * 1000);
  }

  createStreamingSession(
    languageCode: string,
    encoding: AudioEncoding,
    sampleRate: number
  ): StreamingSTTSession {
    const sessionId = `stt-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const audioChunks: Buffer[] = [];

    logger.debug('Created streaming STT session', { sessionId, languageCode, encoding });

    return {
      id: sessionId,

      sendAudio: (chunk: Buffer) => {
        audioChunks.push(chunk);
        logger.debug('Received audio chunk', {
          sessionId,
          chunkSize: chunk.length,
          totalSize: audioChunks.reduce((sum, c) => sum + c.length, 0),
        });
      },

      close: async (): Promise<STTResponse> => {
        const totalAudio = Buffer.concat(audioChunks);

        logger.debug('Closing streaming session', {
          sessionId,
          totalSize: totalAudio.length,
        });

        const response = await this.transcribe({
          audioData: totalAudio.toString('base64'),
          encoding,
          sampleRateHertz: sampleRate,
          languageCode,
          enableAutomaticPunctuation: true,
        });

        return response;
      },
    };
  }

  private async mockTranscribe(request: STTRequest): Promise<STTResponse> {
    const latency = 200 + Math.random() * 300;
    await this.delay(latency);

    const audioBytes = Buffer.from(request.audioData, 'base64').length;
    const durationMs = Math.floor((audioBytes / (2 * request.sampleRateHertz)) * 1000);

    const mockTranscripts = [
      'Hello, how are you today?',
      'I would like to order some food.',
      'Where is the nearest train station?',
      'Thank you very much for your help.',
      'Can you please repeat that?',
      'I need directions to the airport.',
      'What time does the meeting start?',
      'The weather is really nice today.',
      'I am looking for a good restaurant.',
      'Could you help me with this?',
    ];

    const transcript = mockTranscripts[Math.floor(Math.random() * mockTranscripts.length)]!;
    const detectedLanguage = request.languageCode === 'auto' ? 'en' : request.languageCode;
    const confidence = 0.85 + Math.random() * 0.14;

    logger.externalService('mock-stt', 'transcribe', true, latency, {
      audioSize: audioBytes,
      durationMs,
      detectedLanguage,
    });

    const words: WordInfo[] = transcript.split(' ').map((word, index, arr) => {
      const wordDuration = durationMs / arr.length;
      return {
        word,
        startTimeMs: Math.floor(index * wordDuration),
        endTimeMs: Math.floor((index + 1) * wordDuration),
        confidence: 0.9 + Math.random() * 0.1,
      };
    });

    return {
      transcript,
      confidence,
      detectedLanguage,
      durationMs: Math.max(durationMs, 1000),
      words: request.enableWordTimeOffsets ? words : undefined,
      isFinal: true,
    };
  }

  getSupportedLanguages(): string[] {
    // Whisper large-v3 supports 99 languages
    return [
      // Major World Languages
      'en', 'zh', 'es', 'ar', 'hi', 'bn', 'pt', 'ru', 'ja', 'de',
      // European Languages
      'fr', 'it', 'nl', 'pl', 'uk', 'cs', 'ro', 'el', 'hu', 'sv',
      'da', 'fi', 'no', 'sk', 'bg', 'hr', 'sr', 'sl', 'lt', 'lv',
      'et', 'ca', 'gl', 'eu', 'is', 'mt', 'cy', 'ga', 'sq', 'mk',
      'be', 'bs',
      // Middle Eastern & Central Asian
      'tr', 'fa', 'he', 'ur', 'kk', 'az', 'uz', 'hy', 'ka', 'tg',
      // South Asian
      'ta', 'te', 'ml', 'kn', 'mr', 'gu', 'pa', 'ne', 'si',
      // Southeast Asian
      'ko', 'vi', 'th', 'id', 'ms', 'fil', 'my', 'km', 'lo',
      // African Languages
      'sw', 'af', 'am', 'ha', 'yo', 'sn', 'so', 'mg',
      // Other Languages
      'la', 'eo', 'haw', 'mi', 'mn', 'jw', 'su', 'yi', 'lb',
      'oc', 'br', 'fo', 'nn', 'tt', 'ba', 'tk', 'ht', 'ps', 'sd',
      'as', 'ln', 'yue', 'gd', 'bo', 'sa',
    ];
  }

  isLanguageSupported(languageCode: string): boolean {
    return this.getSupportedLanguages().includes(languageCode.toLowerCase());
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const sttService = new STTService();

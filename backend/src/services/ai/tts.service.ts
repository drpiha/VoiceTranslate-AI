/**
 * =============================================================================
 * Text-to-Speech (TTS) Service
 * =============================================================================
 * Uses Microsoft Edge TTS (msedge-tts) for free, high-quality neural TTS.
 * No API key required. Supports 400+ voices across 100+ languages.
 * =============================================================================
 */

import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { createLogger } from '../../utils/logger.js';
import { ExternalServiceError } from '../../utils/errors.js';

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
 * Map of language codes to Edge TTS voice names.
 * Uses high-quality Neural voices for all languages.
 */
const EDGE_VOICE_MAP: Record<string, { male: string; female: string }> = {
  en: { male: 'en-US-GuyNeural', female: 'en-US-JennyNeural' },
  es: { male: 'es-ES-AlvaroNeural', female: 'es-ES-ElviraNeural' },
  fr: { male: 'fr-FR-HenriNeural', female: 'fr-FR-DeniseNeural' },
  de: { male: 'de-DE-ConradNeural', female: 'de-DE-KatjaNeural' },
  it: { male: 'it-IT-DiegoNeural', female: 'it-IT-ElsaNeural' },
  pt: { male: 'pt-BR-AntonioNeural', female: 'pt-BR-FranciscaNeural' },
  ru: { male: 'ru-RU-DmitryNeural', female: 'ru-RU-SvetlanaNeural' },
  ja: { male: 'ja-JP-KeitaNeural', female: 'ja-JP-NanamiNeural' },
  ko: { male: 'ko-KR-InJoonNeural', female: 'ko-KR-SunHiNeural' },
  zh: { male: 'zh-CN-YunxiNeural', female: 'zh-CN-XiaoxiaoNeural' },
  ar: { male: 'ar-SA-HamedNeural', female: 'ar-SA-ZariyahNeural' },
  tr: { male: 'tr-TR-AhmetNeural', female: 'tr-TR-EmelNeural' },
  hi: { male: 'hi-IN-MadhurNeural', female: 'hi-IN-SwaraNeural' },
  nl: { male: 'nl-NL-MaartenNeural', female: 'nl-NL-ColetteNeural' },
  pl: { male: 'pl-PL-MarekNeural', female: 'pl-PL-ZofiaNeural' },
  sv: { male: 'sv-SE-MattiasNeural', female: 'sv-SE-SofieNeural' },
  da: { male: 'da-DK-JeppeNeural', female: 'da-DK-ChristelNeural' },
  fi: { male: 'fi-FI-HarriNeural', female: 'fi-FI-NooraNeural' },
  no: { male: 'nb-NO-FinnNeural', female: 'nb-NO-PernilleNeural' },
  uk: { male: 'uk-UA-OstapNeural', female: 'uk-UA-PolinaNeural' },
  cs: { male: 'cs-CZ-AntoninNeural', female: 'cs-CZ-VlastaNeural' },
  el: { male: 'el-GR-NestorasNeural', female: 'el-GR-AthinaNeural' },
  he: { male: 'he-IL-AvriNeural', female: 'he-IL-HilaNeural' },
  th: { male: 'th-TH-NiwatNeural', female: 'th-TH-PremwadeeNeural' },
  vi: { male: 'vi-VN-NamMinhNeural', female: 'vi-VN-HoaiMyNeural' },
  id: { male: 'id-ID-ArdiNeural', female: 'id-ID-GadisNeural' },
  ms: { male: 'ms-MY-OsmanNeural', female: 'ms-MY-YasminNeural' },
  ro: { male: 'ro-RO-EmilNeural', female: 'ro-RO-AlinaNeural' },
  bg: { male: 'bg-BG-BorislavNeural', female: 'bg-BG-KalinaNeural' },
  hu: { male: 'hu-HU-TamasNeural', female: 'hu-HU-NoemiNeural' },
  sk: { male: 'sk-SK-LukasNeural', female: 'sk-SK-ViktoriaNeural' },
  hr: { male: 'hr-HR-SreckoNeural', female: 'hr-HR-GabrijelaNeural' },
  fa: { male: 'fa-IR-FaridNeural', female: 'fa-IR-DilaraNeural' },
  bn: { male: 'bn-IN-BashkarNeural', female: 'bn-IN-TanishaaNeural' },
  ta: { male: 'ta-IN-ValluvarNeural', female: 'ta-IN-PallaviNeural' },
  ur: { male: 'ur-PK-AsadNeural', female: 'ur-PK-UzmaNeural' },
  sw: { male: 'sw-KE-RafikiNeural', female: 'sw-KE-ZuriNeural' },
  af: { male: 'af-ZA-WillemNeural', female: 'af-ZA-AdriNeural' },
  ca: { male: 'ca-ES-EnricNeural', female: 'ca-ES-JoanaNeural' },
  fil: { male: 'fil-PH-AngeloNeural', female: 'fil-PH-BlessicaNeural' },
};

/**
 * Text-to-Speech service using Microsoft Edge TTS.
 * Free, no API key required.
 */
export class TTSService {
  constructor() {
    logger.info('TTS service initialized with Microsoft Edge TTS (free)');
  }

  /**
   * Synthesize text to speech using Edge TTS.
   */
  async synthesize(request: TTSRequest): Promise<TTSResponse> {
    const startTime = Date.now();

    if (request.text.length > 5000) {
      throw new ExternalServiceError('TTS', 'Text exceeds maximum length of 5000 characters');
    }

    try {
      // Get the voice name for the language
      const voiceName = this.resolveVoice(request);

      const tts = new MsEdgeTTS();
      await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

      // Build SSML rate/pitch adjustments
      const rate = request.speakingRate ? `${Math.round((request.speakingRate - 1) * 100)}%` : '+0%';
      const pitch = request.pitch ? `${request.pitch > 0 ? '+' : ''}${Math.round(request.pitch)}Hz` : '+0Hz';

      // Collect audio chunks from stream
      const chunks: Buffer[] = [];
      const { audioStream } = tts.toStream(request.text, { rate, pitch });

      await new Promise<void>((resolve, reject) => {
        audioStream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        audioStream.on('end', () => resolve());
        audioStream.on('close', () => resolve());
        audioStream.on('error', (err: Error) => reject(err));
      });

      const audioBuffer = Buffer.concat(chunks);
      const audioContent = audioBuffer.toString('base64');

      // Estimate duration from MP3 bitrate (96kbps = 12000 bytes/sec)
      const durationMs = Math.floor((audioBuffer.length / 12000) * 1000);

      const duration = Date.now() - startTime;
      logger.externalService('edge-tts', 'synthesize', true, duration, {
        languageCode: request.languageCode,
        characterCount: request.text.length,
        voice: voiceName,
        audioSize: audioBuffer.length,
        durationMs,
      });

      return {
        audioContent,
        audioEncoding: 'MP3',
        sampleRateHertz: 24000,
        durationMs,
        characterCount: request.text.length,
        voiceUsed: voiceName,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.externalService('edge-tts', 'synthesize', false, duration, {
        error: (error as Error).message,
        languageCode: request.languageCode,
      });

      throw new ExternalServiceError('Edge TTS', `Synthesis failed: ${(error as Error).message}`);
    }
  }

  /**
   * Resolve the Edge TTS voice name from the request.
   */
  private resolveVoice(request: TTSRequest): string {
    // If explicit voice name provided and it looks like an Edge voice, use it
    if (request.voiceName && request.voiceName.includes('Neural')) {
      return request.voiceName;
    }

    const lang = request.languageCode.toLowerCase().split('-')[0] ?? 'en';
    const voices = EDGE_VOICE_MAP[lang];
    const enVoices = EDGE_VOICE_MAP['en']!;

    if (!voices) {
      // Fallback to English if language not found
      logger.warn(`No Edge TTS voice for language '${request.languageCode}', falling back to English`);
      const gender = request.gender || 'FEMALE';
      return gender === 'MALE' ? enVoices.male : enVoices.female;
    }

    const gender = request.gender || 'FEMALE';
    return gender === 'MALE' ? voices.male : voices.female;
  }

  /**
   * Get available voices for a language.
   */
  getVoices(languageCode?: string): Voice[] {
    const voices: Voice[] = [];

    for (const [lang, v] of Object.entries(EDGE_VOICE_MAP)) {
      if (languageCode && lang !== languageCode.toLowerCase().split('-')[0]) continue;

      voices.push({
        name: v.male,
        languageCode: lang,
        gender: 'MALE',
        naturalSampleRateHertz: 24000,
        supportedFormats: ['MP3'],
      });
      voices.push({
        name: v.female,
        languageCode: lang,
        gender: 'FEMALE',
        naturalSampleRateHertz: 24000,
        supportedFormats: ['MP3'],
      });
    }

    return voices;
  }

  /**
   * Get supported languages for TTS.
   */
  getSupportedLanguages(): string[] {
    return Object.keys(EDGE_VOICE_MAP);
  }

  /**
   * Check if a language is supported.
   */
  isLanguageSupported(languageCode: string): boolean {
    const lang = languageCode.toLowerCase().split('-')[0] ?? '';
    return lang in EDGE_VOICE_MAP;
  }
}

// Export singleton instance
export const ttsService = new TTSService();

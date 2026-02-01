import { TranslationResponse } from '../types';
import { apiClient, tokenStorage, API_BASE_URL } from './api';
import { getWebSocketBaseUrl } from '../config/api.config';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const WS_BASE_URL = getWebSocketBaseUrl();

// Real-time translation result interface
export interface RealtimeTranslationResult {
  type: 'segment_result' | 'error' | 'realtime_ready';
  segmentId?: number;
  transcript?: string;
  translation?: string;
  detectedLanguage?: string;
  confidence?: number;
  processingTimeMs?: number;
  error?: string;
  // Sentence-level fields
  isFinal?: boolean;        // True when sentence is complete
  isCorrection?: boolean;   // True when this updates a previous segment
  isEmpty?: boolean;        // True when no speech detected
}

// Basit mock çeviri sözlüğü (demo için)
const MOCK_TRANSLATIONS: Record<string, Record<string, string>> = {
  'hello': { es: 'hola', fr: 'bonjour', de: 'hallo', it: 'ciao', tr: 'merhaba', ja: 'こんにちは', ko: '안녕하세요', zh: '你好', ar: 'مرحبا', ru: 'привет' },
  'goodbye': { es: 'adiós', fr: 'au revoir', de: 'auf wiedersehen', it: 'arrivederci', tr: 'hoşça kal', ja: 'さようなら', ko: '안녕히 가세요', zh: '再见', ar: 'وداعا', ru: 'до свидания' },
  'thank you': { es: 'gracias', fr: 'merci', de: 'danke', it: 'grazie', tr: 'teşekkürler', ja: 'ありがとう', ko: '감사합니다', zh: '谢谢', ar: 'شكرا', ru: 'спасибо' },
  'yes': { es: 'sí', fr: 'oui', de: 'ja', it: 'sì', tr: 'evet', ja: 'はい', ko: '네', zh: '是', ar: 'نعم', ru: 'да' },
  'no': { es: 'no', fr: 'non', de: 'nein', it: 'no', tr: 'hayır', ja: 'いいえ', ko: '아니요', zh: '不', ar: 'لا', ru: 'нет' },
  'please': { es: 'por favor', fr: 's\'il vous plaît', de: 'bitte', it: 'per favore', tr: 'lütfen', ja: 'お願いします', ko: '부탁합니다', zh: '请', ar: 'من فضلك', ru: 'пожалуйста' },
  'how are you': { es: '¿cómo estás?', fr: 'comment allez-vous?', de: 'wie geht es dir?', it: 'come stai?', tr: 'nasılsın?', ja: 'お元気ですか', ko: '어떻게 지내세요?', zh: '你好吗？', ar: 'كيف حالك؟', ru: 'как дела?' },
  'good morning': { es: 'buenos días', fr: 'bonjour', de: 'guten morgen', it: 'buongiorno', tr: 'günaydın', ja: 'おはようございます', ko: '좋은 아침이에요', zh: '早上好', ar: 'صباح الخير', ru: 'доброе утро' },
  'good night': { es: 'buenas noches', fr: 'bonne nuit', de: 'gute nacht', it: 'buonanotte', tr: 'iyi geceler', ja: 'おやすみなさい', ko: '안녕히 주무세요', zh: '晚安', ar: 'تصبح على خير', ru: 'спокойной ночи' },
  'i love you': { es: 'te quiero', fr: 'je t\'aime', de: 'ich liebe dich', it: 'ti amo', tr: 'seni seviyorum', ja: '愛してる', ko: '사랑해요', zh: '我爱你', ar: 'أحبك', ru: 'я тебя люблю' },
};

// Mock çeviri fonksiyonu - backend olmadan çalışır
const mockTranslate = (text: string, targetLang: string): string => {
  const lowerText = text.toLowerCase().trim();

  // Sözlükte var mı kontrol et
  if (MOCK_TRANSLATIONS[lowerText] && MOCK_TRANSLATIONS[lowerText][targetLang]) {
    return MOCK_TRANSLATIONS[lowerText][targetLang];
  }

  // Basit kelime kelime çeviri dene
  const words = lowerText.split(' ');
  const translatedWords = words.map(word => {
    if (MOCK_TRANSLATIONS[word] && MOCK_TRANSLATIONS[word][targetLang]) {
      return MOCK_TRANSLATIONS[word][targetLang];
    }
    return word;
  });

  // Eğer hiç çeviri bulunamadıysa, demo mesajı döndür
  const joinedTranslation = translatedWords.join(' ');
  if (joinedTranslation === lowerText) {
    return `[${targetLang.toUpperCase()}] ${text} (Demo mode - backend required for full translation)`;
  }

  return translatedWords.join(' ');
};

class TranslationService {
  private socket: WebSocket | null = null;
  private onMessageCallback?: (data: any) => void;
  private useBackend: boolean = true;
  private backendFailCount: number = 0;
  private lastBackendCheck: number = 0;
  private readonly RETRY_INTERVAL_MS = 10000; // Her 10 saniyede backend'i tekrar dene
  private readonly MAX_FAIL_COUNT = 3;

  async translate(text: string, sourceLanguage: string, targetLanguage: string): Promise<TranslationResponse> {
    // Backend devre dışıysa belirli aralıklarla tekrar dene
    if (!this.useBackend) {
      const now = Date.now();
      if (now - this.lastBackendCheck > this.RETRY_INTERVAL_MS) {
        console.log('Retrying backend connection...');
        this.useBackend = true;
        this.backendFailCount = 0;
        this.lastBackendCheck = now;
      }
    }

    // Önce backend'i dene
    if (this.useBackend) {
      try {
        const response = await apiClient.post<{ success: boolean; data: any }>('/translate/text', {
          text,
          sourceLang: sourceLanguage === 'auto' ? 'auto' : sourceLanguage,
          targetLang: targetLanguage,
        });

        const data = response.data || response;
        // Başarılı - fail count sıfırla
        this.backendFailCount = 0;
        return {
          sourceText: text,
          translatedText: data.translatedText,
          detectedLanguage: data.detectedSourceLang,
          confidence: data.confidence,
        };
      } catch (error: any) {
        console.log('Backend translation failed:', error.message);
        this.backendFailCount++;
        this.lastBackendCheck = Date.now();

        // Belirli sayıda hatadan sonra geçici olarak mock'a geç
        if (this.backendFailCount >= this.MAX_FAIL_COUNT) {
          console.log('Too many failures, temporarily switching to mock mode');
          this.useBackend = false;
        }
      }
    }

    // Mock çeviri kullan
    const translatedText = mockTranslate(text, targetLanguage);
    return {
      sourceText: text,
      translatedText,
      detectedLanguage: sourceLanguage === 'auto' ? 'en' : sourceLanguage,
      confidence: 0.85,
    };
  }

  async detectLanguage(text: string): Promise<{ language: string; confidence: number }> {
    if (this.useBackend) {
      try {
        const response = await apiClient.post<{ success: boolean; data: any }>('/translate/detect', { text });
        const data = response.data || response;
        return {
          language: data.detectedLanguage || data.language,
          confidence: data.confidence || 0.8,
        };
      } catch (error) {
        console.log('Backend language detection failed, using mock');
        this.useBackend = false;
      }
    }

    // Basit dil algılama (demo)
    const lowerText = text.toLowerCase();
    if (/[äöüß]/.test(lowerText)) return { language: 'de', confidence: 0.7 };
    if (/[éèêëàâçîïôùûü]/.test(lowerText)) return { language: 'fr', confidence: 0.7 };
    if (/[áéíóúñ¿¡]/.test(lowerText)) return { language: 'es', confidence: 0.7 };
    if (/[şğıçöü]/.test(lowerText)) return { language: 'tr', confidence: 0.7 };
    if (/[\u3040-\u30ff]/.test(lowerText)) return { language: 'ja', confidence: 0.9 };
    if (/[\uac00-\ud7af]/.test(lowerText)) return { language: 'ko', confidence: 0.9 };
    if (/[\u4e00-\u9fff]/.test(lowerText)) return { language: 'zh', confidence: 0.9 };
    if (/[\u0600-\u06ff]/.test(lowerText)) return { language: 'ar', confidence: 0.9 };
    if (/[\u0400-\u04ff]/.test(lowerText)) return { language: 'ru', confidence: 0.9 };

    return { language: 'en', confidence: 0.6 };
  }

  async getSupportedLanguages(): Promise<Array<{ code: string; name: string }>> {
    if (this.useBackend) {
      try {
        const response = await apiClient.get<{ success: boolean; data: any }>('/translate/languages');
        const data = response.data || response;
        return data.languages || data;
      } catch (error) {
        console.log('Backend get languages failed, using mock');
        this.useBackend = false;
      }
    }

    // Mock dil listesi
    return [
      { code: 'en', name: 'English' },
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' },
      { code: 'it', name: 'Italian' },
      { code: 'pt', name: 'Portuguese' },
      { code: 'ru', name: 'Russian' },
      { code: 'ja', name: 'Japanese' },
      { code: 'ko', name: 'Korean' },
      { code: 'zh', name: 'Chinese' },
      { code: 'ar', name: 'Arabic' },
      { code: 'tr', name: 'Turkish' },
    ];
  }

  // Speech-to-text: send recorded audio to backend STT endpoint as base64 JSON
  async transcribeAudio(audioUri: string, languageCode: string = 'auto'): Promise<{ transcript: string; detectedLanguage?: string; confidence?: number }> {
    if (!this.useBackend) {
      throw new Error('Backend not available');
    }

    try {
      const accessToken = await tokenStorage.getValidAccessToken();

      // Read audio file as base64
      let audioBase64: string;
      let mimeType: string;

      if (Platform.OS === 'web') {
        const response = await fetch(audioUri);
        const blob = await response.blob();
        audioBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1] || result);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        mimeType = 'audio/webm';
      } else {
        audioBase64 = await FileSystem.readAsStringAsync(audioUri, {
          encoding: 'base64',
        });
        mimeType = audioUri.endsWith('.m4a') ? 'audio/m4a' : 'audio/mp4';
      }

      const response = await fetch(
        `${API_BASE_URL}/translate/stt`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            audio: audioBase64,
            mimeType,
            language: languageCode,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `STT failed: ${response.status}`);
      }

      const result = await response.json();
      const data = result.data || result;

      this.backendFailCount = 0;
      return {
        transcript: data.transcript || '',
        detectedLanguage: data.detectedLanguage,
        confidence: data.confidence,
      };
    } catch (error: any) {
      console.error('STT error:', error.message);
      this.backendFailCount++;
      if (this.backendFailCount >= this.MAX_FAIL_COUNT) {
        this.useBackend = false;
      }
      throw error;
    }
  }

  // Backend bağlantısını yeniden dene
  retryBackend(): void {
    this.useBackend = true;
  }

  isUsingBackend(): boolean {
    return this.useBackend;
  }

  // Connect to real-time translation WebSocket
  async connectRealtimeWebSocket(
    onMessage: (data: RealtimeTranslationResult) => void,
    onError?: (error: any) => void,
    onConnected?: () => void
  ): Promise<void> {
    try {
      // Get valid (non-expired) auth token for WebSocket authentication
      const accessToken = await tokenStorage.getValidAccessToken();

      // Build WebSocket URL with auth token
      let url = `${WS_BASE_URL}/translate`;
      if (accessToken) {
        url += `?token=${encodeURIComponent(accessToken)}`;
        console.log('Connecting to WebSocket with auth token');
      } else {
        console.log('No auth token available, connecting without auth');
      }

      console.log('Connecting to WebSocket:', url.substring(0, 50) + '...');
      this.socket = new WebSocket(url);
      this.onMessageCallback = onMessage;

      this.socket.onopen = () => {
        console.log('WebSocket connected');
        if (onConnected) {
          onConnected();
        }
      };

      this.socket.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data);
          console.log('WebSocket message received:', rawData.type);

          // Server sends { type, data: {...}, timestamp } format
          // Flatten it to { type, ...data } for easier handling
          const flatData: RealtimeTranslationResult = {
            type: rawData.type,
            ...(rawData.data || {}),
          };

          // Handle error type specially - extract message from code/message format
          if (rawData.type === 'error' && rawData.data) {
            flatData.error = rawData.data.message || rawData.data.code || 'Unknown error';
          }

          if (this.onMessageCallback) {
            this.onMessageCallback(flatData);
          }
        } catch (error) {
          console.error('WebSocket message parsing error:', error);
        }
      };

      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (onError) {
          onError(error);
        }
      };

      this.socket.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
      };
    } catch (error) {
      console.error('WebSocket connection error:', error);
      if (onError) {
        onError(error);
      }
    }
  }

  // Start real-time session
  startRealtimeSession(sourceLang: string, targetLang: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'start_realtime',
        sourceLang: sourceLang,
        targetLang: targetLang,
      }));
      console.log('Started realtime session:', sourceLang, '->', targetLang);
    }
  }

  // Send audio segment for processing
  sendAudioSegment(audioBase64: string, segmentId: number, sourceLang: string, targetLang: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'process_segment',
        audio: audioBase64,
        segmentId: segmentId,
        sourceLang: sourceLang,
        targetLang: targetLang,
      }));
      console.log('Sent audio segment:', segmentId, 'size:', audioBase64.length);
    }
  }

  // Legacy method for compatibility
  connectWebSocket(
    sourceLanguage: string,
    targetLanguage: string,
    onMessage: (data: any) => void,
    onError?: (error: any) => void
  ): void {
    this.connectRealtimeWebSocket(
      onMessage,
      onError,
      () => {
        this.startRealtimeSession(sourceLanguage, targetLanguage);
      }
    );
  }

  sendAudioChunk(audioData: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'audio',
        data: audioData,
      }));
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.onMessageCallback = undefined;
    }
  }

  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }
}

export const translationService = new TranslationService();

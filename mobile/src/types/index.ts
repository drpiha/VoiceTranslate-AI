export type TranslationMode = 'text' | 'live' | 'conversation';

export interface Translation {
  id: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceText: string;
  translatedText: string;
  timestamp: number;
  isFavorite: boolean;
  audioUrl?: string;
  mode?: TranslationMode;
}

export interface User {
  id: string;
  email: string;
  name: string;
  profilePicture?: string;
  subscriptionTier: 'free' | 'premium';
  subscriptionExpiresAt?: number;
}

export type VadSensitivity = 'low' | 'medium' | 'high';
export type TranslationProvider = 'backend' | 'deepl';

export type ColorScheme = 'indigo' | 'ocean' | 'sunset' | 'rose' | 'emerald' | 'lavender';

export type FontSize = 'small' | 'medium' | 'large';

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  colorScheme: ColorScheme;
  fontSize: FontSize;
  sourceLanguage: string;
  targetLanguage: string;
  autoPlayTranslation: boolean;
  saveHistory: boolean;
  hapticFeedback: boolean;
  vadSensitivity: VadSensitivity;
  translationProvider: TranslationProvider;
  deeplApiKey: string;
  converseTts: boolean;
  faceToFaceMode: boolean;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
}

export interface TranslationRequest {
  audioData: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface TranslationResponse {
  sourceText: string;
  translatedText: string;
  detectedLanguage?: string;
  confidence?: number;
}

export interface WebSocketMessage {
  type: 'start' | 'data' | 'end' | 'error' | 'result';
  payload?: any;
}

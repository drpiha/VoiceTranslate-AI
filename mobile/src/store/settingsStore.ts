import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings, VadSensitivity, TranslationProvider, ColorScheme, FontSize } from '../types';
import { useColorScheme } from 'react-native';

interface SettingsState extends AppSettings {
  isLoading: boolean;
  recentLanguages: string[];

  setTheme: (theme: 'light' | 'dark' | 'system') => Promise<void>;
  setColorScheme: (scheme: ColorScheme) => Promise<void>;
  setFontSize: (size: FontSize) => Promise<void>;
  setSourceLanguage: (language: string) => Promise<void>;
  setTargetLanguage: (language: string) => Promise<void>;
  setAutoPlayTranslation: (enabled: boolean) => Promise<void>;
  setSaveHistory: (enabled: boolean) => Promise<void>;
  setHapticFeedback: (enabled: boolean) => Promise<void>;
  setVadSensitivity: (sensitivity: VadSensitivity) => Promise<void>;
  setTranslationProvider: (provider: TranslationProvider) => Promise<void>;
  setDeeplApiKey: (key: string) => Promise<void>;
  setConverseTts: (enabled: boolean) => Promise<void>;
  setFaceToFaceMode: (enabled: boolean) => Promise<void>;
  addRecentLanguage: (language: string) => Promise<void>;
  loadSettings: () => Promise<void>;
  getEffectiveTheme: () => 'light' | 'dark';
}

const defaultSettings: AppSettings = {
  theme: 'system',
  colorScheme: 'emerald',
  fontSize: 'medium',
  sourceLanguage: 'auto',
  targetLanguage: 'es',
  autoPlayTranslation: true,
  saveHistory: true,
  hapticFeedback: true,
  vadSensitivity: 'medium',
  translationProvider: 'backend',
  deeplApiKey: '',
  converseTts: true,
  faceToFaceMode: true,
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaultSettings,
  isLoading: true,
  recentLanguages: [],

  setTheme: async (theme) => {
    try {
      await AsyncStorage.setItem('theme', theme);
      set({ theme });
    } catch (error) {
      console.error('Set theme error:', error);
    }
  },

  setColorScheme: async (scheme) => {
    try {
      await AsyncStorage.setItem('colorScheme', scheme);
      set({ colorScheme: scheme });
    } catch (error) {
      console.error('Set color scheme error:', error);
    }
  },

  setFontSize: async (size) => {
    try {
      await AsyncStorage.setItem('fontSize', size);
      set({ fontSize: size });
    } catch (error) {
      console.error('Set font size error:', error);
    }
  },

  setSourceLanguage: async (language) => {
    try {
      await AsyncStorage.setItem('sourceLanguage', language);
      set({ sourceLanguage: language });
      if (language !== 'auto') {
        get().addRecentLanguage(language);
      }
    } catch (error) {
      console.error('Set source language error:', error);
    }
  },

  setTargetLanguage: async (language) => {
    try {
      await AsyncStorage.setItem('targetLanguage', language);
      set({ targetLanguage: language });
      get().addRecentLanguage(language);
    } catch (error) {
      console.error('Set target language error:', error);
    }
  },

  addRecentLanguage: async (language) => {
    try {
      const { recentLanguages } = get();
      const updated = [language, ...recentLanguages.filter(l => l !== language)].slice(0, 5);
      await AsyncStorage.setItem('recentLanguages', JSON.stringify(updated));
      set({ recentLanguages: updated });
    } catch (error) {
      console.error('Add recent language error:', error);
    }
  },

  setAutoPlayTranslation: async (enabled) => {
    try {
      await AsyncStorage.setItem('autoPlayTranslation', JSON.stringify(enabled));
      set({ autoPlayTranslation: enabled });
    } catch (error) {
      console.error('Set auto play error:', error);
    }
  },

  setSaveHistory: async (enabled) => {
    try {
      await AsyncStorage.setItem('saveHistory', JSON.stringify(enabled));
      set({ saveHistory: enabled });
    } catch (error) {
      console.error('Set save history error:', error);
    }
  },

  setHapticFeedback: async (enabled) => {
    try {
      await AsyncStorage.setItem('hapticFeedback', JSON.stringify(enabled));
      set({ hapticFeedback: enabled });
    } catch (error) {
      console.error('Set haptic feedback error:', error);
    }
  },

  setVadSensitivity: async (sensitivity) => {
    try {
      await AsyncStorage.setItem('vadSensitivity', sensitivity);
      set({ vadSensitivity: sensitivity });
    } catch (error) {
      console.error('Set VAD sensitivity error:', error);
    }
  },

  setTranslationProvider: async (provider) => {
    try {
      await AsyncStorage.setItem('translationProvider', provider);
      set({ translationProvider: provider });
    } catch (error) {
      console.error('Set translation provider error:', error);
    }
  },

  setDeeplApiKey: async (key) => {
    try {
      await AsyncStorage.setItem('deeplApiKey', key);
      set({ deeplApiKey: key });
    } catch (error) {
      console.error('Set DeepL API key error:', error);
    }
  },

  setConverseTts: async (enabled) => {
    try {
      await AsyncStorage.setItem('converseTts', JSON.stringify(enabled));
      set({ converseTts: enabled });
    } catch (error) {
      console.error('Set converse TTS error:', error);
    }
  },

  setFaceToFaceMode: async (enabled) => {
    try {
      await AsyncStorage.setItem('faceToFaceMode', JSON.stringify(enabled));
      set({ faceToFaceMode: enabled });
    } catch (error) {
      console.error('Set face to face mode error:', error);
    }
  },

  loadSettings: async () => {
    try {
      const settings = await AsyncStorage.multiGet([
        'theme',
        'colorScheme',
        'fontSize',
        'sourceLanguage',
        'targetLanguage',
        'autoPlayTranslation',
        'saveHistory',
        'hapticFeedback',
        'vadSensitivity',
        'translationProvider',
        'deeplApiKey',
        'converseTts',
        'faceToFaceMode',
        'recentLanguages',
      ]);

      const loadedSettings: Partial<AppSettings> & { recentLanguages?: string[] } = {};

      settings.forEach(([key, value]) => {
        if (value) {
          if (key === 'autoPlayTranslation' || key === 'saveHistory' || key === 'hapticFeedback' || key === 'converseTts' || key === 'faceToFaceMode' || key === 'recentLanguages') {
            (loadedSettings as Record<string, unknown>)[key] = JSON.parse(value);
          } else {
            (loadedSettings as Record<string, unknown>)[key] = value;
          }
        }
      });

      set({ ...defaultSettings, recentLanguages: [], ...loadedSettings, isLoading: false });
    } catch (error) {
      console.error('Load settings error:', error);
      set({ isLoading: false });
    }
  },

  getEffectiveTheme: () => {
    const { theme } = get();
    if (theme === 'system') {
      return 'light';
    }
    return theme;
  },
}));

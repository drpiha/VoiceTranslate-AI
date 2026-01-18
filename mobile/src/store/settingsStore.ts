import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings } from '../types';
import { useColorScheme } from 'react-native';

interface SettingsState extends AppSettings {
  isLoading: boolean;
  
  setTheme: (theme: 'light' | 'dark' | 'system') => Promise<void>;
  setSourceLanguage: (language: string) => Promise<void>;
  setTargetLanguage: (language: string) => Promise<void>;
  setAutoPlayTranslation: (enabled: boolean) => Promise<void>;
  setSaveHistory: (enabled: boolean) => Promise<void>;
  setHapticFeedback: (enabled: boolean) => Promise<void>;
  loadSettings: () => Promise<void>;
  getEffectiveTheme: () => 'light' | 'dark';
}

const defaultSettings: AppSettings = {
  theme: 'system',
  sourceLanguage: 'auto',
  targetLanguage: 'es',
  autoPlayTranslation: true,
  saveHistory: true,
  hapticFeedback: true,
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaultSettings,
  isLoading: true,
  
  setTheme: async (theme) => {
    try {
      await AsyncStorage.setItem('theme', theme);
      set({ theme });
    } catch (error) {
      console.error('Set theme error:', error);
    }
  },
  
  setSourceLanguage: async (language) => {
    try {
      await AsyncStorage.setItem('sourceLanguage', language);
      set({ sourceLanguage: language });
    } catch (error) {
      console.error('Set source language error:', error);
    }
  },
  
  setTargetLanguage: async (language) => {
    try {
      await AsyncStorage.setItem('targetLanguage', language);
      set({ targetLanguage: language });
    } catch (error) {
      console.error('Set target language error:', error);
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
  
  loadSettings: async () => {
    try {
      const settings = await AsyncStorage.multiGet([
        'theme',
        'sourceLanguage',
        'targetLanguage',
        'autoPlayTranslation',
        'saveHistory',
        'hapticFeedback',
      ]);
      
      const loadedSettings: Partial<AppSettings> = {};
      
      settings.forEach(([key, value]) => {
        if (value) {
          if (key === 'autoPlayTranslation' || key === 'saveHistory' || key === 'hapticFeedback') {
            loadedSettings[key] = JSON.parse(value);
          } else {
            (loadedSettings as Record<string, unknown>)[key] = value;
          }
        }
      });
      
      set({ ...defaultSettings, ...loadedSettings, isLoading: false });
    } catch (error) {
      console.error('Load settings error:', error);
      set({ isLoading: false });
    }
  },
  
  getEffectiveTheme: () => {
    const { theme } = get();
    if (theme === 'system') {
      // This would need to be called from a component context
      return 'light'; // default
    }
    return theme;
  },
}));

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Translation } from '../types';

const PAGE_SIZE = 20; // Sayfa başına öğe sayısı
const MAX_HISTORY_ITEMS = 500; // Maksimum saklanacak çeviri sayısı

interface HistoryState {
  translations: Translation[];
  isLoading: boolean;
  searchQuery: string;
  currentPage: number;
  hasMore: boolean;

  addTranslation: (translation: Omit<Translation, 'id' | 'timestamp'>) => Promise<void>;
  removeTranslation: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  loadHistory: () => Promise<void>;
  loadMoreHistory: () => void;
  setSearchQuery: (query: string) => void;
  getFilteredTranslations: () => Translation[];
  getPaginatedTranslations: () => Translation[];
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  translations: [],
  isLoading: true,
  searchQuery: '',
  currentPage: 1,
  hasMore: false,
  
  addTranslation: async (translation) => {
    try {
      const newTranslation: Translation = {
        ...translation,
        id: Date.now().toString(),
        timestamp: Date.now(),
      };

      // Maksimum sayıyı aşmamak için eski çevirileri sil
      let translations = [newTranslation, ...get().translations];
      if (translations.length > MAX_HISTORY_ITEMS) {
        translations = translations.slice(0, MAX_HISTORY_ITEMS);
      }

      await AsyncStorage.setItem('translations', JSON.stringify(translations));
      set({
        translations,
        hasMore: translations.length > PAGE_SIZE * get().currentPage,
      });
    } catch (error) {
      console.error('Add translation error:', error);
    }
  },
  
  removeTranslation: async (id) => {
    try {
      const translations = get().translations.filter(t => t.id !== id);
      await AsyncStorage.setItem('translations', JSON.stringify(translations));
      set({ translations });
    } catch (error) {
      console.error('Remove translation error:', error);
    }
  },
  
  toggleFavorite: async (id) => {
    try {
      const translations = get().translations.map(t =>
        t.id === id ? { ...t, isFavorite: !t.isFavorite } : t
      );
      await AsyncStorage.setItem('translations', JSON.stringify(translations));
      set({ translations });
    } catch (error) {
      console.error('Toggle favorite error:', error);
    }
  },
  
  clearHistory: async () => {
    try {
      await AsyncStorage.removeItem('translations');
      set({ translations: [] });
    } catch (error) {
      console.error('Clear history error:', error);
    }
  },
  
  loadHistory: async () => {
    try {
      const translationsStr = await AsyncStorage.getItem('translations');
      if (translationsStr) {
        const translations = JSON.parse(translationsStr);
        set({
          translations,
          isLoading: false,
          currentPage: 1,
          hasMore: translations.length > PAGE_SIZE,
        });
      } else {
        set({ isLoading: false, currentPage: 1, hasMore: false });
      }
    } catch (error) {
      console.error('Load history error:', error);
      set({ isLoading: false });
    }
  },

  loadMoreHistory: () => {
    const { translations, currentPage } = get();
    const nextPage = currentPage + 1;
    const hasMore = translations.length > PAGE_SIZE * nextPage;
    set({ currentPage: nextPage, hasMore });
  },

  setSearchQuery: (query) => set({ searchQuery: query, currentPage: 1 }),

  getFilteredTranslations: () => {
    const { translations, searchQuery } = get();
    if (!searchQuery) return translations;

    const query = searchQuery.toLowerCase();
    return translations.filter(t =>
      t.sourceText.toLowerCase().includes(query) ||
      t.translatedText.toLowerCase().includes(query)
    );
  },

  getPaginatedTranslations: () => {
    const { searchQuery, currentPage } = get();
    const filtered = get().getFilteredTranslations();
    return filtered.slice(0, PAGE_SIZE * currentPage);
  },
}));

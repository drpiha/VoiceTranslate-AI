import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ConversationTurn {
  id: string;
  speaker: 'A' | 'B';
  originalText: string;
  translatedText: string;
  originalLang: string;
  translatedLang: string;
  timestamp: Date;
  isFinal: boolean;
}

interface ConversationState {
  // Language selections (persisted)
  personALang: string;
  personBLang: string;

  // Conversation turns (ephemeral - not persisted)
  turns: ConversationTurn[];
  currentTurn: ConversationTurn | null;

  // Active state
  activeSpeaker: 'A' | 'B' | null;
  isListening: boolean;
  isProcessing: boolean;
  isConnected: boolean;

  // Actions
  setPersonALang: (lang: string) => Promise<void>;
  setPersonBLang: (lang: string) => Promise<void>;
  setActiveSpeaker: (speaker: 'A' | 'B' | null) => void;
  setIsListening: (listening: boolean) => void;
  setIsProcessing: (processing: boolean) => void;
  setIsConnected: (connected: boolean) => void;
  addTurn: (turn: ConversationTurn) => void;
  setCurrentTurn: (turn: ConversationTurn | null) => void;
  finalizeTurn: (turn: ConversationTurn) => void;
  clearConversation: () => void;
  loadLanguages: () => Promise<void>;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  personALang: 'tr',
  personBLang: 'en',
  turns: [],
  currentTurn: null,
  activeSpeaker: null,
  isListening: false,
  isProcessing: false,
  isConnected: false,

  setPersonALang: async (lang: string) => {
    try {
      await AsyncStorage.setItem('conversation_personALang', lang);
      set({ personALang: lang });
    } catch (error) {
      console.error('Failed to save Person A language:', error);
    }
  },

  setPersonBLang: async (lang: string) => {
    try {
      await AsyncStorage.setItem('conversation_personBLang', lang);
      set({ personBLang: lang });
    } catch (error) {
      console.error('Failed to save Person B language:', error);
    }
  },

  setActiveSpeaker: (speaker) => set({ activeSpeaker: speaker }),
  setIsListening: (listening) => set({ isListening: listening }),
  setIsProcessing: (processing) => set({ isProcessing: processing }),
  setIsConnected: (connected) => set({ isConnected: connected }),

  addTurn: (turn) => set((state) => ({
    turns: [...state.turns, turn],
    currentTurn: null,
  })),

  setCurrentTurn: (turn) => set({ currentTurn: turn }),

  finalizeTurn: (turn) => set((state) => {
    // Prevent duplicate finalized turns
    if (state.turns.some(t => t.id === turn.id)) {
      return state;
    }
    return {
      turns: [...state.turns, { ...turn, isFinal: true }],
      currentTurn: null,
    };
  }),

  clearConversation: () => set({
    turns: [],
    currentTurn: null,
    activeSpeaker: null,
    isListening: false,
    isProcessing: false,
  }),

  loadLanguages: async () => {
    try {
      const [personALang, personBLang] = await Promise.all([
        AsyncStorage.getItem('conversation_personALang'),
        AsyncStorage.getItem('conversation_personBLang'),
      ]);
      set({
        personALang: personALang || 'tr',
        personBLang: personBLang || 'en',
      });
    } catch (error) {
      console.error('Failed to load conversation languages:', error);
    }
  },
}));

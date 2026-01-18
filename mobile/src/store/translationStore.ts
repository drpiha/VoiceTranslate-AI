import { create } from 'zustand';

interface TranslationState {
  isRecording: boolean;
  isProcessing: boolean;
  sourceLanguage: string;
  targetLanguage: string;
  sourceText: string;
  translatedText: string;
  detectedLanguage?: string;
  error: string | null;
  
  setRecording: (isRecording: boolean) => void;
  setProcessing: (isProcessing: boolean) => void;
  setSourceLanguage: (language: string) => void;
  setTargetLanguage: (language: string) => void;
  swapLanguages: () => void;
  setSourceText: (text: string) => void;
  setTranslatedText: (text: string) => void;
  setDetectedLanguage: (language?: string) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useTranslationStore = create<TranslationState>((set, get) => ({
  isRecording: false,
  isProcessing: false,
  sourceLanguage: 'auto',
  targetLanguage: 'es',
  sourceText: '',
  translatedText: '',
  detectedLanguage: undefined,
  error: null,
  
  setRecording: (isRecording) => set({ isRecording }),
  setProcessing: (isProcessing) => set({ isProcessing }),
  setSourceLanguage: (language) => set({ sourceLanguage: language }),
  setTargetLanguage: (language) => set({ targetLanguage: language }),
  
  swapLanguages: () => {
    const { sourceLanguage, targetLanguage, sourceText, translatedText } = get();
    if (sourceLanguage === 'auto') return;
    
    set({
      sourceLanguage: targetLanguage,
      targetLanguage: sourceLanguage,
      sourceText: translatedText,
      translatedText: sourceText,
    });
  },
  
  setSourceText: (text) => set({ sourceText: text }),
  setTranslatedText: (text) => set({ translatedText: text }),
  setDetectedLanguage: (language) => set({ detectedLanguage: language }),
  setError: (error) => set({ error }),
  
  reset: () => set({
    isRecording: false,
    isProcessing: false,
    sourceText: '',
    translatedText: '',
    detectedLanguage: undefined,
    error: null,
  }),
}));

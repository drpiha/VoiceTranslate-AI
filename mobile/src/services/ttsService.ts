/**
 * TTS Service - Uses backend Edge TTS with expo-speech fallback.
 * Backend provides free, high-quality Microsoft Neural voices.
 */

import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system/legacy';
import { apiClient } from './api';

let currentSound: Audio.Sound | null = null;

/**
 * Speak text using backend Edge TTS (high quality).
 * Falls back to expo-speech (device TTS) if backend fails.
 */
export async function speak(
  text: string,
  language: string,
  options?: { gender?: 'MALE' | 'FEMALE'; rate?: number; voiceName?: string }
): Promise<void> {
  if (!text || text.trim().length === 0) return;

  // Stop any currently playing audio
  await stop();

  try {
    // Try backend Edge TTS first
    const response = await apiClient.post<{
      success: boolean;
      data: { audioContent: string; audioEncoding: string; durationMs: number; voiceUsed: string };
    }>('/translate/tts', {
      text: text.substring(0, 5000),
      language,
      gender: options?.gender,
      rate: options?.rate,
      voiceName: options?.voiceName,
    });

    if (response.success && response.data?.audioContent) {
      const base64Audio = response.data.audioContent;

      // Write base64 audio to temp file and play with expo-av
      const fileUri = FileSystem.cacheDirectory + `tts_${Date.now()}.mp3`;
      await FileSystem.writeAsStringAsync(fileUri, base64Audio, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: fileUri },
        { shouldPlay: true }
      );

      currentSound = sound;

      // Clean up when playback finishes
      sound.setOnPlaybackStatusUpdate((status) => {
        if ('didJustFinish' in status && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          currentSound = null;
          // Clean up temp file
          FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
        }
      });

      return;
    }
  } catch (error) {
    // Backend TTS failed, fall through to expo-speech
    console.warn('Backend TTS failed, using device TTS:', (error as Error).message);
  }

  // Fallback: use expo-speech (device-native TTS)
  try {
    Speech.stop();
    Speech.speak(text, {
      language,
      rate: options?.rate ?? 0.95,
    });
  } catch (e) {
    console.error('Fallback TTS also failed:', e);
  }
}

/**
 * Stop any currently playing TTS audio.
 */
export async function stop(): Promise<void> {
  try {
    if (currentSound) {
      await currentSound.stopAsync();
      await currentSound.unloadAsync();
      currentSound = null;
    }
  } catch {
    currentSound = null;
  }

  try {
    Speech.stop();
  } catch {
    // ignore
  }
}

/**
 * Check if TTS is currently playing.
 */
export function isPlaying(): boolean {
  return currentSound !== null;
}

/**
 * Get available voices for a language.
 */
export async function getVoices(language?: string): Promise<any[]> {
  try {
    const response = await apiClient.get<{
      success: boolean;
      data: { voices: any[]; total: number };
    }>('/translate/voices', {
      params: { language },
    });

    if (response.success && response.data?.voices) {
      return response.data.voices;
    }

    return [];
  } catch (error) {
    console.error('Failed to get voices:', error);
    return [];
  }
}

export const ttsService = { speak, stop, isPlaying, getVoices };

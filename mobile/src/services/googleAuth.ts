/**
 * Google Authentication Service
 * Handles Google Sign-In for mobile and web platforms
 */

import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { apiClient } from './api';

// Complete any pending auth sessions
WebBrowser.maybeCompleteAuthSession();

// Google OAuth Configuration
// To enable Google Auth on mobile:
// 1. Create a project in Google Cloud Console
// 2. Create OAuth 2.0 credentials for Android (with SHA-1) and iOS
// 3. Add the client IDs below
export const GOOGLE_AUTH_CONFIG = {
  // Web client ID - Required for all platforms
  webClientId: '182940512892-dhci3lvnjmo6748kt9495vsv8o3g2kg7.apps.googleusercontent.com',
  // Android client ID - Get from Google Cloud Console with your SHA-1 fingerprint
  androidClientId: '182940512892-um065l5i195qfkedjjh7kdcfb16al3jj.apps.googleusercontent.com',
  // iOS client ID - Get from Google Cloud Console
  iosClientId: undefined as string | undefined,
  // Expo client ID for Expo Go development
  expoClientId: '182940512892-dhci3lvnjmo6748kt9495vsv8o3g2kg7.apps.googleusercontent.com',
};

/**
 * Check if Google Auth is configured for the current platform
 * For production builds: Android needs androidClientId, iOS needs iosClientId
 */
export const isGoogleAuthConfigured = (): boolean => {
  if (Platform.OS === 'web') {
    return !!GOOGLE_AUTH_CONFIG.webClientId;
  }
  if (Platform.OS === 'android') {
    // Android standalone builds REQUIRE androidClientId
    // webClientId alone is NOT sufficient for production APK
    return !!GOOGLE_AUTH_CONFIG.androidClientId;
  }
  if (Platform.OS === 'ios') {
    // iOS standalone builds require iosClientId
    return !!GOOGLE_AUTH_CONFIG.iosClientId;
  }
  return false;
};

/**
 * Check if Google Auth is properly configured for the current platform (production builds)
 */
const isPlatformConfigured = (): boolean => {
  if (Platform.OS === 'android') {
    // Android standalone builds REQUIRE androidClientId
    return !!GOOGLE_AUTH_CONFIG.androidClientId;
  }
  if (Platform.OS === 'ios') {
    // iOS needs iosClientId for standalone builds
    return !!GOOGLE_AUTH_CONFIG.iosClientId;
  }
  // Web can use webClientId
  return !!GOOGLE_AUTH_CONFIG.webClientId;
};

/**
 * Null hook for unconfigured platforms - prevents crash
 */
const useNullGoogleAuth = () => ({
  request: null as null,
  response: null as null,
  promptAsync: async () => ({ type: 'dismiss' as const }),
});

/**
 * Check if running in Expo Go (development) vs standalone build (production)
 */
const isExpoGo = (): boolean => {
  // In Expo Go, Constants.appOwnership is 'expo'
  // In standalone builds, it's 'standalone' or undefined
  try {
    const Constants = require('expo-constants').default;
    return Constants.appOwnership === 'expo';
  } catch {
    return false;
  }
};

/**
 * Real Google Auth hook - only used when properly configured
 */
const useRealGoogleAuth = () => {
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_AUTH_CONFIG.webClientId,
    androidClientId: GOOGLE_AUTH_CONFIG.androidClientId,
    iosClientId: GOOGLE_AUTH_CONFIG.iosClientId,
    expoClientId: GOOGLE_AUTH_CONFIG.expoClientId,
    // For standalone builds, we need to specify the redirect URI
    redirectUri: Platform.OS === 'android'
      ? 'com.voicetranslate.ai:/oauth2redirect'
      : undefined,
  });

  // Wrap promptAsync - use proxy only in Expo Go
  const wrappedPromptAsync = async (options?: any) => {
    const shouldUseProxy = isExpoGo();
    console.log('Google Auth: useProxy =', shouldUseProxy);
    return promptAsync({
      ...options,
      useProxy: shouldUseProxy,
    });
  };

  return { request, response, promptAsync: wrappedPromptAsync };
};

/**
 * Get the Google Auth request configuration
 * Uses null hook if platform is not properly configured to prevent crashes
 */
export const useGoogleAuth = isPlatformConfigured() ? useRealGoogleAuth : useNullGoogleAuth;

/**
 * Get Google user info from access token
 */
export const getGoogleUserInfo = async (accessToken: string) => {
  try {
    const response = await fetch('https://www.googleapis.com/userinfo/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch Google user info');
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to get Google user info:', error);
    throw error;
  }
};

/**
 * Exchange Google token with backend for app tokens
 */
export const authenticateWithBackend = async (token: string, tokenType: 'id_token' | 'access_token') => {
  try {
    const payload = tokenType === 'id_token'
      ? { idToken: token }
      : { accessToken: token };

    console.log('Sending to backend:', { tokenType, payloadKeys: Object.keys(payload) });

    const response = await apiClient.post('/auth/google', payload);

    return response.data || response;
  } catch (error: any) {
    console.error('Backend Google auth failed:', error);
    throw new Error(error.response?.data?.error || 'Google authentication failed');
  }
};

/**
 * Complete Google Sign-In flow
 * 1. Get token from Google (ID token or access token)
 * 2. Send to backend for verification and user creation/login
 * 3. Return user and tokens
 */
export const completeGoogleSignIn = async (authentication: {
  accessToken?: string;
  idToken?: string;
}) => {
  console.log('completeGoogleSignIn - tokens available:', {
    hasIdToken: !!authentication.idToken,
    hasAccessToken: !!authentication.accessToken,
  });

  // Prefer ID token, but fall back to access token (common on web)
  if (authentication.idToken) {
    const result = await authenticateWithBackend(authentication.idToken, 'id_token');
    return {
      user: result.user,
      tokens: result.tokens,
      isNewUser: result.isNewUser || false,
    };
  }

  if (authentication.accessToken) {
    const result = await authenticateWithBackend(authentication.accessToken, 'access_token');
    return {
      user: result.user,
      tokens: result.tokens,
      isNewUser: result.isNewUser || false,
    };
  }

  throw new Error('No valid token received from Google');
};

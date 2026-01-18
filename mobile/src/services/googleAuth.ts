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
  androidClientId: undefined as string | undefined,
  // iOS client ID - Get from Google Cloud Console
  iosClientId: undefined as string | undefined,
  // Expo client ID for Expo Go development
  expoClientId: '182940512892-dhci3lvnjmo6748kt9495vsv8o3g2kg7.apps.googleusercontent.com',
};

/**
 * Check if Google Auth is configured for the current platform
 */
export const isGoogleAuthConfigured = (): boolean => {
  if (Platform.OS === 'web') {
    return !!GOOGLE_AUTH_CONFIG.webClientId;
  }
  if (Platform.OS === 'android') {
    // On Android with Expo Go, we can use webClientId
    return !!GOOGLE_AUTH_CONFIG.webClientId || !!GOOGLE_AUTH_CONFIG.androidClientId;
  }
  if (Platform.OS === 'ios') {
    return !!GOOGLE_AUTH_CONFIG.iosClientId || !!GOOGLE_AUTH_CONFIG.webClientId;
  }
  return false;
};

/**
 * Get the Google Auth request configuration
 */
export const useGoogleAuth = () => {
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_AUTH_CONFIG.webClientId,
    androidClientId: GOOGLE_AUTH_CONFIG.androidClientId,
    iosClientId: GOOGLE_AUTH_CONFIG.iosClientId,
    expoClientId: GOOGLE_AUTH_CONFIG.expoClientId,
  });

  return { request, response, promptAsync };
};

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

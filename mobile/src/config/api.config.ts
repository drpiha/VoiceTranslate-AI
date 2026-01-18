/**
 * API Configuration
 *
 * Update PRODUCTION_API_URL after deploying backend to Railway
 */

// =============================================================================
// PRODUCTION URL - UPDATE THIS AFTER RAILWAY DEPLOYMENT
// =============================================================================
// After deploying to Railway, you'll get a URL like:
// https://voicetranslate-backend-production.up.railway.app
//
// Update this variable with your actual Railway URL:
export const PRODUCTION_API_URL = 'https://voicetranslate-backend.onrender.com';

// =============================================================================
// DO NOT MODIFY BELOW THIS LINE
// =============================================================================

import { Platform } from 'react-native';

// Check if running in development mode
const isDevelopment = __DEV__;

// Local development configuration
const DEV_CONFIG = {
  // For web browser
  web: {
    api: 'http://localhost:3001/api',
    ws: 'ws://localhost:3001/ws',
  },
  // For Android emulator (10.0.2.2 = host machine)
  android: {
    api: 'http://10.0.2.2:3001/api',
    ws: 'ws://10.0.2.2:3001/ws',
  },
  // For iOS simulator
  ios: {
    api: 'http://localhost:3001/api',
    ws: 'ws://localhost:3001/ws',
  },
  // For physical device - use your computer's local IP
  // Find it with: ipconfig (Windows) or ifconfig (Mac/Linux)
  physical: {
    api: 'http://192.168.0.187:3001/api',
    ws: 'ws://192.168.0.187:3001/ws',
  },
};

// Production configuration
const PROD_CONFIG = {
  api: `${PRODUCTION_API_URL}/api`,
  ws: PRODUCTION_API_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws',
};

/**
 * Get the appropriate API base URL based on environment and platform
 */
export function getApiBaseUrl(): string {
  if (isDevelopment) {
    if (Platform.OS === 'web') {
      return DEV_CONFIG.web.api;
    }
    // For development on physical devices, use the physical config
    // For emulators, use platform-specific config
    if (Platform.OS === 'android') {
      // Check if running on emulator or physical device
      // Physical devices need the local IP, emulators use 10.0.2.2
      return DEV_CONFIG.physical.api; // Default to physical for testing
    }
    return DEV_CONFIG.ios.api;
  }
  return PROD_CONFIG.api;
}

/**
 * Get the appropriate WebSocket URL based on environment and platform
 */
export function getWebSocketBaseUrl(): string {
  if (isDevelopment) {
    if (Platform.OS === 'web') {
      return DEV_CONFIG.web.ws;
    }
    if (Platform.OS === 'android') {
      return DEV_CONFIG.physical.ws; // Default to physical for testing
    }
    return DEV_CONFIG.ios.ws;
  }
  return PROD_CONFIG.ws;
}

/**
 * Export configuration for debugging
 */
export const apiConfig = {
  isDevelopment,
  apiUrl: getApiBaseUrl(),
  wsUrl: getWebSocketBaseUrl(),
  productionUrl: PRODUCTION_API_URL,
};

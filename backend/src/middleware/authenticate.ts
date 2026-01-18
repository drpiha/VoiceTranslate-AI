/**
 * =============================================================================
 * Authentication Middleware
 * =============================================================================
 * Re-export authentication middleware for route usage.
 * Provides convenient access to auth functions.
 * =============================================================================
 */

// Re-export authentication functions from the auth plugin
export {
  authenticate,
  authenticateOptional,
  requireSubscription,
  requirePremium,
  requireBasic,
  extractDeviceInfo,
  setAuthCookies,
  clearAuthCookies,
} from '../plugins/auth.plugin.js';

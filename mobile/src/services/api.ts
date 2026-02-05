import axios, { AxiosInstance, AxiosError } from 'axios';
import { Platform } from 'react-native';
import { getApiBaseUrl } from '../config/api.config';

const API_BASE_URL = getApiBaseUrl();

const TOKEN_KEY = 'vt_access_token';
const REFRESH_KEY = 'vt_refresh_token';

// Cross-platform token storage (works on web and native)
// Helper to decode JWT and check expiration
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    // Check if token expires in less than 60 seconds
    return payload.exp * 1000 < Date.now() + 60000;
  } catch {
    return true;
  }
}

export const tokenStorage = {
  async getAccessToken(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return localStorage.getItem(TOKEN_KEY);
      }
      const SecureStore = require('expo-secure-store');
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch { return null; }
  },
  async getRefreshToken(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return localStorage.getItem(REFRESH_KEY);
      }
      const SecureStore = require('expo-secure-store');
      return await SecureStore.getItemAsync(REFRESH_KEY);
    } catch { return null; }
  },
  async setTokens(access: string, refresh: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(TOKEN_KEY, access);
      localStorage.setItem(REFRESH_KEY, refresh);
    } else {
      const SecureStore = require('expo-secure-store');
      await SecureStore.setItemAsync(TOKEN_KEY, access);
      await SecureStore.setItemAsync(REFRESH_KEY, refresh);
    }
  },
  async clearTokens(): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
    } else {
      const SecureStore = require('expo-secure-store');
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_KEY);
    }
  },

  // Get a valid access token, refreshing if expired
  // Returns the existing token even if refresh fails (keeps user logged in)
  async getValidAccessToken(): Promise<string | null> {
    const accessToken = await this.getAccessToken();

    if (!accessToken) {
      console.log('No access token found');
      return null;
    }

    // Check if token is expired or about to expire
    if (!isTokenExpired(accessToken)) {
      return accessToken;
    }

    console.log('Access token expired, attempting refresh...');

    // Try to refresh the token
    const refreshToken = await this.getRefreshToken();
    if (!refreshToken) {
      console.log('No refresh token available');
      // Still return expired access token - let API calls handle the 401
      return accessToken;
    }

    try {
      // Add timeout for refresh request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.log('Token refresh failed:', response.status);
        // Only clear tokens on explicit auth rejection (401/403)
        if (response.status === 401 || response.status === 403) {
          await this.clearTokens();
          return null;
        }
        // Server error - keep existing token
        return accessToken;
      }

      const data = await response.json();
      const newTokens = data.data?.tokens || data.tokens;

      if (newTokens?.accessToken && newTokens?.refreshToken) {
        await this.setTokens(newTokens.accessToken, newTokens.refreshToken);
        console.log('Token refreshed successfully');
        return newTokens.accessToken;
      }

      console.log('Invalid refresh response, keeping existing token');
      return accessToken;
    } catch (error: any) {
      // Network error or timeout - keep existing token, don't log out user
      console.log('Token refresh network error (keeping session):', error.message);
      return accessToken;
    }
  },
};

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.client.interceptors.request.use(async (config) => {
      // Use getValidAccessToken to automatically refresh if expired
      const token = await tokenStorage.getValidAccessToken();
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        // If 401 and we haven't retried yet, try refreshing the token
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            // Try to get a fresh token
            const newToken = await tokenStorage.getValidAccessToken();
            if (newToken) {
              // Retry the original request with the new token
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              return this.client(originalRequest);
            }
          } catch (refreshError) {
            console.log('Token refresh failed during retry');
          }

          // If refresh failed, clear tokens
          await tokenStorage.clearTokens();
        }
        return Promise.reject(error);
      }
    );
  }

  get<T>(url: string, params?: object): Promise<T> {
    return this.client.get<T>(url, { params }).then(r => r.data);
  }
  post<T>(url: string, data?: object): Promise<T> {
    return this.client.post<T>(url, data).then(r => r.data);
  }
  put<T>(url: string, data?: object): Promise<T> {
    return this.client.put<T>(url, data).then(r => r.data);
  }
  delete<T>(url: string): Promise<T> {
    return this.client.delete<T>(url).then(r => r.data);
  }
}

export const apiClient = new ApiClient();
export { API_BASE_URL };

// Auth API helpers - handle wrapped response format { success, data: { user, tokens } }
export const authAPI = {
  async login(email: string, password: string) {
    const response = await apiClient.post<{ success: boolean; data: { user: any; tokens: { accessToken: string; refreshToken: string } } }>('/auth/login', { email, password });
    const { user, tokens } = response.data;
    return { user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  },
  async register(name: string, email: string, password: string) {
    const response = await apiClient.post<{ success: boolean; data: { user: any; tokens: { accessToken: string; refreshToken: string } } }>('/auth/register', { name, email, password });
    const { user, tokens } = response.data;
    return { user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  },
  async refreshToken(refreshToken: string) {
    const response = await apiClient.post<{ success: boolean; data: { tokens: { accessToken: string; refreshToken: string } } }>('/auth/refresh', { refreshToken });
    const { tokens } = response.data;
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  },
};

// Subscription API helpers
export const subscriptionAPI = {
  async getPlans() {
    const response = await apiClient.get<{ success: boolean; data: { plans: any[] } }>('/subscription/plans');
    return response.data?.plans || response.data || [];
  },
  async subscribe(planId: string) {
    const response = await apiClient.post<{ success: boolean; data: any }>('/subscription/verify', {
      platform: 'apple',
      receiptData: 'mock-receipt-' + planId,
      productId: planId
    });
    return response.data || response;
  },
  async cancelSubscription() {
    return apiClient.post<{ success: boolean }>('/subscription/cancel', {});
  },
};

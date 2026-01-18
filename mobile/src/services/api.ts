import axios, { AxiosInstance, AxiosError } from 'axios';
import { Platform } from 'react-native';
import { getApiBaseUrl } from '../config/api.config';

const API_BASE_URL = getApiBaseUrl();

const TOKEN_KEY = 'vt_access_token';
const REFRESH_KEY = 'vt_refresh_token';

// Cross-platform token storage (works on web and native)
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
      const token = await tokenStorage.getAccessToken();
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
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

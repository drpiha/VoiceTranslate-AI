import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';
import { authAPI, tokenStorage } from '../services/api';

interface UserState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setUser: (user: User | null) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateSubscription: (tier: 'free' | 'premium', expiresAt?: number) => void;
  loadUser: () => Promise<void>;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: async (user) => {
    if (user) {
      await AsyncStorage.setItem('user', JSON.stringify(user));
    } else {
      await AsyncStorage.removeItem('user');
    }
    set({ user, isAuthenticated: !!user });
  },

  login: async (email, password) => {
    try {
      const response = await authAPI.login(email, password);
      const { user, accessToken, refreshToken } = response;

      await tokenStorage.setTokens(accessToken, refreshToken);
      await AsyncStorage.setItem('user', JSON.stringify(user));

      set({ user, isAuthenticated: true });
    } catch (error: any) {
      console.error('Login error:', error);
      throw new Error(error.response?.data?.message || 'Login failed. Please check your credentials.');
    }
  },

  register: async (name, email, password) => {
    try {
      const response = await authAPI.register(name, email, password);
      const { user, accessToken, refreshToken } = response;

      await tokenStorage.setTokens(accessToken, refreshToken);
      await AsyncStorage.setItem('user', JSON.stringify(user));

      set({ user, isAuthenticated: true });
    } catch (error: any) {
      console.error('Registration error:', error);
      throw new Error(error.response?.data?.message || 'Registration failed. Please try again.');
    }
  },

  logout: async () => {
    try {
      await tokenStorage.clearTokens();
      await AsyncStorage.removeItem('user');
      set({ user: null, isAuthenticated: false });
    } catch (error) {
      console.error('Logout error:', error);
    }
  },

  updateSubscription: (tier, expiresAt) => {
    set((state) => ({
      user: state.user ? {
        ...state.user,
        subscriptionTier: tier,
        subscriptionExpiresAt: expiresAt,
      } : null,
    }));
  },

  loadUser: async () => {
    try {
      const userStr = await AsyncStorage.getItem('user');

      if (!userStr) {
        console.log('No stored user found');
        set({ isLoading: false });
        return;
      }

      const user = JSON.parse(userStr);

      // Guest users don't need tokens
      if (user.id?.startsWith('guest-')) {
        console.log('Guest user session restored');
        set({ user, isAuthenticated: true, isLoading: false });
        return;
      }

      // Check if we have any token (access or refresh)
      const accessToken = await tokenStorage.getAccessToken();
      const refreshToken = await tokenStorage.getRefreshToken();

      // If we have stored user and any token, restore the session
      if (accessToken || refreshToken) {
        console.log('User session restored:', user.email);
        set({ user, isAuthenticated: true, isLoading: false });

        // Try to refresh token in background (don't block)
        tokenStorage.getValidAccessToken().catch(() => {
          console.log('Background token refresh failed, will retry on next API call');
        });
      } else {
        // No tokens at all, clear stored user
        console.log('No tokens found, clearing session');
        await AsyncStorage.removeItem('user');
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('Load user error:', error);
      set({ isLoading: false });
    }
  },
}));

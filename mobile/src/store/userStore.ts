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
      const token = await tokenStorage.getAccessToken();

      if (userStr && token) {
        const user = JSON.parse(userStr);
        set({ user, isAuthenticated: true, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('Load user error:', error);
      set({ isLoading: false });
    }
  },
}));

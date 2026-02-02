import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createTheme } from '../../src/constants/theme';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useUserStore } from '../../src/store/userStore';
import { Button } from '../../src/components/Button';
import {
  useGoogleAuth,
  isGoogleAuthConfigured,
  completeGoogleSignIn,
  GOOGLE_AUTH_CONFIG,
} from '../../src/services/googleAuth';
import { tokenStorage } from '../../src/services/api';

const OAUTH_RESPONSE_KEY = '@oauth_response';
const CODE_VERIFIER_KEY = '@code_verifier';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [authProcessing, setAuthProcessing] = useState(false);
  const authProcessingRef = useRef(false); // Ref for immediate synchronous checking
  const colorScheme = useColorScheme();
  const { theme: themePreference } = useSettingsStore();
  const { login, setUser } = useUserStore();
  const isDark = themePreference === 'dark' || (themePreference === 'system' && colorScheme === 'dark');
  const theme = createTheme(isDark);

  // Google Auth hook
  const { request, response, promptAsync } = useGoogleAuth();
  const googleAuthEnabled = isGoogleAuthConfigured();

  // Logo animation
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const formSlide = useRef(new Animated.Value(30)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(formSlide, { toValue: 0, duration: 500, delay: 200, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(formOpacity, { toValue: 1, duration: 500, delay: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  // Check for stored OAuth response from redirect page
  useEffect(() => {
    const checkStoredOAuthResponse = async () => {
      try {
        const storedResponse = await AsyncStorage.getItem(OAUTH_RESPONSE_KEY);
        const storedCodeVerifier = await AsyncStorage.getItem(CODE_VERIFIER_KEY);

        if (storedResponse && storedCodeVerifier) {
          const { code, timestamp } = JSON.parse(storedResponse);

          // Only process if response is less than 5 minutes old
          if (Date.now() - timestamp < 5 * 60 * 1000) {
            console.log('Found stored OAuth response, exchanging code...');
            setIsGoogleLoading(true);

            // Clear stored values
            await AsyncStorage.multiRemove([OAUTH_RESPONSE_KEY, CODE_VERIFIER_KEY]);

            // Exchange code for tokens
            await exchangeCodeForTokens(code, storedCodeVerifier);
          } else {
            // Clear expired response
            await AsyncStorage.multiRemove([OAUTH_RESPONSE_KEY, CODE_VERIFIER_KEY]);
          }
        }
      } catch (error) {
        console.error('Error checking stored OAuth response:', error);
      }
    };

    checkStoredOAuthResponse();
  }, []);

  // Helper function for fetch with timeout
  const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number = 15000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Connection timed out. Please check your internet and try again.');
      }
      throw error;
    }
  };

  // Exchange authorization code for tokens
  const exchangeCodeForTokens = async (code: string, codeVerifier: string) => {
    try {
      console.log('Exchanging code for tokens...');

      const tokenResponse = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: GOOGLE_AUTH_CONFIG.androidClientId || GOOGLE_AUTH_CONFIG.webClientId,
          code: code,
          code_verifier: codeVerifier,
          grant_type: 'authorization_code',
          redirect_uri: 'com.voicetranslate.ai:/oauthredirect',
        }).toString(),
      }, 15000);

      const tokenData = await tokenResponse.json();
      console.log('Token exchange response:', {
        hasAccessToken: !!tokenData.access_token,
        hasIdToken: !!tokenData.id_token,
        error: tokenData.error,
      });

      if (tokenData.error) {
        throw new Error(tokenData.error_description || tokenData.error);
      }

      // Complete sign-in with the tokens
      await handleGoogleResponse({
        accessToken: tokenData.access_token,
        idToken: tokenData.id_token,
      });
    } catch (error: any) {
      console.error('Token exchange error:', error);
      Alert.alert('Google Sign-In Failed', error.message || 'Failed to complete sign-in. Please try again.');
      setIsGoogleLoading(false);
    }
  };

  // Handle Google auth response from hook
  useEffect(() => {
    console.log('Google auth response:', JSON.stringify(response, null, 2));

    if (response?.type === 'success') {
      console.log('Google auth SUCCESS - authentication:', response.authentication);
      handleGoogleResponse(response.authentication);
    } else if (response?.type === 'error') {
      console.error('Google auth error:', response.error);
      Alert.alert('Error', 'Google Sign-In failed. Please try again.');
      setIsGoogleLoading(false);
      authProcessingRef.current = false;
      setAuthProcessing(false);
    } else if (response?.type === 'dismiss') {
      console.log('Google auth dismissed by user');
      setIsGoogleLoading(false);
      authProcessingRef.current = false;
      setAuthProcessing(false);
    } else if (response) {
      console.log('Google auth response type:', response.type);
      setIsGoogleLoading(false);
      authProcessingRef.current = false;
      setAuthProcessing(false);
    }
  }, [response]);

  const handleGoogleResponse = async (authentication: any) => {
    console.log('handleGoogleResponse called with:', authentication);

    if (!authentication) {
      console.error('No authentication object received');
      setIsGoogleLoading(false);
      setAuthProcessing(false);
      authProcessingRef.current = false;
      return;
    }

    // Prevent duplicate processing using ref for immediate synchronous check
    if (authProcessingRef.current) {
      console.log('Auth already processing (ref check), skipping...');
      return;
    }

    // Set ref immediately (synchronous) and state (async)
    authProcessingRef.current = true;
    setAuthProcessing(true);

    try {
      console.log('Calling completeGoogleSignIn...');
      const result = await completeGoogleSignIn(authentication);
      console.log('completeGoogleSignIn result:', result);

      // Save tokens
      if (result.tokens) {
        await tokenStorage.setTokens(result.tokens.accessToken, result.tokens.refreshToken);
      }

      // Set user
      await setUser({
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        subscriptionTier: result.user.subscription || 'free',
      });

      if (result.isNewUser) {
        Alert.alert('Welcome!', 'Your account has been created successfully.');
      }

      router.replace('/(tabs)');
    } catch (error: any) {
      console.error('Google sign-in completion error:', error);
      // Don't show error for duplicate auth attempts
      if (!error.message?.includes('already in progress')) {
        Alert.alert('Error', error.message || 'Failed to complete Google Sign-In');
      }
      authProcessingRef.current = false;
      setAuthProcessing(false);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }
    if (!password.trim()) {
      Alert.alert('Error', 'Please enter your password');
      return;
    }

    try {
      setIsLoading(true);
      await login(email, password);
      router.replace('/(tabs)');
    } catch (error: any) {
      console.error('Login error:', error);
      Alert.alert(
        'Login Failed',
        error.message || 'Invalid credentials. Please check your email and password.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    const guestUser = {
      id: 'guest-' + Date.now(),
      email: 'guest@voicetranslate.ai',
      name: 'Guest User',
      subscriptionTier: 'free' as const,
    };
    await setUser(guestUser);
    router.replace('/(tabs)');
  };

  const handleSignUpPress = () => {
    router.push('/(auth)/signup');
  };

  const handleGoogleLogin = async () => {
    if (!request) {
      Alert.alert('Error', 'Google Sign-In is not available. Please try again later.');
      return;
    }

    // Open Google dialog immediately - no blocking health check
    // If server is down, the backend auth call will fail with a proper error
    setIsGoogleLoading(true);
    try {
      // Store codeVerifier for later use in redirect handling
      if (request.codeVerifier) {
        await AsyncStorage.setItem(CODE_VERIFIER_KEY, request.codeVerifier);
      }

      await promptAsync();
    } catch (error) {
      console.error('Google prompt error:', error);
      setIsGoogleLoading(false);
      Alert.alert('Error', 'Failed to start Google Sign-In');
    }
  };

  const handleForgotPassword = () => {
    Alert.prompt(
      'Reset Password',
      'Enter your email address to receive a password reset link:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async (inputEmail) => {
            if (!inputEmail?.trim()) {
              Alert.alert('Error', 'Please enter your email');
              return;
            }
            try {
              const { apiClient } = await import('../../src/services/api');
              await apiClient.post('/auth/forgot-password', { email: inputEmail.trim() });
              Alert.alert(
                'Email Sent',
                'If an account with that email exists, a password reset link has been sent.'
              );
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to send reset email');
            }
          },
        },
      ],
      'plain-text',
      email // Pre-fill with current email if any
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Premium header with large branding */}
        <LinearGradient
          colors={[theme.colors.gradient1, theme.colors.gradient2, theme.colors.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <Animated.View style={[styles.logoContainer, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
            <View style={styles.logoCircle}>
              <Text style={styles.logo}>🌐</Text>
            </View>
            <Text style={styles.appName}>VoiceTranslate AI</Text>
            <Text style={styles.tagline}>Break language barriers instantly</Text>
          </Animated.View>

          {/* Feature pills */}
          <View style={styles.featurePills}>
            <View style={styles.featurePill}>
              <Text style={styles.featurePillText}>Real-time</Text>
            </View>
            <View style={styles.featurePill}>
              <Text style={styles.featurePillText}>50+ Languages</Text>
            </View>
            <View style={styles.featurePill}>
              <Text style={styles.featurePillText}>AI Powered</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Animated form section */}
        <Animated.View style={[styles.form, { opacity: formOpacity, transform: [{ translateY: formSlide }] }]}>

          {/* Google Sign In Button - Primary CTA */}
          {googleAuthEnabled && (
            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleLogin}
              disabled={isGoogleLoading || !request}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#FFFFFF', '#F8F9FA']}
                style={styles.googleButtonInner}
              >
                {isGoogleLoading ? (
                  <ActivityIndicator color="#4285F4" />
                ) : (
                  <>
                    <View style={styles.googleIconContainer}>
                      <Text style={styles.googleIconG}>G</Text>
                    </View>
                    <Text style={styles.googleText}>Continue with Google</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          )}

          {/* Guest mode */}
          <TouchableOpacity onPress={handleGuestLogin} style={styles.guestButton} activeOpacity={0.7}>
            <Text style={[styles.guestButtonText, { color: theme.colors.primary }]}>
              Try without account
            </Text>
          </TouchableOpacity>

          {googleAuthEnabled && (
            <View style={styles.dividerContainer}>
              <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
              <Text style={[styles.dividerText, { color: theme.colors.textTertiary }]}>or sign in with email</Text>
              <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
            </View>
          )}

          {/* Email Input */}
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.surface,
                color: theme.colors.text,
                borderColor: theme.colors.border,
              },
            ]}
            placeholder="Email"
            placeholderTextColor={theme.colors.textTertiary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Password Input */}
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.surface,
                color: theme.colors.text,
                borderColor: theme.colors.border,
              },
            ]}
            placeholder="Password"
            placeholderTextColor={theme.colors.textTertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {/* Actions row */}
          <View style={styles.actionsRow}>
            <TouchableOpacity onPress={handleForgotPassword}>
              <Text style={[styles.forgotPasswordText, { color: theme.colors.textSecondary }]}>
                Forgot Password?
              </Text>
            </TouchableOpacity>
          </View>

          {/* Sign In Button */}
          <TouchableOpacity onPress={handleLogin} disabled={isLoading} activeOpacity={0.8}>
            <LinearGradient
              colors={[theme.colors.gradient1, theme.colors.gradient2]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.signInButton}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.signInButtonText}>Sign In</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Sign Up Link */}
          <TouchableOpacity onPress={handleSignUpPress} style={styles.signUpContainer}>
            <Text style={[styles.signUpText, { color: theme.colors.textSecondary }]}>
              Don't have an account?{' '}
              <Text style={[styles.signUpLink, { color: theme.colors.primary }]}>Sign Up</Text>
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingTop: 70,
    paddingBottom: 36,
    alignItems: 'center',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  logo: {
    fontSize: 42,
  },
  appName: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  tagline: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '400',
  },
  featurePills: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  featurePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  featurePillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  form: {
    flex: 1,
    padding: 24,
    paddingTop: 28,
  },
  googleButton: {
    marginBottom: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  googleButtonInner: {
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  googleIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#4285F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIconG: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  googleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A2E',
  },
  guestButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 8,
  },
  guestButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    paddingHorizontal: 12,
    fontSize: 12,
  },
  input: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
    marginBottom: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 16,
    marginTop: -4,
  },
  forgotPasswordText: {
    fontSize: 13,
    fontWeight: '500',
  },
  signInButton: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  signInButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  signUpContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  signUpText: {
    fontSize: 14,
  },
  signUpLink: {
    fontWeight: '700',
  },
});

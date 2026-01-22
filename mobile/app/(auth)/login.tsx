import React, { useState, useEffect } from 'react';
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
  const colorScheme = useColorScheme();
  const { theme: themePreference } = useSettingsStore();
  const { login, setUser } = useUserStore();
  const isDark = themePreference === 'dark' || (themePreference === 'system' && colorScheme === 'dark');
  const theme = createTheme(isDark);

  // Google Auth hook
  const { request, response, promptAsync } = useGoogleAuth();
  const googleAuthEnabled = isGoogleAuthConfigured();

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

  // Exchange authorization code for tokens
  const exchangeCodeForTokens = async (code: string, codeVerifier: string) => {
    try {
      console.log('Exchanging code for tokens...');

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
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
      });

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
      Alert.alert('Error', 'Failed to complete Google Sign-In: ' + error.message);
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
    } else if (response?.type === 'dismiss') {
      console.log('Google auth dismissed by user');
      setIsGoogleLoading(false);
    } else if (response) {
      console.log('Google auth response type:', response.type);
      setIsGoogleLoading(false);
    }
  }, [response]);

  const handleGoogleResponse = async (authentication: any) => {
    console.log('handleGoogleResponse called with:', authentication);

    if (!authentication) {
      console.error('No authentication object received');
      setIsGoogleLoading(false);
      return;
    }

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
      Alert.alert('Error', error.message || 'Failed to complete Google Sign-In');
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

    setIsGoogleLoading(true);
    try {
      // Store codeVerifier for later use in redirect handling
      if (request.codeVerifier) {
        console.log('Storing codeVerifier for OAuth redirect...');
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
        <LinearGradient
          colors={[theme.colors.gradient1, theme.colors.gradient2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <Text style={styles.logo}>🌐</Text>
          <Text style={styles.appName}>VoiceTranslate AI</Text>
          <Text style={styles.tagline}>Break language barriers instantly</Text>
        </LinearGradient>

        <View style={styles.form}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Welcome Back</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            Sign in to continue
          </Text>

          {/* Google Sign In Button */}
          {googleAuthEnabled && (
            <TouchableOpacity
              style={[styles.googleButton, { borderColor: theme.colors.border }]}
              onPress={handleGoogleLogin}
              disabled={isGoogleLoading || !request}
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
            </TouchableOpacity>
          )}

          {googleAuthEnabled && (
            <View style={styles.dividerContainer}>
              <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
              <Text style={[styles.dividerText, { color: theme.colors.textSecondary }]}>or</Text>
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
            placeholderTextColor={theme.colors.textSecondary}
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
            placeholderTextColor={theme.colors.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {/* Forgot Password */}
          <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotPassword}>
            <Text style={[styles.forgotPasswordText, { color: theme.colors.primary }]}>
              Forgot Password?
            </Text>
          </TouchableOpacity>

          {/* Sign In Button */}
          <Button
            title="Sign In"
            onPress={handleLogin}
            isLoading={isLoading}
            fullWidth
            style={styles.button}
          />

          {/* Guest Button */}
          <Button
            title="Continue as Guest"
            onPress={handleGuestLogin}
            variant="outline"
            fullWidth
            style={styles.button}
          />

          {/* Sign Up Link */}
          <TouchableOpacity onPress={handleSignUpPress} style={styles.signUpContainer}>
            <Text style={[styles.signUpText, { color: theme.colors.textSecondary }]}>
              Don't have an account?{' '}
              <Text style={[styles.signUpLink, { color: theme.colors.primary }]}>Sign Up</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 32,
    alignItems: 'center',
  },
  logo: {
    fontSize: 50,
    marginBottom: 12,
  },
  appName: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  tagline: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  form: {
    flex: 1,
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 24,
  },
  googleButton: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  googleIconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIconG: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4285F4',
  },
  googleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    paddingHorizontal: 16,
    fontSize: 14,
  },
  input: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 16,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 16,
    marginTop: -8,
  },
  forgotPasswordText: {
    fontSize: 14,
    fontWeight: '500',
  },
  button: {
    marginTop: 8,
  },
  signUpContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  signUpText: {
    fontSize: 14,
  },
  signUpLink: {
    fontWeight: '600',
  },
});

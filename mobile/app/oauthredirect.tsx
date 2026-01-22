import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Try to complete any pending auth session
WebBrowser.maybeCompleteAuthSession();

const OAUTH_RESPONSE_KEY = '@oauth_response';

export default function OAuthRedirect() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState('Processing login...');

  useEffect(() => {
    const handleOAuthRedirect = async () => {
      console.log('OAuth redirect received with params:', JSON.stringify(params));

      const code = params.code as string;
      const state = params.state as string;
      const error = params.error as string;

      if (error) {
        console.error('OAuth error:', error);
        setStatus('Login failed');
        Alert.alert('Error', 'Google login failed: ' + error);
        setTimeout(() => router.replace('/(auth)/login'), 1500);
        return;
      }

      if (code) {
        console.log('OAuth code received, storing for login page...');
        setStatus('Completing authentication...');

        // Store the OAuth response for the login page to process
        try {
          await AsyncStorage.setItem(
            OAUTH_RESPONSE_KEY,
            JSON.stringify({
              code,
              state,
              timestamp: Date.now(),
            })
          );
          console.log('OAuth response stored, redirecting to login...');
        } catch (e) {
          console.error('Failed to store OAuth response:', e);
        }

        // Redirect to login page where we'll exchange the code
        router.replace('/(auth)/login');
      } else {
        console.log('No code in OAuth redirect, redirecting to login...');
        setStatus('Redirecting...');
        router.replace('/(auth)/login');
      }
    };

    handleOAuthRedirect();
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#1E3A8A" />
      <Text style={styles.text}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: '#333',
  },
});

import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { View, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useUserStore } from '../src/store/userStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { useHistoryStore } from '../src/store/historyStore';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const loadUser = useUserStore((state) => state.loadUser);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const loadHistory = useHistoryStore((state) => state.loadHistory);
  const { theme } = useSettingsStore();

  useEffect(() => {
    loadUser();
    loadSettings();
    loadHistory();
  }, []);

  const isDark = theme === 'dark' || (theme === 'system' && colorScheme === 'dark');

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="subscription" />
      </Stack>
    </View>
  );
}
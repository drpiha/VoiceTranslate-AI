import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { useUserStore } from '../../src/store/userStore';

export default function AuthLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useUserStore((state) => state.isAuthenticated);
  const lastBackPress = useRef(0);

  // Handle Android back button in auth screens
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const handleBackPress = () => {
      // If user is authenticated, don't allow back to login
      if (isAuthenticated) {
        router.replace('/(tabs)');
        return true;
      }

      // On signup screen, go back to login
      if (pathname === '/(auth)/signup') {
        router.back();
        return true;
      }

      // On login screen - double-tap to exit
      const now = Date.now();
      if (now - lastBackPress.current < 2000) {
        return false; // Allow exit
      }

      lastBackPress.current = now;
      return true; // Prevent single back from exiting
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => subscription.remove();
  }, [isAuthenticated, pathname, router]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
    </Stack>
  );
}

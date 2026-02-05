import { useEffect, useRef } from 'react';
import { View, useColorScheme, BackHandler, Platform } from 'react-native';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { createTheme } from '../../src/constants/theme';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useNavigationStore } from '../../src/store/navigationStore';
import { NavigationDrawer } from '../../src/components/NavigationDrawer';

export default function TabsLayout() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const router = useRouter();
  const { theme: themePreference, colorScheme: colorSchemePref } = useSettingsStore();
  const isDark = themePreference === 'dark' || (themePreference === 'system' && colorScheme === 'dark');
  const theme = createTheme(isDark, colorSchemePref);
  const { isDrawerOpen, closeDrawer, openDrawer } = useNavigationStore();

  // Track last back press for double-tap to exit
  const lastBackPress = useRef(0);

  // Handle Android back button - prevent navigating out of tabs
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const handleBackPress = () => {
      // If drawer is open, close it
      if (isDrawerOpen) {
        closeDrawer();
        return true; // Prevent default back behavior
      }

      // If on a sub-tab (not home), go to home tab
      const isHomeTab = pathname === '/' || pathname === '/index';
      if (!isHomeTab) {
        router.navigate('/');
        return true; // Prevent default back behavior
      }

      // On home tab - implement double-tap to exit
      const now = Date.now();
      if (now - lastBackPress.current < 2000) {
        // Double tap within 2 seconds - allow exit
        return false;
      }

      lastBackPress.current = now;
      // Could show a toast here: "Press back again to exit"
      return true; // Prevent single back press from exiting
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => subscription.remove();
  }, [isDrawerOpen, pathname, closeDrawer, router]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
        }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="conversation" />
        <Tabs.Screen name="text" />
        <Tabs.Screen name="history" />
        <Tabs.Screen name="settings" />
      </Tabs>
      <NavigationDrawer isOpen={isDrawerOpen} onClose={closeDrawer} />
    </View>
  );
}

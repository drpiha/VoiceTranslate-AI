import { View, useColorScheme } from 'react-native';
import { Tabs } from 'expo-router';
import { createTheme } from '../../src/constants/theme';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useNavigationStore } from '../../src/store/navigationStore';
import { NavigationDrawer } from '../../src/components/NavigationDrawer';

export default function TabsLayout() {
  const colorScheme = useColorScheme();
  const { theme: themePreference, colorScheme: colorSchemePref } = useSettingsStore();
  const isDark = themePreference === 'dark' || (themePreference === 'system' && colorScheme === 'dark');
  const theme = createTheme(isDark, colorSchemePref);
  const { isDrawerOpen, closeDrawer } = useNavigationStore();

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

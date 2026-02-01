import { Tabs } from 'expo-router';
import { useColorScheme, View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { createTheme } from '../../src/constants/theme';
import { useSettingsStore } from '../../src/store/settingsStore';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

// Conditionally import BlurView only on iOS
let BlurView: any = null;
if (Platform.OS === 'ios') {
  try {
    BlurView = require('expo-blur').BlurView;
  } catch (e) {
    // BlurView not available
  }
}

const AnimatedView = Animated.createAnimatedComponent(View);

interface TabIconProps {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  focused: boolean;
  size?: number;
}

function TabIcon({ name, color, focused, size = 24 }: TabIconProps) {
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(focused ? 1.15 : 1, {
      damping: 12,
      stiffness: 200,
    });
    glowOpacity.value = withTiming(focused ? 1 : 0, { duration: 200 });
  }, [focused]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View style={styles.iconContainer}>
      {/* Glow effect for active tab */}
      <AnimatedView style={[styles.iconGlow, glowStyle]}>
        <LinearGradient
          colors={['rgba(99, 102, 241, 0.4)', 'rgba(236, 72, 153, 0.3)', 'transparent']}
          style={styles.glowGradient}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </AnimatedView>
      <AnimatedView style={animatedStyle}>
        <Ionicons name={name} size={size} color={color} />
      </AnimatedView>
    </View>
  );
}

function TabBarBackground({ isDark }: { isDark: boolean }) {
  if (Platform.OS === 'ios' && BlurView) {
    return (
      <BlurView
        intensity={isDark ? 60 : 80}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      >
        <LinearGradient
          colors={
            isDark
              ? ['rgba(26, 26, 46, 0.95)', 'rgba(15, 15, 26, 0.98)']
              : ['rgba(255, 255, 255, 0.95)', 'rgba(250, 251, 252, 0.98)']
          }
          style={StyleSheet.absoluteFill}
        />
      </BlurView>
    );
  }

  return (
    <LinearGradient
      colors={
        isDark
          ? ['#1A1A2E', '#0F0F1A']
          : ['#FFFFFF', '#F8FAFC']
      }
      style={StyleSheet.absoluteFill}
    />
  );
}

export default function TabsLayout() {
  const colorScheme = useColorScheme();
  const { theme: themePreference } = useSettingsStore();
  const isDark = themePreference === 'dark' || (themePreference === 'system' && colorScheme === 'dark');
  const theme = createTheme(isDark);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: isDark ? 'rgba(148, 163, 184, 0.7)' : 'rgba(71, 85, 105, 0.7)',
        tabBarBackground: () => <TabBarBackground isDark={isDark} />,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          height: Platform.OS === 'ios' ? 88 : 70,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          paddingTop: 10,
          shadowColor: isDark ? '#6366F1' : '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: isDark ? 0.3 : 0.1,
          shadowRadius: 12,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.3,
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Live',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? 'mic' : 'mic-outline'}
              color={focused ? '#EC4899' : color}
              focused={focused}
              size={26}
            />
          ),
          tabBarActiveTintColor: '#EC4899',
        }}
      />
      <Tabs.Screen
        name="conversation"
        options={{
          title: 'Converse',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? 'people' : 'people-outline'}
              color={focused ? '#06B6D4' : color}
              focused={focused}
            />
          ),
          tabBarActiveTintColor: '#06B6D4',
        }}
      />
      <Tabs.Screen
        name="text"
        options={{
          title: 'Text',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? 'language' : 'language-outline'}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? 'time' : 'time-outline'}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? 'settings' : 'settings-outline'}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 32,
  },
  iconGlow: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
  },
  glowGradient: {
    width: '100%',
    height: '100%',
  },
});

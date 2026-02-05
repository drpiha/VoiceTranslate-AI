import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  useColorScheme,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { createTheme } from '../constants/theme';
import { useSettingsStore } from '../store/settingsStore';
import { useUserStore } from '../store/userStore';

const DRAWER_WIDTH = 260;

const NAV_ITEMS: { route: string; label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap }[] = [
  { route: '/', label: 'Live', icon: 'mic-outline', activeIcon: 'mic' },
  { route: '/conversation', label: 'Converse', icon: 'people-outline', activeIcon: 'people' },
  { route: '/text', label: 'Text', icon: 'language-outline', activeIcon: 'language' },
  { route: '/history', label: 'History', icon: 'time-outline', activeIcon: 'time' },
  { route: '/settings', label: 'Settings', icon: 'settings-outline', activeIcon: 'settings' },
];

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NavigationDrawer({ isOpen, onClose }: NavigationDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const { theme: themePreference, colorScheme: userColorScheme } = useSettingsStore();
  const { user } = useUserStore();
  const isDark = themePreference === 'dark' || (themePreference === 'system' && colorScheme === 'dark');
  const theme = createTheme(isDark, userColorScheme);

  const progress = useSharedValue(0);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      progress.value = withTiming(1, { duration: 280 });
    } else {
      progress.value = withTiming(0, { duration: 220 }, (finished) => {
        if (finished) runOnJS(setShouldRender)(false);
      });
    }
  }, [isOpen]);

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [-DRAWER_WIDTH - 10, 0]) }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 0.5]),
  }));

  const handleNavigate = (route: string) => {
    router.navigate(route as any);
    onClose();
  };

  const isActive = (route: string) => {
    if (route === '/') return pathname === '/' || pathname === '/index';
    return pathname === route;
  };

  if (!shouldRender) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Animated.View style={[styles.backdrop, backdropStyle]} />
      </Pressable>

      {/* Drawer panel */}
      <Animated.View
        style={[
          styles.drawer,
          drawerStyle,
          {
            backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + 16,
            borderRightColor: isDark ? theme.colors.border : 'rgba(0, 0, 0, 0.06)',
            borderRightWidth: 1,
          },
        ]}
      >
        {/* Header: branding + close */}
        <View style={styles.drawerHeader}>
          <View style={styles.branding}>
            <Text style={[styles.brandTitle, { color: theme.colors.text }]}>VoiceTranslate</Text>
            <Text style={[styles.brandSub, { color: theme.colors.primary }]}> AI</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* User info */}
        {user ? (
          <View
            style={[
              styles.userSection,
              {
                backgroundColor: isDark
                  ? theme.colors.primary + '14'
                  : theme.colors.primary + '08',
              },
            ]}
          >
            <View style={[styles.userAvatar, { backgroundColor: theme.colors.primary + '20' }]}>
              <Text style={[styles.userInitial, { color: theme.colors.primary }]}>
                {(user.name || user.email || '?')[0].toUpperCase()}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={[styles.userName, { color: theme.colors.text }]} numberOfLines={1}>
                {user.name || 'User'}
              </Text>
              <Text style={[styles.userPlan, { color: theme.colors.textTertiary }]}>
                {(user.subscriptionTier || 'free').charAt(0).toUpperCase() +
                  (user.subscriptionTier || 'free').slice(1)}{' '}
                Plan
              </Text>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => {
              router.push('/(auth)/login');
              onClose();
            }}
            style={[
              styles.userSection,
              {
                backgroundColor: isDark
                  ? theme.colors.primary + '14'
                  : theme.colors.primary + '08',
              },
            ]}
            activeOpacity={0.7}
          >
            <View style={[styles.userAvatar, { backgroundColor: theme.colors.primary + '20' }]}>
              <Ionicons name="person" size={18} color={theme.colors.primary} />
            </View>
            <View style={styles.userInfo}>
              <Text style={[styles.userName, { color: theme.colors.text }]} numberOfLines={1}>
                Guest User
              </Text>
              <Text style={[styles.userPlan, { color: theme.colors.primary }]}>
                Tap to sign in
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
          </TouchableOpacity>
        )}

        {/* Navigation items */}
        <View style={styles.navSection}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.route);
            return (
              <TouchableOpacity
                key={item.route}
                onPress={() => handleNavigate(item.route)}
                style={[
                  styles.navItem,
                  active && {
                    backgroundColor: isDark
                      ? theme.colors.primary + '1A'
                      : theme.colors.primary + '0F',
                  },
                ]}
                activeOpacity={0.7}
              >
                {active && (
                  <View style={[styles.activeBar, { backgroundColor: theme.colors.primary }]} />
                )}
                <Ionicons
                  name={active ? item.activeIcon : item.icon}
                  size={22}
                  color={active ? theme.colors.primary : theme.colors.textSecondary}
                />
                <Text
                  style={[
                    styles.navLabel,
                    { color: active ? theme.colors.primary : theme.colors.text },
                    active && styles.navLabelActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.version, { color: theme.colors.textTertiary }]}>v1.0.0</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    paddingHorizontal: 16,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  branding: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  brandSub: {
    fontSize: 13,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 4,
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInitial: {
    fontSize: 16,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
  },
  userPlan: {
    fontSize: 12,
    marginTop: 1,
  },
  navSection: {
    gap: 2,
    flex: 1,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  navLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  navLabelActive: {
    fontWeight: '600',
  },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 1.5,
  },
  footer: {
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  version: {
    fontSize: 11,
  },
});

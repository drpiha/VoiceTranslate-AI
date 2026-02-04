import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '../store/settingsStore';
import { useColorScheme } from 'react-native';
import { createTheme } from '../constants/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  fullWidth = false,
  icon,
  style,
}) => {
  const colorScheme = useColorScheme();
  const { theme: themePreference, hapticFeedback, colorScheme: colorSchemePref } = useSettingsStore();
  const isDark = themePreference === 'dark' || (themePreference === 'system' && colorScheme === 'dark');
  const theme = createTheme(isDark, colorSchemePref);

  const handlePress = () => {
    if (!disabled && !isLoading) {
      if (hapticFeedback) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      onPress();
    }
  };

  const buttonHeight = size === 'sm' ? 44 : size === 'lg' ? 56 : 48;
  const fontSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16;

  const getVariantStyle = () => {
    switch (variant) {
      case 'primary':
        return { backgroundColor: theme.colors.primary };
      case 'secondary':
        return { backgroundColor: theme.colors.surface };
      case 'outline':
        return { backgroundColor: 'transparent', borderWidth: 2, borderColor: theme.colors.primary };
      case 'ghost':
        return { backgroundColor: 'transparent' };
    }
  };

  const getTextColor = () => {
    switch (variant) {
      case 'primary':
        return '#FFFFFF';
      case 'outline':
      case 'ghost':
        return theme.colors.primary;
      default:
        return theme.colors.text;
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled || isLoading}
      style={[
        styles.button,
        { height: buttonHeight, ...theme.shadows.md },
        getVariantStyle(),
        fullWidth && styles.fullWidth,
        (disabled || isLoading) && styles.disabled,
        style,
      ]}
      activeOpacity={variant === 'primary' ? 0.8 : 0.7}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === 'primary' ? '#FFFFFF' : theme.colors.primary} />
      ) : (
        <>
          {icon}
          <Text style={[styles.text, { fontSize, color: getTextColor() }]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 14,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  text: {
    fontWeight: '600',
  },
  fullWidth: {
    width: '100%',
    alignSelf: 'stretch',
  },
  disabled: {
    opacity: 0.5,
  },
});

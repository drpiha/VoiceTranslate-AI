import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColorScheme } from 'react-native';
import { createTheme } from '../constants/theme';
import { useSettingsStore } from '../store/settingsStore';

interface SubscriptionFeatureCardProps {
  title: string;
  description: string;
  icon: string;
}

export const SubscriptionFeatureCard: React.FC<SubscriptionFeatureCardProps> = ({
  title,
  description,
  icon,
}) => {
  const colorScheme = useColorScheme();
  const { theme: themePreference, colorScheme: colorSchemePref } = useSettingsStore();
  const isDark = themePreference === 'dark' || (themePreference === 'system' && colorScheme === 'dark');
  const theme = createTheme(isDark, colorSchemePref);

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
      <Text style={styles.icon}>{icon}</Text>
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
        <Text style={[styles.description, { color: theme.colors.textSecondary }]}>
          {description}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  icon: {
    fontSize: 32,
    marginRight: 16,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
});
import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList, TextInput } from 'react-native';
import { useColorScheme } from 'react-native';
import { createTheme } from '../constants/theme';
import { useSettingsStore } from '../store/settingsStore';
import { LANGUAGES, Language, PRIORITY_LANGUAGES } from '../constants/languages';
import * as Haptics from 'expo-haptics';

interface LanguageSelectorProps {
  value: string;
  onChange: (languageCode: string) => void;
  label?: string;
  placeholder?: string;
  excludeAuto?: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  value,
  onChange,
  label,
  placeholder = 'Select language',
  excludeAuto = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const colorScheme = useColorScheme();
  const { theme: themePreference, hapticFeedback, recentLanguages, colorScheme: colorSchemePref } = useSettingsStore();
  const isDark = themePreference === 'dark' || (themePreference === 'system' && colorScheme === 'dark');
  const theme = createTheme(isDark, colorSchemePref);

  const languages = excludeAuto ? LANGUAGES.filter(l => l.code !== 'auto') : LANGUAGES;

  const selectedLanguage = languages.find(l => l.code === value);

  // Sort languages: recent first, then priority (en, de, tr), then alphabetical
  const sortedLanguages = useMemo(() => {
    return [...languages].sort((a, b) => {
      const aRecent = recentLanguages.indexOf(a.code);
      const bRecent = recentLanguages.indexOf(b.code);
      const aPriority = PRIORITY_LANGUAGES.indexOf(a.code);
      const bPriority = PRIORITY_LANGUAGES.indexOf(b.code);

      // Recent languages first
      if (aRecent !== -1 && bRecent === -1) return -1;
      if (aRecent === -1 && bRecent !== -1) return 1;
      if (aRecent !== -1 && bRecent !== -1) return aRecent - bRecent;

      // Priority languages next
      if (aPriority !== -1 && bPriority === -1) return -1;
      if (aPriority === -1 && bPriority !== -1) return 1;
      if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;

      // Alphabetical by name
      return a.name.localeCompare(b.name);
    });
  }, [languages, recentLanguages]);

  const filteredLanguages = sortedLanguages.filter(lang =>
    lang.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lang.nativeName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (language: Language) => {
    if (hapticFeedback) {
      Haptics.selectionAsync();
    }
    onChange(language.code);
    setIsVisible(false);
    setSearchQuery('');
  };

  return (
    <View style={styles.container}>
      {label && <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>}
      
      <TouchableOpacity
        onPress={() => {
          if (hapticFeedback) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          setIsVisible(true);
        }}
        style={[
          styles.selector,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <Text
          style={[styles.selectedText, { color: theme.colors.text }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {selectedLanguage ? `${selectedLanguage.name} (${selectedLanguage.code.toUpperCase()})` : placeholder}
        </Text>
        <Text style={[styles.arrow, { color: theme.colors.textSecondary }]}>▼</Text>
      </TouchableOpacity>

      <Modal
        visible={isVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsVisible(false)}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.overlay}
            activeOpacity={1}
            onPress={() => setIsVisible(false)}
          />
          
          <View style={[styles.modalContent, { backgroundColor: theme.colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.colors.border }]}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Select Language</Text>
              <TouchableOpacity onPress={() => setIsVisible(false)}>
                <Text style={[styles.closeButton, { color: theme.colors.primary }]}>Done</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={[
                styles.searchInput,
                {
                  backgroundColor: theme.colors.surface,
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                },
              ]}
              placeholder="Search languages..."
              placeholderTextColor={theme.colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />

            <FlatList
              data={filteredLanguages}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => handleSelect(item)}
                  style={[
                    styles.languageItem,
                    { borderBottomColor: theme.colors.borderLight },
                    value === item.code && { backgroundColor: theme.colors.primaryLight + '20' },
                  ]}
                >
                  <View style={[styles.languageCode, { backgroundColor: theme.colors.primary + '1A' }]}>
                    <Text style={[styles.languageCodeText, { color: theme.colors.primary }]}>
                      {item.code.toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.languageTextContainer}>
                    <Text style={[styles.languageName, { color: theme.colors.text }]}>
                      {item.name}
                    </Text>
                    <Text style={[styles.languageNative, { color: theme.colors.textSecondary }]}>
                      {item.nativeName}
                    </Text>
                  </View>
                  {value === item.code && (
                    <Text style={[styles.checkmark, { color: theme.colors.primary }]}>✓</Text>
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    minWidth: 120,
  },
  selectedText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    flexShrink: 1,
  },
  arrow: {
    fontSize: 12,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    height: '80%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    fontSize: 16,
    fontWeight: '600',
  },
  searchInput: {
    margin: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  languageCode: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageCodeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  languageTextContainer: {
    flex: 1,
  },
  languageName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  languageNative: {
    fontSize: 14,
  },
  checkmark: {
    fontSize: 20,
    fontWeight: 'bold',
  },
});

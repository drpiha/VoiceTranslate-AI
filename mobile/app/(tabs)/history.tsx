import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Alert,
  useColorScheme,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  FadeInDown,
} from 'react-native-reanimated';
import { createTheme } from '../../src/constants/theme';
import { useHistoryStore } from '../../src/store/historyStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { getLanguageByCode } from '../../src/constants/languages';
import { Translation } from '../../src/types';
import * as Haptics from 'expo-haptics';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function HistoryScreen() {
  const colorScheme = useColorScheme();
  const { theme: themePreference, hapticFeedback } = useSettingsStore();
  const isDark = themePreference === 'dark' || (themePreference === 'system' && colorScheme === 'dark');
  const theme = createTheme(isDark);

  const { translations, searchQuery, setSearchQuery, toggleFavorite, removeTranslation, loadHistory } = useHistoryStore();

  const [activeFilter, setActiveFilter] = useState<'all' | 'favorites'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpanded = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(expandedId === id ? null : id);
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  };

  const filteredTranslations = translations.filter(t => {
    const matchesSearch = !searchQuery ||
      t.sourceText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.translatedText.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = activeFilter === 'all' || (activeFilter === 'favorites' && t.isFavorite);
    return matchesSearch && matchesFilter;
  });

  const handleLongPress = (item: Translation) => {
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    Alert.alert(
      'Delete Translation',
      'Are you sure you want to delete this translation?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => removeTranslation(item.id) },
      ]
    );
  };

  const handleToggleFavorite = (id: string) => {
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    toggleFavorite(id);
  };

  const renderItem = ({ item, index }: { item: Translation; index: number }) => {
    const sourceLang = getLanguageByCode(item.sourceLanguage);
    const targetLang = getLanguageByCode(item.targetLanguage);
    const date = new Date(item.timestamp).toLocaleDateString();
    const isExpanded = expandedId === item.id;

    return (
      <Animated.View
        entering={FadeInDown.delay(Math.min(index * 50, 300)).springify()}
      >
        <TouchableOpacity
          onPress={() => toggleExpanded(item.id)}
          onLongPress={() => handleLongPress(item)}
          style={[
            styles.card,
            {
              backgroundColor: isDark ? 'rgba(26, 26, 46, 0.8)' : 'rgba(255, 255, 255, 0.95)',
              borderColor: isExpanded
                ? (isDark ? 'rgba(99, 102, 241, 0.4)' : 'rgba(99, 102, 241, 0.3)')
                : (isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)'),
            }
          ]}
          activeOpacity={0.7}
        >
          <View style={styles.cardHeader}>
            <View style={styles.languagePills}>
              <View style={[styles.languagePill, { backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)' }]}>
                <Text style={styles.flagEmoji}>{sourceLang?.flag}</Text>
                <Text style={[styles.pillText, { color: theme.colors.primary }]}>{sourceLang?.code?.toUpperCase()}</Text>
              </View>
              <Ionicons name="arrow-forward" size={14} color={theme.colors.textTertiary} />
              <View style={[styles.languagePill, { backgroundColor: isDark ? 'rgba(236, 72, 153, 0.2)' : 'rgba(236, 72, 153, 0.1)' }]}>
                <Text style={styles.flagEmoji}>{targetLang?.flag}</Text>
                <Text style={[styles.pillText, { color: '#EC4899' }]}>{targetLang?.code?.toUpperCase()}</Text>
              </View>
            </View>
            <View style={styles.cardActions}>
              <Text style={[styles.dateText, { color: theme.colors.textTertiary }]}>{date}</Text>
              <TouchableOpacity onPress={() => handleToggleFavorite(item.id)} style={styles.favoriteButton}>
                <Ionicons
                  name={item.isFavorite ? 'star' : 'star-outline'}
                  size={20}
                  color={item.isFavorite ? '#F59E0B' : theme.colors.textTertiary}
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.textSection}>
            <View style={[styles.textBlock, { borderLeftColor: theme.colors.primary }]}>
              <Text style={[styles.textLabel, { color: theme.colors.textTertiary }]}>Original</Text>
              <Text
                style={[styles.textContent, { color: theme.colors.text }]}
                numberOfLines={isExpanded ? undefined : 2}
              >
                {item.sourceText}
              </Text>
            </View>

            <View style={[styles.textBlock, { borderLeftColor: '#EC4899' }]}>
              <Text style={[styles.textLabel, { color: theme.colors.textTertiary }]}>Translation</Text>
              <Text
                style={[styles.textContent, { color: theme.colors.text }]}
                numberOfLines={isExpanded ? undefined : 2}
              >
                {item.translatedText}
              </Text>
            </View>
          </View>

          {!isExpanded && (item.sourceText.length > 80 || item.translatedText.length > 80) && (
            <View style={styles.expandHint}>
              <Ionicons name="chevron-down" size={14} color={theme.colors.textTertiary} />
              <Text style={[styles.expandHintText, { color: theme.colors.textTertiary }]}>Tap to see full text</Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const bgGradientColors = isDark
    ? ['#0F0F1A', '#1A1A2E', '#16162A'] as const
    : ['#F8FAFC', '#EEF2FF', '#E0E7FF'] as const;

  return (
    <View style={styles.container}>
      {/* Background gradient */}
      <LinearGradient
        colors={bgGradientColors}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Decorative orbs */}
      <View style={styles.orbContainer}>
        <LinearGradient
          colors={isDark
            ? ['rgba(99, 102, 241, 0.12)', 'transparent']
            : ['rgba(99, 102, 241, 0.08)', 'transparent']
          }
          style={[styles.orb, styles.orb1]}
        />
        <LinearGradient
          colors={isDark
            ? ['rgba(236, 72, 153, 0.1)', 'transparent']
            : ['rgba(236, 72, 153, 0.06)', 'transparent']
          }
          style={[styles.orb, styles.orb2]}
        />
      </View>

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={[styles.headerTitle, { color: theme.colors.text }]}>History</Text>
              <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>
                {filteredTranslations.length} translation{filteredTranslations.length !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>

          {/* Search Input */}
          <View style={[
            styles.searchContainer,
            { backgroundColor: isDark ? 'rgba(26, 26, 46, 0.8)' : 'rgba(255, 255, 255, 0.9)' }
          ]}>
            <Ionicons name="search" size={20} color={theme.colors.textTertiary} />
            <TextInput
              style={[styles.searchInput, { color: theme.colors.text }]}
              placeholder="Search translations..."
              placeholderTextColor={theme.colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter Pills */}
          <View style={styles.filterRow}>
            <TouchableOpacity
              onPress={() => setActiveFilter('all')}
              style={[
                styles.filterButton,
                activeFilter === 'all' && styles.filterButtonActive
              ]}
            >
              {activeFilter === 'all' ? (
                <LinearGradient
                  colors={['#6366F1', '#8B5CF6']}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                />
              ) : null}
              <View style={[
                styles.filterContent,
                { backgroundColor: activeFilter !== 'all' ? (isDark ? 'rgba(26, 26, 46, 0.6)' : 'rgba(255, 255, 255, 0.8)') : 'transparent' }
              ]}>
                <Ionicons
                  name="list"
                  size={16}
                  color={activeFilter === 'all' ? '#FFFFFF' : theme.colors.textSecondary}
                />
                <Text style={[
                  styles.filterText,
                  { color: activeFilter === 'all' ? '#FFFFFF' : theme.colors.textSecondary }
                ]}>
                  All
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveFilter('favorites')}
              style={[
                styles.filterButton,
                activeFilter === 'favorites' && styles.filterButtonActive
              ]}
            >
              {activeFilter === 'favorites' ? (
                <LinearGradient
                  colors={['#F59E0B', '#F97316']}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                />
              ) : null}
              <View style={[
                styles.filterContent,
                { backgroundColor: activeFilter !== 'favorites' ? (isDark ? 'rgba(26, 26, 46, 0.6)' : 'rgba(255, 255, 255, 0.8)') : 'transparent' }
              ]}>
                <Ionicons
                  name="star"
                  size={16}
                  color={activeFilter === 'favorites' ? '#FFFFFF' : theme.colors.textSecondary}
                />
                <Text style={[
                  styles.filterText,
                  { color: activeFilter === 'favorites' ? '#FFFFFF' : theme.colors.textSecondary }
                ]}>
                  Favorites
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <FlatList
          data={filteredTranslations}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={[
                styles.emptyIconContainer,
                { backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)' }
              ]}>
                <Ionicons
                  name={activeFilter === 'favorites' ? 'star-outline' : 'document-text-outline'}
                  size={48}
                  color={theme.colors.primary}
                />
              </View>
              <Text style={[styles.emptyText, { color: theme.colors.text }]}>
                {activeFilter === 'favorites' ? 'No favorites yet' : 'No translations yet'}
              </Text>
              <Text style={[styles.emptySubtext, { color: theme.colors.textSecondary }]}>
                {activeFilter === 'favorites'
                  ? 'Star translations to add them here'
                  : 'Start translating to build your history'}
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  orbContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orb1: {
    width: 280,
    height: 280,
    top: -80,
    left: -100,
  },
  orb2: {
    width: 220,
    height: 220,
    bottom: 150,
    right: -60,
  },
  header: {
    padding: 20,
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 50,
    marginBottom: 16,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 12,
  },
  filterButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  filterButtonActive: {
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  filterContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    borderRadius: 12,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    padding: 20,
    paddingTop: 8,
    paddingBottom: 120,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  languagePills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  languagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  flagEmoji: {
    fontSize: 14,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '500',
  },
  favoriteButton: {
    padding: 4,
  },
  textSection: {
    gap: 12,
  },
  textBlock: {
    borderLeftWidth: 3,
    paddingLeft: 12,
  },
  textLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  textContent: {
    fontSize: 15,
    lineHeight: 22,
  },
  expandHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 4,
  },
  expandHintText: {
    fontSize: 11,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
});

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useColorScheme, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { createTheme } from '../src/constants/theme';
import { useSettingsStore } from '../src/store/settingsStore';
import { subscriptionAPI } from '../src/services/api';
import { Button } from '../src/components/Button';

interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: string;
  features: string[];
  isPopular?: boolean;
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { theme: themePreference } = useSettingsStore();
  const isDark = themePreference === 'dark' || (themePreference === 'system' && colorScheme === 'dark');
  const theme = createTheme(isDark);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [subscribingTo, setSubscribingTo] = useState<string | null>(null);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      setIsLoading(true);
      const fetchedPlans = await subscriptionAPI.getPlans();
      setPlans(fetchedPlans as Plan[]);
    } catch (error) {
      console.error('Failed to load plans:', error);
      setPlans(getDefaultPlans());
    } finally {
      setIsLoading(false);
    }
  };

  const getDefaultPlans = (): Plan[] => [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      currency: 'USD',
      interval: 'month',
      features: [
        '10 translations per day',
        'Basic language pairs',
        'Text translation only',
        'Standard support',
      ],
    },
    {
      id: 'basic',
      name: 'Basic',
      price: 9.99,
      currency: 'USD',
      interval: 'month',
      features: [
        '100 translations per day',
        'All language pairs',
        'Voice & text translation',
        'Translation history',
        'Priority support',
      ],
    },
    {
      id: 'premium',
      name: 'Premium',
      price: 19.99,
      currency: 'USD',
      interval: 'month',
      features: [
        'Unlimited translations',
        'All language pairs',
        'Voice & text translation',
        'Real-time streaming',
        'Translation history',
        'Offline mode',
        'Premium support',
        'Custom vocabulary',
      ],
      isPopular: true,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 99.99,
      currency: 'USD',
      interval: 'month',
      features: [
        'Everything in Premium',
        'API access',
        'Team management',
        'Custom integrations',
        'Dedicated support',
        'SLA guarantee',
        'Advanced analytics',
        'White-label option',
      ],
    },
  ];

  const handleSubscribe = async (planId: string) => {
    try {
      setSubscribingTo(planId);
      await subscriptionAPI.subscribe(planId);
      Alert.alert(
        'Success',
        'Subscription activated successfully!',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      console.error('Subscription failed:', error);
      Alert.alert('Error', error.message || 'Failed to subscribe. Please try again.');
    } finally {
      setSubscribingTo(null);
    }
  };

  const renderPlanCard = (plan: Plan) => {
    const isSubscribing = subscribingTo === plan.id;
    const isFree = plan.price === 0;

    return (
      <View
        key={plan.id}
        style={[
          styles.planCard,
          { backgroundColor: theme.colors.card, borderColor: plan.isPopular ? theme.colors.primary : theme.colors.border },
          plan.isPopular && styles.popularCard,
          theme.shadows.lg,
        ]}
      >
        {plan.isPopular && (
          <View style={[styles.popularBadge, { backgroundColor: theme.colors.primary }]}>
            <Text style={styles.popularText}>MOST POPULAR</Text>
          </View>
        )}

        <Text style={[styles.planName, { color: theme.colors.text }]}>{plan.name}</Text>

        <View style={styles.priceContainer}>
          <Text style={[styles.currency, { color: theme.colors.textSecondary }]}>$</Text>
          <Text style={[styles.price, { color: theme.colors.text }]}>
            {plan.price.toFixed(plan.price % 1 === 0 ? 0 : 2)}
          </Text>
          <Text style={[styles.interval, { color: theme.colors.textSecondary }]}>/{plan.interval}</Text>
        </View>

        <View style={styles.featuresContainer}>
          {plan.features.map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <Text style={[styles.checkmark, { color: theme.colors.primary }]}>✓</Text>
              <Text style={[styles.featureText, { color: theme.colors.textSecondary }]}>{feature}</Text>
            </View>
          ))}
        </View>

        {isFree ? (
          <View style={[styles.currentPlanBadge, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.currentPlanText, { color: theme.colors.textSecondary }]}>Current Plan</Text>
          </View>
        ) : plan.isPopular ? (
          <LinearGradient
            colors={[theme.colors.gradient1, theme.colors.gradient2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.subscribeButtonGradient}
          >
            <TouchableOpacity
              onPress={() => handleSubscribe(plan.id)}
              disabled={isSubscribing}
              style={styles.subscribeButtonInner}
            >
              <Text style={styles.subscribeButtonText}>
                {isSubscribing ? 'Processing...' : 'Subscribe Now'}
              </Text>
            </TouchableOpacity>
          </LinearGradient>
        ) : (
          <TouchableOpacity
            onPress={() => handleSubscribe(plan.id)}
            disabled={isSubscribing}
            style={[styles.subscribeButton, { backgroundColor: theme.colors.primary }]}
          >
            <Text style={styles.subscribeButtonText}>
              {isSubscribing ? 'Processing...' : 'Subscribe'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: theme.colors.primary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Choose Your Plan</Text>
        <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>
          Select the plan that works best for you
        </Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>Loading plans...</Text>
          </View>
        ) : (
          <View style={styles.plansContainer}>
            {plans.map(renderPlanCard)}
          </View>
        )}

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.colors.textSecondary }]}>
            All plans include a 7-day free trial. Cancel anytime.
          </Text>
          <Text style={[styles.footerText, { color: theme.colors.textSecondary }]}>
            Prices in USD. Local taxes may apply.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 24,
    paddingBottom: 16,
  },
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    lineHeight: 24,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 8,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
  },
  plansContainer: {
    gap: 20,
  },
  planCard: {
    borderRadius: 20,
    padding: 24,
    borderWidth: 2,
    position: 'relative',
  },
  popularCard: {
    borderWidth: 3,
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    left: 24,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  popularText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  planName: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 24,
  },
  currency: {
    fontSize: 20,
    fontWeight: '600',
  },
  price: {
    fontSize: 48,
    fontWeight: '700',
    lineHeight: 52,
  },
  interval: {
    fontSize: 16,
    fontWeight: '500',
  },
  featuresContainer: {
    marginBottom: 24,
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkmark: {
    fontSize: 18,
    fontWeight: '700',
  },
  featureText: {
    fontSize: 15,
    lineHeight: 22,
    flex: 1,
  },
  subscribeButton: {
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscribeButtonGradient: {
    height: 56,
    borderRadius: 12,
    overflow: 'hidden',
  },
  subscribeButtonInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscribeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  currentPlanBadge: {
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentPlanText: {
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    marginTop: 32,
    gap: 8,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
});

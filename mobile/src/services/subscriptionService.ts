import { SubscriptionPlan } from '../types';

class SubscriptionService {
  private plans: SubscriptionPlan[] = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      currency: 'USD',
      interval: 'month',
      features: [
        '10 translations per day',
        'Basic language support',
        'Standard audio quality',
        'Translation history (7 days)',
      ],
    },
    {
      id: 'premium_monthly',
      name: 'Premium Monthly',
      price: 9.99,
      currency: 'USD',
      interval: 'month',
      features: [
        'Unlimited translations',
        'All languages supported',
        'High-quality audio',
        'Unlimited history',
        'Offline mode',
        'No ads',
        'Priority support',
      ],
    },
    {
      id: 'premium_yearly',
      name: 'Premium Yearly',
      price: 79.99,
      currency: 'USD',
      interval: 'year',
      features: [
        'Unlimited translations',
        'All languages supported',
        'High-quality audio',
        'Unlimited history',
        'Offline mode',
        'No ads',
        'Priority support',
        'Save 33%',
      ],
    },
  ];

  getPlans(): SubscriptionPlan[] {
    return this.plans;
  }

  async subscribe(planId: string): Promise<void> {
    try {
      // Mock subscription - integrate with RevenueCat or similar
      console.log(`Subscribing to plan: ${planId}`);
      // Implement actual subscription logic here
    } catch (error) {
      console.error('Subscription error:', error);
      throw error;
    }
  }

  async restorePurchases(): Promise<void> {
    try {
      // Mock restore - integrate with RevenueCat or similar
      console.log('Restoring purchases');
      // Implement actual restore logic here
    } catch (error) {
      console.error('Restore purchases error:', error);
      throw error;
    }
  }

  async checkSubscriptionStatus(): Promise<'free' | 'premium'> {
    try {
      // Mock check - integrate with RevenueCat or similar
      return 'free';
    } catch (error) {
      console.error('Check subscription status error:', error);
      return 'free';
    }
  }
}

export const subscriptionService = new SubscriptionService();

/**
 * =============================================================================
 * Environment Configuration Module
 * =============================================================================
 * Centralized environment variable management with validation.
 * All environment variables are validated at startup to fail fast
 * if required configuration is missing.
 * =============================================================================
 */

import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Environment variable schema with validation rules.
 * Using Zod for runtime type checking and validation.
 */
const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  HOST: z.string().default('0.0.0.0'),

  // Database Configuration
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // JWT Configuration
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // Security Configuration
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters'),
  BCRYPT_ROUNDS: z.string().transform(Number).default('12'),

  // Rate Limiting - Global
  RATE_LIMIT_GLOBAL_MAX: z.string().transform(Number).default('1000'),
  RATE_LIMIT_GLOBAL_WINDOW_MS: z.string().transform(Number).default('3600000'),

  // Rate Limiting - Per User
  RATE_LIMIT_PER_USER_MAX: z.string().transform(Number).default('100'),
  RATE_LIMIT_PER_USER_WINDOW_MS: z.string().transform(Number).default('60000'),

  // Rate Limiting - Translation
  RATE_LIMIT_TRANSLATION_FREE_MAX: z.string().transform(Number).default('10'),
  RATE_LIMIT_TRANSLATION_FREE_WINDOW_MS: z.string().transform(Number).default('60000'),
  RATE_LIMIT_TRANSLATION_PREMIUM_MAX: z.string().transform(Number).default('100'),
  RATE_LIMIT_TRANSLATION_PREMIUM_WINDOW_MS: z.string().transform(Number).default('60000'),

  // AI Service API Keys (optional in development with mocks)
  GOOGLE_CLOUD_STT_API_KEY: z.string().optional(),
  GOOGLE_CLOUD_TTS_API_KEY: z.string().optional(),
  DEEPL_API_KEY: z.string().optional(),
  GOOGLE_TRANSLATE_API_KEY: z.string().optional(),

  // OpenRouter Configuration (for AI-powered translation)
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default('openai/gpt-4o-mini'),

  // Groq Configuration (for Speech-to-Text with Whisper)
  GROQ_API_KEY: z.string().optional(),

  // App Store Configuration
  APPLE_SHARED_SECRET: z.string().optional(),
  GOOGLE_PLAY_SERVICE_ACCOUNT_KEY: z.string().optional(),

  // Google OAuth Configuration
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_ANDROID_CLIENT_ID: z.string().optional(),
  GOOGLE_IOS_CLIENT_ID: z.string().optional(),

  // Email Service Configuration (using Resend)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('VoiceTranslate <noreply@voicetranslate.ai>'),
  APP_URL: z.string().default('http://localhost:3001'),

  // Logging Configuration
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),

  // Feature Flags
  USE_MOCK_AI_SERVICES: z.string().transform(val => val === 'true').default('true'),
  ENABLE_REQUEST_LOGGING: z.string().transform(val => val === 'true').default('true'),

  // AI Punctuation Feature
  ENABLE_AI_PUNCTUATION: z.string().transform(val => val === 'true').default('false'),
  PUNCTUATION_MODEL: z.string().default('openai/gpt-4o-mini'),
});

/**
 * Parse and validate environment variables.
 * Throws detailed error if validation fails.
 */
function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map(e => `  - ${e.path.join('.')}: ${e.message}`);
      console.error('Environment validation failed:');
      console.error(missingVars.join('\n'));
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Validated environment configuration.
 * Access this object throughout the application for type-safe env vars.
 */
export const env = validateEnv();

/**
 * Typed environment configuration interface.
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Check if running in production mode.
 */
export const isProduction = env.NODE_ENV === 'production';

/**
 * Check if running in development mode.
 */
export const isDevelopment = env.NODE_ENV === 'development';

/**
 * Check if running in test mode.
 */
export const isTest = env.NODE_ENV === 'test';

/**
 * Parsed CORS origins as an array.
 */
export const corsOrigins = env.CORS_ORIGINS.split(',').map(origin => origin.trim());

/**
 * Subscription tier limits configuration.
 */
export const subscriptionLimits = {
  free: {
    dailyMinutes: 10,
    monthlyMinutes: 100,
    maxHistoryDays: 7,
    rateLimit: env.RATE_LIMIT_TRANSLATION_FREE_MAX,
    rateLimitWindow: env.RATE_LIMIT_TRANSLATION_FREE_WINDOW_MS,
  },
  basic: {
    dailyMinutes: 60,
    monthlyMinutes: 1000,
    maxHistoryDays: 30,
    rateLimit: 50,
    rateLimitWindow: 60000,
  },
  premium: {
    dailyMinutes: 300,
    monthlyMinutes: 5000,
    maxHistoryDays: 90,
    rateLimit: env.RATE_LIMIT_TRANSLATION_PREMIUM_MAX,
    rateLimitWindow: env.RATE_LIMIT_TRANSLATION_PREMIUM_WINDOW_MS,
  },
  enterprise: {
    dailyMinutes: -1, // Unlimited
    monthlyMinutes: -1, // Unlimited
    maxHistoryDays: 365,
    rateLimit: 500,
    rateLimitWindow: 60000,
  },
} as const;

export type SubscriptionTier = keyof typeof subscriptionLimits;

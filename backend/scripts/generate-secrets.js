#!/usr/bin/env node
/**
 * Generate secure secrets for VoiceTranslate AI backend
 * Run with: node scripts/generate-secrets.js
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('\n========================================');
console.log('VoiceTranslate AI - Secret Generator');
console.log('========================================\n');

// Generate JWT secrets (64 bytes = 128 hex chars)
const jwtAccessSecret = crypto.randomBytes(64).toString('hex');
const jwtRefreshSecret = crypto.randomBytes(64).toString('hex');

// Generate encryption key (32 bytes = 64 hex chars)
const encryptionKey = crypto.randomBytes(32).toString('hex');

console.log('Copy these values to your .env file:\n');
console.log('------- JWT Secrets -------');
console.log(`JWT_ACCESS_SECRET=${jwtAccessSecret}`);
console.log(`JWT_REFRESH_SECRET=${jwtRefreshSecret}`);
console.log('');
console.log('------- Encryption Key -------');
console.log(`ENCRYPTION_KEY=${encryptionKey}`);
console.log('');
console.log('========================================');
console.log('IMPORTANT: Keep these secrets safe!');
console.log('Never commit them to version control.');
console.log('========================================\n');

// Also create a template .env.production file
const envTemplate = `# =============================================================================
# VoiceTranslate AI - Production Environment Variables
# =============================================================================
# Generated on: ${new Date().toISOString()}
# =============================================================================

# Server Configuration
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# Database (Get from Supabase Dashboard)
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres

# JWT Configuration (Auto-generated - DO NOT CHANGE)
JWT_ACCESS_SECRET=${jwtAccessSecret}
JWT_REFRESH_SECRET=${jwtRefreshSecret}
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Security (Auto-generated - DO NOT CHANGE)
ENCRYPTION_KEY=${encryptionKey}
BCRYPT_ROUNDS=12

# CORS (Update with your frontend URLs)
CORS_ORIGINS=https://your-app.railway.app,https://your-domain.com

# Google OAuth (Get from Google Cloud Console)
GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET
GOOGLE_ANDROID_CLIENT_ID=YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com
GOOGLE_IOS_CLIENT_ID=YOUR_IOS_CLIENT_ID.apps.googleusercontent.com

# Email Service - Resend (Get from Resend Dashboard)
RESEND_API_KEY=re_YOUR_API_KEY
EMAIL_FROM=VoiceTranslate <noreply@voicetranslate.ai>
APP_URL=https://your-app.railway.app

# AI Services
# Groq (Free tier: https://console.groq.com)
GROQ_API_KEY=gsk_YOUR_GROQ_KEY

# OpenRouter (https://openrouter.ai)
OPENROUTER_API_KEY=sk-or-YOUR_OPENROUTER_KEY
OPENROUTER_MODEL=openai/gpt-4o-mini

# Rate Limiting
RATE_LIMIT_GLOBAL_MAX=1000
RATE_LIMIT_GLOBAL_WINDOW_MS=3600000
RATE_LIMIT_PER_USER_MAX=100
RATE_LIMIT_PER_USER_WINDOW_MS=60000
RATE_LIMIT_TRANSLATION_FREE_MAX=10
RATE_LIMIT_TRANSLATION_FREE_WINDOW_MS=60000
RATE_LIMIT_TRANSLATION_PREMIUM_MAX=100
RATE_LIMIT_TRANSLATION_PREMIUM_WINDOW_MS=60000

# Feature Flags
USE_MOCK_AI_SERVICES=false
ENABLE_REQUEST_LOGGING=true
LOG_LEVEL=info
LOG_FORMAT=json
`;

const envPath = path.join(__dirname, '..', '.env.production.template');
fs.writeFileSync(envPath, envTemplate);

console.log(`Template file created: ${envPath}`);
console.log('');
console.log('Next steps:');
console.log('1. Copy .env.production.template to .env.production');
console.log('2. Fill in the missing values (marked with YOUR_...)');
console.log('3. For Railway deployment, add these as environment variables');
console.log('');

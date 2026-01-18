# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VoiceTranslate AI is a real-time voice translation mobile application for iOS and Android, using AI-powered speech-to-text, translation, and text-to-speech services.

## Repository Structure

```
Project_Translator/
├── backend/     # Node.js + Fastify API server
├── mobile/      # React Native + Expo mobile app
└── docs/        # Architecture documentation
```

## Backend (Node.js + Fastify)

### Commands

```bash
cd backend

# Development
npm run dev              # Start dev server with hot reload (tsx watch)
npm run build            # Compile TypeScript
npm run start            # Run compiled production build

# Database (Prisma + SQLite dev / PostgreSQL prod)
npm run db:generate      # Generate Prisma client
npm run db:push          # Push schema to database
npm run db:migrate       # Run database migrations
npm run db:studio        # Open Prisma Studio GUI

# Testing & Linting
npm run test             # Run tests with Vitest (watch mode)
npm run test:run         # Run tests once
npm run typecheck        # Type check without emitting
npm run lint             # ESLint
```

### Architecture

- **Entry**: `src/index.ts` → `src/app.ts` (Fastify configuration)
- **Routes**: `src/routes/` - auth, translate, user, subscription
- **Services**: `src/services/` - business logic, including `ai/` subdirectory for STT/TTS/translation
- **Plugins**: `src/plugins/` - auth (JWT), CORS, helmet, rate limiting
- **WebSocket**: `src/websocket/translation.handler.ts` - real-time voice translation at `/ws/translate`
- **Database**: Prisma ORM in `src/lib/prisma.ts`, schema in `prisma/schema.prisma`

### Key Patterns

- JWT auth with access tokens (15 min) and refresh tokens (7 days)
- Zod for request validation in `src/middleware/validateRequest.ts`
- Subscription tiers: free, basic, premium, enterprise with usage limits
- Mock AI services enabled by default (`USE_MOCK_AI_SERVICES=true`)

## Mobile (React Native + Expo)

### Commands

```bash
cd mobile

npm start                # Start Expo dev server
npm run android          # Start on Android
npm run ios              # Start on iOS
npm run web              # Start web version
```

### Architecture

- **Expo Router**: File-based routing in `app/` directory
  - `app/(auth)/` - login, signup screens
  - `app/(tabs)/` - main tab navigation (history, settings)
  - `app/(onboarding)/` - first-run onboarding
- **State**: Zustand stores in `src/store/` (user, translation, history, settings)
- **Services**: `src/services/` - API client, audio, translation, subscription
- **Components**: `src/components/` - reusable UI components
- **Constants**: `src/constants/` - theme colors, supported languages

### Key Dependencies

- `expo-av` - audio recording/playback
- `expo-secure-store` - secure token storage
- `expo-auth-session` - OAuth flows
- `react-native-reanimated` - animations
- `zustand` - state management

## API Endpoints

**Auth**: `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/me`

**Translation**: `/api/translate/text`, `/api/translate/detect`, `/api/translate/languages`, `/api/translate/history`

**User**: `/api/user/profile`, `/api/user/usage`, `/api/user/history`

**Subscription**: `/api/subscription/plans`, `/api/subscription/status`, `/api/subscription/verify`

**WebSocket**: `/ws/translate` - real-time voice translation with binary audio streaming

## Database Models

- `User` - accounts, subscription tier, usage tracking
- `Translation` - translation history with source/target text and languages
- `RefreshToken` - JWT refresh tokens with device tracking
- `SubscriptionReceipt` - Apple/Google receipt verification
- `SupportedLanguage` - language configuration with TTS/STT support flags

## Environment Setup

Backend requires `.env` file (copy from `.env.example`):
- `DATABASE_URL` - SQLite for dev, PostgreSQL for prod
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` - min 32 chars each
- `ENCRYPTION_KEY` - for encrypting sensitive data
- AI service keys (optional with mock mode enabled)

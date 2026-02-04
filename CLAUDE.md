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
- Mock AI services must be disabled by default (`USE_MOCK_AI_SERVICES=false`)

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

## Production Deployment (Hostinger VPS)

### Infrastructure
- **VPS**: Hostinger KVM2 at `72.62.0.111` (SSH: `ssh root@72.62.0.111`)
- **API URL**: `https://api.srv1150632.hstgr.cloud`
- **WebSocket**: `wss://api.srv1150632.hstgr.cloud/ws/translate`
- **SSL**: Let's Encrypt via Traefik (auto-renewal)
- **Database**: PostgreSQL 15 (Docker container)
- **n8n**: Also running on same VPS at `https://n8n.srv1150632.hstgr.cloud`

### Docker Services (on VPS at /root/docker-compose.yml)
- `traefik` - Reverse proxy + SSL (ports 80, 443)
- `n8n` - Workflow automation
- `postgres` - PostgreSQL database
- `voicetranslate-backend` - Backend API (port 3000 internal)

### VPS Commands
```bash
ssh root@72.62.0.111

# Docker management
docker compose ps                              # Status
docker logs voicetranslate-backend --tail 50   # Logs
docker compose restart voicetranslate          # Restart
docker compose up -d --build voicetranslate    # Rebuild + restart
docker compose up -d --force-recreate voicetranslate  # Force recreate

# Backend env file
/opt/voicetranslate/backend/.env

# Backend code
/opt/voicetranslate/backend/
```

### Active AI Services
- **STT**: Groq Whisper (GROQ_API_KEY)
- **Translation**: OpenRouter GPT-4o-mini (OPENROUTER_API_KEY)
- **TTS**: Mock mode (no API key configured)
- **Google OAuth**: 3 client IDs configured (web, android, ios)

### Mobile App Config
- API URL configured in `mobile/src/config/api.config.ts`
- `USE_PRODUCTION_IN_DEV = true` forces production backend even in dev mode
- EAS Build profile: `preview` for Android APK
- APK build has Windows path length issues locally; use EAS cloud builds

### Known Issues
- Local Android gradle build fails on Windows (path length + expo-modules-core error)
- Use `npx eas build --platform android --profile preview` for APK builds
- Google OAuth SHA-1 fingerprint may need updating for EAS signing key
- TTS service runs in mock mode (needs Google Cloud TTS API key)

## Environment Setup

Backend requires `.env` file (copy from `.env.example`):
- `DATABASE_URL` - SQLite for dev, PostgreSQL for prod
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` - min 32 chars each
- `ENCRYPTION_KEY` - for encrypting sensitive data
- AI service keys (optional with mock mode enabled)

## Development Roadmap

See `ROADMAP.md` for full milestone tracking. Current status:
- [x] Milestone 1: Repo Audit
- [x] Milestone 2: VPS Hardening + Docker + SSL
- [x] Milestone 3: Backend Deploy + DNS Cutover
- [ ] Milestone 4: Realtime Pipeline Upgrades
- [ ] Milestone 5: Google Login Reliability Fix
- [ ] Milestone 6: Frontend UX Redesign (5 tabs: Live, Conversation, Text, History, Settings)
- [ ] Milestone 7: Testing Automation
- [ ] Milestone 8: Security Audit + Fixes
- [ ] Milestone 9: Release Readiness

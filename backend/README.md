# VoiceTranslate AI Backend

AI-powered real-time voice translation backend built with Node.js, Fastify, and TypeScript.

## Features

- Real-time voice translation via WebSocket
- Text translation with language detection
- JWT-based authentication with refresh tokens
- Subscription management (Apple/Google receipts)
- Rate limiting and usage tracking
- Comprehensive security measures
- Mock AI services for development

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Fastify 4.x
- **Language**: TypeScript 5.x
- **Database**: SQLite (dev) / PostgreSQL (prod)
- **ORM**: Prisma
- **Authentication**: JWT with refresh tokens
- **Validation**: Zod

## Project Structure

```
backend/
├── src/
│   ├── index.ts              # Server entry point
│   ├── app.ts                # Fastify app configuration
│   ├── routes/
│   │   ├── auth.ts           # Authentication routes
│   │   ├── translate.ts      # Translation routes
│   │   ├── user.ts           # User routes
│   │   └── subscription.ts   # Subscription routes
│   ├── services/
│   │   ├── auth.service.ts   # Auth business logic
│   │   ├── translate.service.ts
│   │   ├── user.service.ts
│   │   ├── subscription.service.ts
│   │   └── ai/
│   │       ├── stt.service.ts    # Speech-to-text
│   │       ├── translation.service.ts
│   │       └── tts.service.ts    # Text-to-speech
│   ├── plugins/
│   │   ├── auth.plugin.ts    # JWT verification
│   │   ├── rateLimit.plugin.ts
│   │   ├── cors.plugin.ts
│   │   └── helmet.plugin.ts
│   ├── websocket/
│   │   └── translation.handler.ts
│   ├── middleware/
│   │   ├── authenticate.ts
│   │   └── validateRequest.ts
│   ├── utils/
│   │   ├── jwt.ts
│   │   ├── crypto.ts
│   │   ├── errors.ts
│   │   └── logger.ts
│   ├── config/
│   │   └── env.ts
│   └── lib/
│       └── prisma.ts
├── prisma/
│   └── schema.prisma
├── tests/
│   ├── auth.test.ts
│   └── translate.test.ts
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Installation

1. **Clone the repository and navigate to backend:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Generate Prisma client:**
   ```bash
   pnpm db:generate
   ```

5. **Push database schema:**
   ```bash
   pnpm db:push
   ```

6. **Start development server:**
   ```bash
   pnpm dev
   ```

The server will start on `http://localhost:3000`.

## Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start development server with hot reload |
| `pnpm build` | Build TypeScript to JavaScript |
| `pnpm start` | Start production server |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:push` | Push schema to database |
| `pnpm db:migrate` | Run database migrations |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm test` | Run tests |
| `pnpm typecheck` | Type check without emitting |

## API Documentation

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register new user |
| `/api/auth/login` | POST | Login with email/password |
| `/api/auth/refresh` | POST | Refresh access token |
| `/api/auth/logout` | POST | Logout (invalidate token) |
| `/api/auth/me` | GET | Get current user |

### Translation

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/translate/text` | POST | Translate text |
| `/api/translate/detect` | POST | Detect language |
| `/api/translate/languages` | GET | Get supported languages |
| `/api/translate/history` | GET | Get translation history |

### User

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/user/profile` | GET | Get user profile |
| `/api/user/profile` | PATCH | Update profile |
| `/api/user/usage` | GET | Get usage statistics |
| `/api/user/history` | GET | Get translation history |

### Subscription

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/subscription/plans` | GET | Get available plans |
| `/api/subscription/status` | GET | Get subscription status |
| `/api/subscription/verify` | POST | Verify app store receipt |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `/ws/translate` | Real-time voice translation |

## WebSocket Protocol

### Connection

Connect with authentication token:
```javascript
const ws = new WebSocket('ws://localhost:3000/ws/translate', {
  headers: { Authorization: 'Bearer <access_token>' }
});
```

### Messages

**Start Session:**
```json
{
  "type": "start_session",
  "data": {
    "sourceLang": "auto",
    "targetLang": "es",
    "enableTTS": true,
    "audioEncoding": "LINEAR16",
    "sampleRate": 16000
  }
}
```

**Send Audio:**
Send binary audio data directly, or base64 encoded:
```json
{
  "type": "audio_chunk",
  "data": "<base64_audio>"
}
```

**End Session:**
```json
{
  "type": "end_session"
}
```

### Response Events

- `session_started` - Session initialized
- `interim_result` - Partial transcription
- `final_result` - Final transcription
- `translation_result` - Translation result
- `audio_result` - TTS audio (if enabled)
- `session_ended` - Session complete
- `error` - Error occurred

## Security Features

- JWT access tokens (15 min expiry)
- Refresh tokens (7 day expiry, rotation)
- bcrypt password hashing (12 rounds)
- Rate limiting (global and per-user)
- CORS whitelist configuration
- Helmet security headers
- Input validation with Zod
- SQL injection protection (Prisma)
- Encrypted API key storage

## Environment Variables

See `.env.example` for all available configuration options.

### Required Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Database connection string |
| `JWT_ACCESS_SECRET` | Secret for access tokens (min 32 chars) |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens (min 32 chars) |
| `ENCRYPTION_KEY` | Key for encrypting sensitive data |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `NODE_ENV` | development | Environment |
| `USE_MOCK_AI_SERVICES` | true | Use mock AI services |
| `LOG_LEVEL` | info | Logging level |

## Subscription Tiers

| Tier | Daily Limit | Monthly Limit | History |
|------|-------------|---------------|---------|
| Free | 10 min | 100 min | 7 days |
| Basic | 60 min | 1000 min | 30 days |
| Premium | 300 min | 5000 min | 90 days |
| Enterprise | Unlimited | Unlimited | 365 days |

## Testing

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:run
```

## Production Deployment

1. Set `NODE_ENV=production`
2. Use PostgreSQL instead of SQLite
3. Set strong secrets for JWT and encryption
4. Configure real AI service API keys
5. Set up proper CORS origins
6. Enable HTTPS
7. Set up database migrations

## License

MIT

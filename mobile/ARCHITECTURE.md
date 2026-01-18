# VoiceTranslate AI - Mobile App Architecture

## Project Structure

```
mobile/
├── app/                              # Expo Router screens
│   ├── (auth)/                       # Authentication flow
│   │   ├── login.tsx                 # ✅ Login with backend integration
│   │   └── signup.tsx                # ✅ NEW - Signup screen
│   ├── (onboarding)/                 # First-time user experience
│   │   └── index.tsx                 # Onboarding slides
│   ├── (tabs)/                       # Main app tabs
│   │   ├── index.tsx                 # ✅ FIXED - Translation screen
│   │   ├── history.tsx               # Translation history
│   │   └── settings.tsx              # ✅ Settings with subscription button
│   ├── subscription.tsx              # ✅ NEW - Subscription plans
│   ├── _layout.tsx                   # Root layout
│   └── index.tsx                     # Entry point
├── src/
│   ├── components/                   # Reusable UI components
│   │   ├── AudioWaveform.tsx
│   │   ├── Button.tsx
│   │   ├── LanguageSelector.tsx
│   │   ├── SubscriptionFeatureCard.tsx
│   │   └── TranslationCard.tsx
│   ├── constants/                    # App constants
│   │   ├── languages.ts              # Language definitions
│   │   └── theme.ts                  # Theme colors and styles
│   ├── services/                     # API and business logic
│   │   ├── api.ts                    # ✅ API client with auth helpers
│   │   ├── audioService.ts           # Audio recording
│   │   ├── subscriptionService.ts    # Subscription logic
│   │   └── translationService.ts     # ✅ FIXED - Real backend calls
│   ├── store/                        # State management (Zustand)
│   │   ├── historyStore.ts           # Translation history
│   │   ├── settingsStore.ts          # App settings
│   │   ├── translationStore.ts       # Translation state
│   │   └── userStore.ts              # ✅ FIXED - Real authentication
│   └── types/                        # TypeScript types
│       └── index.ts
└── package.json
```

---

## Data Flow Architecture

### Authentication Flow
```
┌─────────────┐
│ Login Screen│
└──────┬──────┘
       │
       ├─► authAPI.login(email, password)
       │   └─► POST /api/auth/login
       │       └─► Returns: { user, accessToken, refreshToken }
       │
       ├─► tokenStorage.setTokens(access, refresh)
       │   └─► SecureStore (encrypted)
       │
       ├─► useUserStore.login()
       │   └─► Updates global user state
       │
       └─► Navigate to /(tabs)
```

### Translation Flow
```
┌──────────────────┐
│Translation Screen│
└────────┬─────────┘
         │
    User Input (Text)
         │
         ├─► translationService.translate(text, source, target)
         │   └─► POST /api/translate/text
         │       └─► Returns: { translatedText, detectedLanguage }
         │
         ├─► Update UI with results
         │
         └─► historyStore.addTranslation()
             └─► Saves to AsyncStorage
```

### Subscription Flow
```
┌─────────────────────┐
│ Subscription Screen │
└──────────┬──────────┘
           │
           ├─► subscriptionAPI.getPlans()
           │   └─► GET /api/subscription/plans
           │       └─► Returns: [{ id, name, price, features }]
           │
           ├─► User selects plan
           │
           └─► subscriptionAPI.subscribe(planId)
               └─► POST /api/subscription/subscribe
                   └─► Updates user subscription tier
```

---

## State Management (Zustand)

### User Store
```typescript
useUserStore {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean

  login(email, password)      // ✅ Calls backend
  register(name, email, pwd)  // ✅ Calls backend
  logout()                    // Clears tokens
  loadUser()                  // Loads from storage
}
```

### Translation Store
```typescript
useTranslationStore {
  sourceLanguage: string
  targetLanguage: string
  sourceText: string
  translatedText: string
  detectedLanguage: string
  isRecording: boolean
  isProcessing: boolean
  error: string | null

  // Setters for all state
}
```

### Settings Store
```typescript
useSettingsStore {
  theme: 'light' | 'dark' | 'system'
  autoPlayTranslation: boolean
  saveHistory: boolean
  hapticFeedback: boolean

  // Setters persist to AsyncStorage
}
```

### History Store
```typescript
useHistoryStore {
  translations: Translation[]

  addTranslation(translation)
  removeTranslation(id)
  toggleFavorite(id)
  clearHistory()
}
```

---

## API Service Architecture

### Base API Client
```typescript
class ApiClient {
  private client: AxiosInstance

  // Interceptors:
  // - Request: Adds JWT token to headers
  // - Response: Handles 401 errors, clears tokens

  get<T>(url, params)
  post<T>(url, data)
  put<T>(url, data)
  delete<T>(url)
}
```

### Auth API
```typescript
authAPI {
  login(email, password)
    → POST /api/auth/login

  register(name, email, password)
    → POST /api/auth/register

  refreshToken(refreshToken)
    → POST /api/auth/refresh
}
```

### Subscription API
```typescript
subscriptionAPI {
  getPlans()
    → GET /api/subscription/plans

  subscribe(planId)
    → POST /api/subscription/subscribe

  cancelSubscription()
    → POST /api/subscription/cancel
}
```

### Translation Service
```typescript
translationService {
  translate(text, source, target)
    → POST /api/translate/text

  detectLanguage(text)
    → POST /api/translate/detect

  getSupportedLanguages()
    → GET /api/translate/languages

  // WebSocket methods for real-time
  connectWebSocket(source, target, onMessage)
  sendAudioChunk(audioData)
  disconnect()
}
```

---

## Security Architecture

### Token Management
```
┌──────────────┐
│  SecureStore │ (Encrypted storage)
└──────┬───────┘
       │
       ├─► Access Token (JWT)
       │   └─► Used for all API requests
       │       └─► Auto-injected via interceptor
       │
       └─► Refresh Token (JWT)
           └─► Used to get new access token
               └─► When access token expires
```

### API Request Flow
```
Request → Interceptor → Add Token → Backend
                          ↓
                    Authorization: Bearer <token>
```

### Token Expiration Handling
```
API Response 401
    ↓
Clear all tokens
    ↓
Set isAuthenticated = false
    ↓
Redirect to login
```

---

## UI Component Hierarchy

### Main Translation Screen
```
TranslateScreen
├── Header
│   ├── Title: "VoiceTranslate AI"
│   └── Subtitle: "Speak naturally..."
├── Language Selectors
│   ├── Source Language Dropdown
│   ├── Swap Button (⇄)
│   └── Target Language Dropdown
├── Text Input Modal (NEW)
│   ├── TextInput (multiline)
│   ├── Cancel Button
│   └── Translate Button
├── Source Card
│   ├── Label (with detected language)
│   └── Source Text
├── Translation Card
│   ├── Label: "Translation"
│   └── Translated Text OR Processing Indicator
├── Error Display (if error)
└── Bottom Controls
    ├── Text Button (📝)
    └── Mic Button (🎤)
```

### Subscription Screen
```
SubscriptionScreen
├── Header
│   ├── Back Button
│   ├── Title: "Choose Your Plan"
│   └── Subtitle
├── Plans List (ScrollView)
│   ├── Free Plan Card
│   ├── Basic Plan Card
│   ├── Premium Plan Card (POPULAR badge)
│   └── Enterprise Plan Card
│       Each card:
│       ├── Name
│       ├── Price ($/month)
│       ├── Features List (✓)
│       └── Subscribe Button
└── Footer
    └── Terms & conditions text
```

---

## Navigation Structure

```
App Root
│
├─ Onboarding (first time only)
│  └─► Login/Signup
│
├─ (auth) Stack
│  ├─ login.tsx → Can navigate to signup
│  └─ signup.tsx → Can navigate back to login
│
└─ (tabs) Main App
   ├─ index.tsx (Translate)
   ├─ history.tsx
   └─ settings.tsx → Can navigate to /subscription
```

---

## Theme System

### Color Palette
```typescript
Light Mode:
- background: #FFFFFF
- text: #000000
- primary: #6366F1 (indigo)
- gradient1: #6366F1
- gradient2: #8B5CF6

Dark Mode:
- background: #000000
- text: #FFFFFF
- primary: #818CF8 (lighter indigo)
- gradient1: #818CF8
- gradient2: #A78BFA
```

### Responsive Theming
```
useColorScheme() → 'light' | 'dark'
    ↓
useSettingsStore.theme → 'light' | 'dark' | 'system'
    ↓
createTheme(isDark) → Theme object
    ↓
Applied to all components
```

---

## Error Handling Strategy

### API Errors
```typescript
try {
  await apiClient.post('/endpoint', data)
} catch (error) {
  if (error.response?.status === 401) {
    // Clear tokens, redirect to login
  } else if (error.response?.status === 400) {
    // Show validation error to user
  } else {
    // Show generic error message
  }
}
```

### User-Facing Messages
- Network errors → "Please check your connection"
- Auth errors → "Invalid credentials"
- Validation errors → Specific field errors
- Generic errors → "Something went wrong"

---

## Performance Optimizations

1. **Code Splitting**: Screens loaded on-demand via Expo Router
2. **Memoization**: React.memo for expensive components
3. **Lazy Loading**: Images and heavy components
4. **Debouncing**: Search and input fields
5. **Cache**: AsyncStorage for user data, history
6. **Optimistic Updates**: UI updates before API response

---

## Testing Strategy

### Unit Tests
- Services (API, Translation)
- Stores (Zustand)
- Utility functions

### Integration Tests
- Login flow
- Translation flow
- Subscription flow

### E2E Tests (Detox)
- Complete user journeys
- Cross-screen navigation
- Error scenarios

---

## Backend API Contract

### Expected Response Formats

#### Authentication
```json
POST /api/auth/login
Response: {
  "user": {
    "id": "string",
    "email": "string",
    "name": "string",
    "subscriptionTier": "free" | "premium"
  },
  "accessToken": "jwt_string",
  "refreshToken": "jwt_string"
}
```

#### Translation
```json
POST /api/translate/text
Request: {
  "text": "Hello",
  "sourceLanguage": "en",
  "targetLanguage": "es"
}
Response: {
  "translatedText": "Hola",
  "detectedLanguage": "en",
  "confidence": 0.98
}
```

#### Subscription
```json
GET /api/subscription/plans
Response: [{
  "id": "premium",
  "name": "Premium",
  "price": 19.99,
  "currency": "USD",
  "interval": "month",
  "features": ["Unlimited translations", "..."]
}]
```

---

## Development vs Production

### Development Mode
```typescript
if (__DEV__) {
  API_BASE_URL = 'http://localhost:3000/api'
  // Android: http://10.0.2.2:3000/api
  LOG_LEVEL = 'debug'
}
```

### Production Mode
```typescript
if (!__DEV__) {
  API_BASE_URL = 'https://api.voicetranslate.ai/api'
  LOG_LEVEL = 'error'
  ENABLE_ANALYTICS = true
}
```

---

## Summary

The app now features:
- Real backend integration with JWT authentication
- Clean separation of concerns (UI, State, Services)
- Type-safe TypeScript throughout
- Modern UI with animations and gradients
- Secure token storage
- Comprehensive error handling
- Scalable architecture for future features

All mock data has been removed and replaced with real API calls to the backend.

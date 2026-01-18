# VoiceTranslate AI - Quick Start Guide

## Prerequisites

1. **Backend Running**
   ```bash
   cd ../backend
   npm install
   npm start
   ```
   Backend should be running at: `http://localhost:3000`

2. **Mobile Development Environment**
   - Node.js 18+ installed
   - Expo CLI installed globally
   - iOS Simulator (Mac) or Android Emulator (Windows/Mac/Linux)
   - Or Expo Go app on physical device

---

## Installation

```bash
cd mobile
npm install
```

---

## Running the App

### Option 1: Start Development Server
```bash
npm start
```

Then choose:
- Press `i` for iOS Simulator
- Press `a` for Android Emulator
- Scan QR code with Expo Go app (physical device)

### Option 2: Direct Platform Start
```bash
# iOS
npm run ios

# Android
npm run android

# Web (for quick testing)
npm run web
```

---

## Testing the New Features

### 1. Test Sign Up Flow

**Steps:**
1. Open app → Skip onboarding (or go through it)
2. On login screen, click "Sign Up" link at bottom
3. Fill in the form:
   - Full Name: "Test User"
   - Email: "test@example.com"
   - Password: "password123"
   - Confirm Password: "password123"
4. Click "Create Account"
5. Should navigate to main app with user logged in

**Expected Backend Call:**
```
POST http://localhost:3000/api/auth/register
Body: {
  "name": "Test User",
  "email": "test@example.com",
  "password": "password123"
}
```

---

### 2. Test Login Flow

**Steps:**
1. From login screen, enter:
   - Email: "test@example.com"
   - Password: "password123"
2. Click "Sign In"
3. Should navigate to main translation screen

**Expected Backend Call:**
```
POST http://localhost:3000/api/auth/login
Body: {
  "email": "test@example.com",
  "password": "password123"
}
```

---

### 3. Test Real Translation

**Steps:**
1. On main translation screen
2. Select languages (e.g., English → Spanish)
3. Click the text button (📝)
4. Type: "Hello, how are you today?"
5. Click "Translate"
6. Wait for processing
7. See real translation from backend

**Expected Backend Call:**
```
POST http://localhost:3000/api/translate/text
Body: {
  "text": "Hello, how are you today?",
  "sourceLanguage": "en",
  "targetLanguage": "es"
}
```

**Expected Result:**
- Source card shows: "Hello, how are you today?"
- Translation card shows Spanish translation
- Translation saved to history

---

### 4. Test Language Detection

**Steps:**
1. On main translation screen
2. Set source language to "Auto Detect"
3. Set target language to any language
4. Click text button and type text
5. Click "Translate"
6. Should detect language automatically

**Expected Result:**
- Source card shows: "Detected: EN" (or detected language)
- Translation appears correctly

---

### 5. Test Subscription Screen

**Steps:**
1. Navigate to Settings tab
2. If logged in, see user profile card
3. Click "Upgrade" button
4. See subscription plans screen with 4 tiers
5. Premium tier has "MOST POPULAR" badge
6. Click "Subscribe" on any plan

**Expected Backend Call:**
```
GET http://localhost:3000/api/subscription/plans
```

**Expected Backend Call on Subscribe:**
```
POST http://localhost:3000/api/subscription/subscribe
Body: {
  "planId": "premium"
}
```

---

### 6. Test Translation History

**Steps:**
1. Perform multiple translations
2. Navigate to History tab
3. See list of past translations
4. Can favorite/unfavorite translations
5. Can delete translations

**Storage:**
- Saved in AsyncStorage locally
- Persists across app restarts

---

### 7. Test Settings

**Steps:**
1. Navigate to Settings tab
2. See user profile (if logged in):
   - Name
   - Email
   - Subscription tier badge (FREE/PREMIUM)
3. Toggle theme (Light/Dark/System)
4. Toggle app settings
5. Click "Sign Out" to logout

---

## Troubleshooting

### Backend Connection Issues (Android)

If you see connection errors on Android emulator:

1. Backend URL should automatically use `10.0.2.2` instead of `localhost`
2. Check `src/services/api.ts` line 8-9
3. Make sure backend is running on `http://localhost:3000`

### Backend Connection Issues (iOS)

If you see connection errors on iOS simulator:

1. Backend URL should use `localhost`
2. Make sure backend is running
3. Check firewall settings

### Backend Not Responding

1. Check backend is running: `cd ../backend && npm start`
2. Test backend directly: `curl http://localhost:3000/api/health`
3. Check backend logs for errors

### App Crashes on Login

1. Check backend returns correct response format
2. Check SecureStore is working (simulator/device only, not web)
3. Check console logs for error messages

---

## Checking Backend Integration

### 1. Monitor Network Calls

Open React Native Debugger:
- Press `j` in terminal running `npm start`
- Or shake device → "Debug" menu
- Open Network tab to see all API calls

### 2. Check Console Logs

Look for:
```
✓ Login successful
✓ Translation API call: POST /translate/text
✓ Subscription plans loaded
✗ API Error: [error details]
```

### 3. Verify Token Storage

In console:
```javascript
import * as SecureStore from 'expo-secure-store';
await SecureStore.getItemAsync('vt_access_token');
// Should return JWT token after login
```

---

## Testing Authentication Flow

### Complete Auth Test

1. **Start Fresh**
   - Clear app data (reinstall or clear storage)
   - Open app

2. **Sign Up**
   - Create new account
   - Check backend receives request
   - Check JWT tokens saved

3. **Login**
   - Close and reopen app
   - Login with same credentials
   - Check token retrieved from storage

4. **Logout**
   - Click "Sign Out" in Settings
   - Check tokens cleared
   - Redirected to login screen

5. **Guest Mode**
   - Click "Continue as Guest"
   - Access main app without auth
   - Some features may be limited

---

## Testing Translation Flow

### Complete Translation Test

1. **Basic Translation**
   - English → Spanish: "Hello" → "Hola"
   - Check API called with correct params
   - Check result displayed

2. **Auto Detection**
   - Source: "Auto Detect"
   - Type Spanish text
   - Should detect "es"
   - Translate correctly

3. **Multiple Languages**
   - Try: English → French
   - Try: Turkish → English
   - Try: Chinese → Spanish
   - All should work via backend

4. **Error Handling**
   - Turn off backend
   - Try translation
   - Should show error message
   - Turn backend back on
   - Should work again

---

## Development Tips

### Hot Reload

- Expo supports fast refresh
- Save file → See changes immediately
- No need to rebuild

### Debugging

```javascript
// Add console logs
console.log('Translation request:', { text, sourceLanguage, targetLanguage });

// Use React Developer Tools
// Press `m` in terminal for menu
```

### Testing API Without UI

```javascript
// In app console
import { translationService } from './src/services/translationService';
const result = await translationService.translate('Hello', 'en', 'es');
console.log(result);
```

---

## Environment Variables

Create `.env` file (if needed):
```
EXPO_PUBLIC_API_URL=http://localhost:3000/api
EXPO_PUBLIC_WS_URL=ws://localhost:3000/ws
```

---

## Build for Production

### iOS
```bash
eas build --platform ios
```

### Android
```bash
eas build --platform android
```

### Both
```bash
eas build --platform all
```

Note: Requires Expo EAS account

---

## Common Scenarios

### Scenario 1: "I want to test translation without backend"

The old mock data has been removed. You need to:
1. Start the backend server
2. Or temporarily add mock responses in `translationService.ts`

### Scenario 2: "Translation button doesn't work"

Check:
1. Backend is running
2. Text input is not empty
3. Languages are selected
4. Check console for errors

### Scenario 3: "Can't login"

Check:
1. Backend auth endpoint is working
2. User exists in database
3. Password is correct
4. JWT token is being returned

### Scenario 4: "App shows old data"

Clear app data:
- iOS Simulator: Device → Erase All Content and Settings
- Android Emulator: Settings → Apps → VoiceTranslate → Clear Data
- Physical Device: Uninstall and reinstall

---

## Success Checklist

After completing the quick start, you should be able to:

- [x] Create new account via signup screen
- [x] Login with created account
- [x] See real translations from backend
- [x] Detect language automatically
- [x] View subscription plans
- [x] See user profile in settings
- [x] Logout successfully
- [x] App saves translation history
- [x] Dark mode works
- [x] All navigation flows work

---

## Next Steps

1. Test on physical device (iOS/Android)
2. Test all edge cases (network errors, invalid input, etc.)
3. Add real speech recognition (optional)
4. Configure push notifications (optional)
5. Set up analytics (optional)
6. Deploy to App Store / Play Store

---

## Support

If you encounter issues:

1. Check backend logs
2. Check mobile app console logs
3. Verify API endpoints are correct
4. Check network connectivity
5. Restart both backend and app

---

## Summary

The app is now fully functional with:
- Real backend API integration
- Complete authentication flow
- Real-time translation
- Subscription management
- Modern, elegant UI

All mock data has been removed. The app is ready for MVP testing!

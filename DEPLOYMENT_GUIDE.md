# VoiceTranslate AI - Production Deployment Guide

Bu rehber, VoiceTranslate AI uygulamasını production ortamına deploy etmek için gereken tüm adımları içerir.

## İçindekiler
1. [Gerekli Hesaplar](#1-gerekli-hesaplar)
2. [Database Kurulumu (Supabase)](#2-database-kurulumu-supabase)
3. [Email Servisi (Resend)](#3-email-servisi-resend)
4. [Google OAuth Kurulumu](#4-google-oauth-kurulumu)
5. [Backend Deployment (Railway)](#5-backend-deployment-railway)
6. [Mobile App Build](#6-mobile-app-build)
7. [Google Play Store Yayınlama](#7-google-play-store-yayınlama)

---

## 1. Gerekli Hesaplar

Aşağıdaki servislerde **ücretsiz** hesap oluşturmanız gerekiyor:

| Servis | URL | Ücretsiz Plan |
|--------|-----|---------------|
| Supabase (Database) | https://supabase.com | 500MB, 50K requests/ay |
| Resend (Email) | https://resend.com | 3000 email/ay |
| Railway (Backend Hosting) | https://railway.app | $5 kredi/ay |
| Google Cloud | https://console.cloud.google.com | OAuth ücretsiz |
| Google Play Console | https://play.google.com/console | $25 tek seferlik |

---

## 2. Database Kurulumu (Supabase)

### Adım 1: Supabase Hesabı Oluştur
1. https://supabase.com adresine git
2. "Start your project" butonuna tıkla
3. GitHub ile giriş yap (en kolay yol)

### Adım 2: Yeni Proje Oluştur
1. "New Project" butonuna tıkla
2. Proje adı: `voicetranslate-ai`
3. Database password: Güçlü bir şifre oluştur (BUNU KAYDET!)
4. Region: `Frankfurt (eu-central-1)` (Türkiye'ye en yakın)
5. "Create new project" butonuna tıkla

### Adım 3: Database URL'ini Al
1. Proje dashboard'unda "Settings" > "Database" sekmesine git
2. "Connection string" bölümünden "URI" seçeneğini seç
3. `[YOUR-PASSWORD]` kısmını yukarıda belirlediğin şifre ile değiştir
4. Bu URL'i kopyala - bu senin `DATABASE_URL`

Örnek format:
```
postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres
```

---

## 3. Email Servisi (Resend)

### Adım 1: Resend Hesabı Oluştur
1. https://resend.com adresine git
2. "Start for free" butonuna tıkla
3. Email ile kayıt ol

### Adım 2: API Key Oluştur
1. Dashboard'da "API Keys" sekmesine git
2. "Create API Key" butonuna tıkla
3. Name: `voicetranslate-production`
4. Permission: `Full access`
5. "Create" butonuna tıkla
6. API Key'i kopyala (BUNU KAYDET! Bir daha göremezsin)

Örnek format:
```
re_xxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Adım 3: Domain Doğrulama (İsteğe bağlı)
Ücretsiz planda `onboarding@resend.dev` adresinden email gönderilir.
Kendi domain'inden göndermek için:
1. "Domains" sekmesine git
2. Domain'ini ekle ve DNS kayıtlarını ayarla

---

## 4. Google OAuth Kurulumu

### Adım 1: Google Cloud Project Oluştur
1. https://console.cloud.google.com adresine git
2. Üst menüden proje seçiciye tıkla
3. "New Project" butonuna tıkla
4. Project name: `VoiceTranslate AI`
5. "Create" butonuna tıkla

### Adım 2: OAuth Consent Screen Ayarla
1. Sol menüden "APIs & Services" > "OAuth consent screen" seç
2. User Type: "External" seç
3. "Create" butonuna tıkla
4. App information doldur:
   - App name: `VoiceTranslate AI`
   - User support email: Senin email adresin
   - Developer contact: Senin email adresin
5. "Save and Continue" butonuna tıkla
6. Scopes sayfasında "Save and Continue" tıkla
7. Test users sayfasında kendi email adresini ekle
8. "Save and Continue" tıkla

### Adım 3: OAuth Client ID Oluştur (Web)
1. Sol menüden "APIs & Services" > "Credentials" seç
2. "Create Credentials" > "OAuth client ID" seç
3. Application type: "Web application"
4. Name: `VoiceTranslate Web`
5. Authorized JavaScript origins ekle:
   - `http://localhost:3001`
   - `https://your-backend-url.railway.app` (deploy sonrası)
6. Authorized redirect URIs ekle:
   - `http://localhost:3001/auth/callback`
   - `https://your-backend-url.railway.app/auth/callback`
7. "Create" butonuna tıkla
8. Client ID ve Client Secret'ı kopyala

### Adım 4: OAuth Client ID Oluştur (Android)
1. "Create Credentials" > "OAuth client ID" seç
2. Application type: "Android"
3. Name: `VoiceTranslate Android`
4. Package name: `com.voicetranslate.ai` (uygulamanın package name'i)
5. SHA-1 certificate fingerprint almak için:
   ```bash
   # Debug key için (development):
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android

   # Release key için (production):
   keytool -list -v -keystore your-release-key.keystore -alias your-alias
   ```
6. SHA-1 fingerprint'i yapıştır
7. "Create" butonuna tıkla
8. Client ID'yi kopyala

### Adım 5: OAuth Client ID Oluştur (iOS)
1. "Create Credentials" > "OAuth client ID" seç
2. Application type: "iOS"
3. Name: `VoiceTranslate iOS`
4. Bundle ID: `com.voicetranslate.ai`
5. "Create" butonuna tıkla
6. Client ID'yi kopyala

---

## 5. Backend Deployment (Railway)

### Adım 1: Railway Hesabı Oluştur
1. https://railway.app adresine git
2. "Start a New Project" butonuna tıkla
3. GitHub ile giriş yap

### Adım 2: GitHub Repo'yu Bağla
1. "Deploy from GitHub repo" seç
2. Repository'ni seç: `Project_Translator`
3. "Deploy Now" butonuna tıkla

### Adım 3: Environment Variables Ekle
Railway dashboard'da projeye tıkla, "Variables" sekmesine git ve şunları ekle:

```env
# Server
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# Database (Supabase'den)
DATABASE_URL=postgresql://postgres:xxxx@db.xxxx.supabase.co:5432/postgres

# JWT Secrets (OpenSSL ile oluştur: openssl rand -hex 64)
JWT_ACCESS_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
JWT_REFRESH_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Security
ENCRYPTION_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
BCRYPT_ROUNDS=12

# Google OAuth
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
GOOGLE_ANDROID_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_IOS_CLIENT_ID=xxxxx.apps.googleusercontent.com

# Email (Resend)
RESEND_API_KEY=re_xxxxx
EMAIL_FROM=VoiceTranslate <noreply@voicetranslate.ai>
APP_URL=https://your-app.railway.app

# AI Services
GROQ_API_KEY=gsk_xxxxx
OPENROUTER_API_KEY=sk-or-xxxxx
OPENROUTER_MODEL=openai/gpt-4o-mini

# Feature Flags
USE_MOCK_AI_SERVICES=false
ENABLE_REQUEST_LOGGING=true
LOG_LEVEL=info
```

### Adım 4: Build Settings
1. "Settings" sekmesine git
2. Root Directory: `backend`
3. Build Command: `npm install && npm run db:generate && npm run build`
4. Start Command: `npm start`

### Adım 5: Deploy Et
1. "Deploy" butonuna tıkla
2. Build loglarını takip et
3. Deploy başarılı olunca URL'i al

---

## 6. Mobile App Build

### APK Oluşturma (Android)

#### Adım 1: EAS CLI Kur
```bash
npm install -g eas-cli
```

#### Adım 2: Expo Hesabı Oluştur
```bash
eas login
# veya https://expo.dev adresinden kayıt ol
```

#### Adım 3: Proje Yapılandır
```bash
cd mobile
eas build:configure
```

#### Adım 4: app.json Güncelle
```json
{
  "expo": {
    "name": "VoiceTranslate AI",
    "slug": "voicetranslate-ai",
    "version": "1.0.0",
    "android": {
      "package": "com.voicetranslate.ai",
      "versionCode": 1
    },
    "ios": {
      "bundleIdentifier": "com.voicetranslate.ai"
    }
  }
}
```

#### Adım 5: Production API URL Güncelle
`mobile/src/services/api.ts` dosyasında:
```typescript
const getApiBaseUrl = () => {
  if (__DEV__) {
    // Development
    const host = Platform.OS === 'android' ? '192.168.0.187' : 'localhost';
    return `http://${host}:3001/api`;
  }
  // Production - Railway URL'ini buraya yaz
  return 'https://your-app.railway.app/api';
};
```

#### Adım 6: APK Build Et
```bash
# Development APK (test için)
eas build --platform android --profile preview

# Production APK (Play Store için)
eas build --platform android --profile production
```

---

## 7. Google Play Store Yayınlama

### Adım 1: Google Play Console Hesabı
1. https://play.google.com/console adresine git
2. $25 tek seferlik ödeme yap
3. Developer hesabı bilgilerini doldur

### Adım 2: Yeni Uygulama Oluştur
1. "Create app" butonuna tıkla
2. App details:
   - App name: VoiceTranslate AI
   - Default language: English (US)
   - App or game: App
   - Free or paid: Free
3. Declarations'ları kabul et

### Adım 3: Store Listing Doldur
1. Main store listing:
   - Short description (80 karakter)
   - Full description (4000 karakter)
   - Screenshots (en az 2 tane, 1024x500 veya 500x1024)
   - Feature graphic (1024x500)
   - App icon (512x512)

### Adım 4: Content Rating
1. "Content rating" bölümüne git
2. Questionnaire'i doldur
3. Rating al

### Adım 5: Privacy Policy
1. Bir privacy policy sayfası oluştur
2. URL'i "App content" > "Privacy policy" bölümüne ekle

### Adım 6: APK/AAB Yükle
1. "Release" > "Production" sekmesine git
2. "Create new release" butonuna tıkla
3. AAB dosyasını yükle (EAS build'den aldığın)
4. Release notes yaz

### Adım 7: Review İçin Gönder
1. Tüm kontrollerin tamamlandığından emin ol
2. "Start rollout to Production" butonuna tıkla
3. Google review sürecini bekle (genellikle 1-3 gün)

---

## Hızlı Başlangıç Checklist

- [ ] Supabase hesabı oluştur ve DATABASE_URL al
- [ ] Resend hesabı oluştur ve API key al
- [ ] Google Cloud projesi oluştur
- [ ] OAuth Web Client ID oluştur
- [ ] OAuth Android Client ID oluştur (SHA-1 ile)
- [ ] Railway hesabı oluştur
- [ ] GitHub repo'yu Railway'e bağla
- [ ] Environment variables ekle
- [ ] Backend deploy et ve URL al
- [ ] Mobile app'te production URL güncelle
- [ ] EAS ile APK build et
- [ ] Google Play Console hesabı oluştur
- [ ] Store listing doldur
- [ ] APK yükle ve review'a gönder

---

## Destek

Sorularınız için:
- GitHub Issues: https://github.com/your-repo/issues
- Email: support@voicetranslate.ai

/**
 * =============================================================================
 * Fastify Application Setup
 * =============================================================================
 * Main application configuration with all plugins, routes, and middleware.
 * =============================================================================
 */

import Fastify, { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { env, isDevelopment } from './config/env.js';
import { createLogger } from './utils/logger.js';
import { isAppError, toAppError } from './utils/errors.js';

// Plugins
import { registerCorsPlugin } from './plugins/cors.plugin.js';
import { registerHelmetPlugin, additionalSecurityHeaders } from './plugins/helmet.plugin.js';
import { registerRateLimitPlugin } from './plugins/rateLimit.plugin.js';
import { registerAuthPlugin } from './plugins/auth.plugin.js';

// Routes
import { authRoutes } from './routes/auth.js';
import { translateRoutes } from './routes/translate.js';
import { userRoutes } from './routes/user.js';
import { subscriptionRoutes } from './routes/subscription.js';

// WebSocket
import { registerWebSocketHandler, getActiveSessionCount } from './websocket/translation.handler.js';

// Database
import { connectDatabase, checkDatabaseHealth } from './lib/prisma.js';

const logger = createLogger('app');

/**
 * Build and configure the Fastify application.
 */
export async function buildApp(): Promise<FastifyInstance> {
  // Create Fastify instance with configuration
  const app = Fastify({
    logger: isDevelopment
      ? {
          level: env.LOG_LEVEL,
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
            },
          },
        }
      : {
          level: env.LOG_LEVEL,
        },

    // Request ID generation
    genReqId: () => `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,

    // Trust proxy headers (for rate limiting, logging IP addresses)
    trustProxy: true,

    // Body size limits
    bodyLimit: 10 * 1024 * 1024, // 10MB max body size

    // Disable automatic query string parsing (we'll use Zod)
    querystringParser: (str: string) => {
      const params = new URLSearchParams(str);
      const result: Record<string, string | string[]> = {};
      for (const [key, value] of params) {
        if (result[key]) {
          if (Array.isArray(result[key])) {
            (result[key] as string[]).push(value);
          } else {
            result[key] = [result[key] as string, value];
          }
        } else {
          result[key] = value;
        }
      }
      return result;
    },
  });

  // ==========================================================================
  // Register Plugins
  // ==========================================================================

  // CORS - must be registered first
  await registerCorsPlugin(app);

  // Security headers
  await registerHelmetPlugin(app);
  additionalSecurityHeaders(app);

  // Rate limiting
  await registerRateLimitPlugin(app);

  // Authentication
  await registerAuthPlugin(app);

  // ==========================================================================
  // Request Logging Hook
  // ==========================================================================

  if (env.ENABLE_REQUEST_LOGGING) {
    app.addHook('onRequest', async (request: FastifyRequest) => {
      request.log.info({
        msg: 'Incoming request',
        method: request.method,
        url: request.url,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });
    });

    app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
      request.log.info({
        msg: 'Request completed',
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      });
    });
  }

  // ==========================================================================
  // Error Handler
  // ==========================================================================

  app.setErrorHandler(async (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    // Convert to AppError for consistent handling
    const appError = isAppError(error) ? error : toAppError(error);

    // Log error
    if (appError.statusCode >= 500) {
      logger.error('Server error', { requestId: request.id }, error);
    } else if (appError.statusCode >= 400) {
      logger.warn('Client error', {
        requestId: request.id,
        code: appError.code,
        message: appError.message,
      });
    }

    // Send error response
    const response = appError.toResponse(request.id);

    // Don't expose internal error details in production
    if (!isDevelopment && appError.statusCode >= 500) {
      response.error.message = 'Internal server error';
      delete response.error.details;
    }

    return reply.status(appError.statusCode).send(response);
  });

  // ==========================================================================
  // Not Found Handler
  // ==========================================================================

  app.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(404).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
      timestamp: new Date().toISOString(),
      requestId: request.id,
    });
  });

  // ==========================================================================
  // Health Check Routes
  // ==========================================================================

  // Basic health check
  app.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness check (for load balancers)
  app.get('/ready', async (_request: FastifyRequest, reply: FastifyReply) => {
    const dbHealthy = await checkDatabaseHealth();

    if (!dbHealthy) {
      return reply.status(503).send({
        status: 'not_ready',
        reason: 'Database connection failed',
        timestamp: new Date().toISOString(),
      });
    }

    return reply.send({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  });

  // Metrics endpoint (basic)
  app.get('/metrics', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      activeWebSocketSessions: getActiveSessionCount(),
      timestamp: new Date().toISOString(),
    });
  });

  // ==========================================================================
  // API Routes
  // ==========================================================================

  // API version prefix
  app.register(
    async (api) => {
      // Authentication routes
      api.register(authRoutes, { prefix: '/auth' });

      // Translation routes
      api.register(translateRoutes, { prefix: '/translate' });

      // User routes
      api.register(userRoutes, { prefix: '/user' });

      // Subscription routes
      api.register(subscriptionRoutes, { prefix: '/subscription' });
    },
    { prefix: '/api' }
  );

  // ==========================================================================
  // WebSocket Handler
  // ==========================================================================

  await registerWebSocketHandler(app);

  // ==========================================================================
  // Root Route
  // ==========================================================================

  app.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      name: 'VoiceTranslate AI API',
      version: '1.0.0',
      description: 'AI-powered real-time voice translation service',
      documentation: '/docs',
      health: '/health',
      testPage: '/test',
      timestamp: new Date().toISOString(),
    });
  });

  // ==========================================================================
  // Test Page (Development Only)
  // ==========================================================================

  if (isDevelopment) {
    app.get('/test', async (_request: FastifyRequest, reply: FastifyReply) => {
      const testPageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VoiceTranslate AI - Test Page</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { text-align: center; margin-bottom: 30px; font-size: 2rem; }
    .status {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
      padding: 15px;
      background: rgba(255,255,255,0.1);
      border-radius: 10px;
    }
    .status-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #ff4444;
    }
    .status-dot.connected { background: #44ff44; }
    .status-dot.recording { background: #ffaa00; animation: pulse 1s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .controls {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-bottom: 20px;
    }
    .control-group { display: flex; flex-direction: column; gap: 5px; }
    label { font-size: 0.9rem; opacity: 0.8; }
    select, button {
      padding: 12px 20px;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      cursor: pointer;
    }
    select {
      background: rgba(255,255,255,0.1);
      color: #fff;
    }
    select option { background: #1a1a2e; }
    .btn-record {
      grid-column: 1 / -1;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff;
      font-size: 1.2rem;
      padding: 20px;
      transition: all 0.3s;
    }
    .btn-record:hover { transform: scale(1.02); }
    .btn-record.recording {
      background: linear-gradient(135deg, #f5576c 0%, #f093fb 100%);
    }
    .btn-record:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .results {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    .result-box {
      background: rgba(255,255,255,0.05);
      border-radius: 10px;
      padding: 20px;
      min-height: 200px;
    }
    .result-box h3 {
      margin-bottom: 15px;
      font-size: 0.9rem;
      text-transform: uppercase;
      opacity: 0.7;
    }
    .result-text {
      font-size: 1.1rem;
      line-height: 1.6;
      min-height: 100px;
    }
    .confidence {
      margin-top: 15px;
      font-size: 0.8rem;
      opacity: 0.6;
    }
    .log-container {
      margin-top: 20px;
      background: rgba(0,0,0,0.3);
      border-radius: 10px;
      padding: 15px;
      max-height: 200px;
      overflow-y: auto;
    }
    .log-container h3 { margin-bottom: 10px; font-size: 0.9rem; opacity: 0.7; }
    .log-entry {
      font-family: monospace;
      font-size: 0.85rem;
      padding: 3px 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .log-entry.error { color: #ff6b6b; }
    .log-entry.success { color: #69db7c; }
    .log-entry.info { color: #74c0fc; }
    @media (max-width: 768px) {
      .controls, .results { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎙️ VoiceTranslate AI Test</h1>

    <div class="status">
      <div id="statusDot" class="status-dot"></div>
      <span id="statusText">Disconnected</span>
    </div>

    <div class="controls">
      <div class="control-group">
        <label>Source Language</label>
        <select id="sourceLang">
          <option value="auto" selected>Auto Detect</option>
          <option value="en">English</option>
          <option value="tr">Turkish</option>
          <option value="de">German</option>
          <option value="fr">French</option>
          <option value="es">Spanish</option>
          <option value="it">Italian</option>
          <option value="pt">Portuguese</option>
          <option value="ru">Russian</option>
          <option value="ja">Japanese</option>
          <option value="ko">Korean</option>
          <option value="zh">Chinese</option>
          <option value="ar">Arabic</option>
        </select>
      </div>
      <div class="control-group">
        <label>Target Language</label>
        <select id="targetLang">
          <option value="en" selected>English</option>
          <option value="tr">Turkish</option>
          <option value="de">German</option>
          <option value="fr">French</option>
          <option value="es">Spanish</option>
          <option value="it">Italian</option>
          <option value="pt">Portuguese</option>
          <option value="ru">Russian</option>
          <option value="ja">Japanese</option>
          <option value="ko">Korean</option>
          <option value="zh">Chinese</option>
          <option value="ar">Arabic</option>
        </select>
      </div>
      <button id="btnRecord" class="btn-record" disabled>🎤 Connect & Start Recording</button>
    </div>

    <div class="results">
      <div class="result-box">
        <h3>📝 Original (Transcript)</h3>
        <div id="transcript" class="result-text">Press the button and speak...</div>
        <div id="transcriptConfidence" class="confidence"></div>
      </div>
      <div class="result-box">
        <h3>🌐 Translation</h3>
        <div id="translation" class="result-text">Translation will appear here...</div>
        <div id="translationConfidence" class="confidence"></div>
      </div>
    </div>

    <div class="log-container">
      <h3>📋 Activity Log</h3>
      <div id="log"></div>
    </div>
  </div>

  <script>
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const btnRecord = document.getElementById('btnRecord');
    const sourceLang = document.getElementById('sourceLang');
    const targetLang = document.getElementById('targetLang');
    const transcriptEl = document.getElementById('transcript');
    const translationEl = document.getElementById('translation');
    const transcriptConfidence = document.getElementById('transcriptConfidence');
    const translationConfidence = document.getElementById('translationConfidence');
    const logEl = document.getElementById('log');

    let ws = null;
    let mediaRecorder = null;
    let audioContext = null;
    let isRecording = false;

    function log(message, type = 'info') {
      const entry = document.createElement('div');
      entry.className = 'log-entry ' + type;
      entry.textContent = new Date().toLocaleTimeString() + ' - ' + message;
      logEl.insertBefore(entry, logEl.firstChild);
      console.log('[' + type.toUpperCase() + ']', message);
    }

    function setStatus(status) {
      statusDot.className = 'status-dot ' + status;
      if (status === 'connected') {
        statusText.textContent = 'Connected - Ready';
        btnRecord.disabled = false;
        btnRecord.textContent = '🎤 Start Recording';
      } else if (status === 'recording') {
        statusText.textContent = 'Recording...';
        btnRecord.textContent = '⏹️ Stop Recording';
        btnRecord.classList.add('recording');
      } else {
        statusText.textContent = 'Disconnected';
        btnRecord.disabled = true;
        btnRecord.textContent = '🎤 Connect & Start Recording';
        btnRecord.classList.remove('recording');
      }
    }

    async function connectWebSocket() {
      log('Connecting to WebSocket...');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = protocol + '//' + window.location.host + '/ws/translate?test=true';

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        log('WebSocket connected!', 'success');
        setStatus('connected');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          log('Received: ' + msg.type, 'info');

          switch (msg.type) {
            case 'session_started':
              log('Session started: ' + msg.data.sessionId, 'success');
              sessionStarted = true;
              if (pendingStream) {
                beginRecording(pendingStream);
                pendingStream = null;
              }
              break;
            case 'final_result':
              transcriptEl.textContent = msg.data.transcript || 'No speech detected';
              transcriptConfidence.textContent = 'Confidence: ' + Math.round((msg.data.confidence || 0) * 100) + '% | Language: ' + (msg.data.detectedLanguage || 'unknown');
              log('Transcript received: ' + (msg.data.transcript || '').substring(0, 50) + '...', 'success');
              break;
            case 'translation_result':
              translationEl.textContent = msg.data.translatedText || 'No translation';
              translationConfidence.textContent = msg.data.sourceLang + ' → ' + msg.data.targetLang + ' | Confidence: ' + Math.round((msg.data.confidence || 0) * 100) + '%';
              log('Translation received!', 'success');
              break;
            case 'session_ended':
              log('Session ended. Duration: ' + msg.data.durationMs + 'ms, Chunks: ' + msg.data.audioChunksProcessed, 'info');
              setStatus('connected');
              isRecording = false;
              break;
            case 'error':
              log('Error: ' + msg.data.message, 'error');
              break;
            case 'pong':
              log('Pong received', 'info');
              break;
          }
        } catch (e) {
          log('Failed to parse message: ' + e.message, 'error');
        }
      };

      ws.onclose = (event) => {
        log('WebSocket closed: ' + event.code + ' - ' + event.reason, 'error');
        setStatus('');
        ws = null;
      };

      ws.onerror = (error) => {
        log('WebSocket error', 'error');
        console.error(error);
      };
    }

    let sessionStarted = false;
    let pendingStream = null;

    async function startRecording() {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        await connectWebSocket();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (!ws || ws.readyState !== WebSocket.OPEN) {
        log('WebSocket not connected!', 'error');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true
          }
        });

        log('Microphone access granted', 'success');
        pendingStream = stream;
        sessionStarted = false;

        // Start session first, wait for confirmation
        log('Requesting session start...', 'info');
        ws.send(JSON.stringify({
          type: 'start_session',
          data: {
            sourceLang: sourceLang.value,
            targetLang: targetLang.value,
            enableTTS: false,
            audioEncoding: 'WEBM_OPUS',
            sampleRate: 16000
          }
        }));

        // Wait for session_started before recording
        // The actual recording will start in the WebSocket message handler

      } catch (err) {
        log('Microphone error: ' + err.message, 'error');
        console.error(err);
      }
    }

    function beginRecording(stream) {
      // Create MediaRecorder
      mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      let chunkCount = 0;

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && ws && ws.readyState === WebSocket.OPEN && sessionStarted) {
          chunkCount++;
          // Convert to ArrayBuffer and send as binary
          const arrayBuffer = await event.data.arrayBuffer();
          ws.send(arrayBuffer);
          if (chunkCount % 4 === 0) {
            log('Sent ' + chunkCount + ' audio chunks (' + Math.round(event.data.size/1024) + 'KB each)', 'info');
          }
        }
      };

      mediaRecorder.onstop = () => {
        log('MediaRecorder stopped, total chunks: ' + chunkCount, 'info');
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(250); // Send chunks every 250ms
      isRecording = true;
      setStatus('recording');
      log('Recording started - speak now!', 'success');
    }

    function stopRecording() {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'end_session' }));
        log('Ending session...', 'info');
      }

      isRecording = false;
    }

    btnRecord.addEventListener('click', () => {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    });

    // Auto-connect on page load
    connectWebSocket();
  </script>
</body>
</html>`;

      return reply.type('text/html').send(testPageHtml);
    });

    logger.info('Test page available at /test');

    // Real-time translation test page
    app.get('/realtime', async (_request: FastifyRequest, reply: FastifyReply) => {
      const realtimePageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VoiceTranslate AI - Real-time Mode</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
      color: #fff;
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 1000px; margin: 0 auto; }
    h1 { text-align: center; margin-bottom: 10px; font-size: 2rem; }
    .subtitle { text-align: center; opacity: 0.7; margin-bottom: 30px; }

    .status-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 15px 20px;
      background: rgba(255,255,255,0.1);
      border-radius: 15px;
      margin-bottom: 20px;
    }
    .status-left { display: flex; align-items: center; gap: 15px; }
    .status-dot {
      width: 14px; height: 14px;
      border-radius: 50%;
      background: #ff4444;
      box-shadow: 0 0 10px rgba(255,68,68,0.5);
    }
    .status-dot.ready { background: #44ff44; box-shadow: 0 0 10px rgba(68,255,68,0.5); }
    .status-dot.listening {
      background: #ffaa00;
      box-shadow: 0 0 15px rgba(255,170,0,0.8);
      animation: pulse 0.5s infinite;
    }
    .status-dot.processing {
      background: #00aaff;
      box-shadow: 0 0 15px rgba(0,170,255,0.8);
      animation: spin 1s linear infinite;
    }
    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.2); } }
    @keyframes spin { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }

    .volume-meter {
      width: 150px; height: 8px;
      background: rgba(255,255,255,0.2);
      border-radius: 4px;
      overflow: hidden;
    }
    .volume-bar {
      height: 100%;
      background: linear-gradient(90deg, #44ff44, #ffaa00, #ff4444);
      width: 0%;
      transition: width 0.05s;
    }

    .lang-select {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .lang-select select {
      padding: 8px 15px;
      border: none;
      border-radius: 8px;
      background: rgba(255,255,255,0.15);
      color: #fff;
      font-size: 0.9rem;
      cursor: pointer;
    }
    .lang-select select option { background: #302b63; }
    .lang-arrow { font-size: 1.2rem; opacity: 0.7; }

    .main-area {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }

    .panel {
      background: rgba(255,255,255,0.05);
      border-radius: 15px;
      padding: 20px;
      min-height: 300px;
      display: flex;
      flex-direction: column;
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .panel-title {
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 1px;
      opacity: 0.7;
    }
    .panel-lang {
      font-size: 0.8rem;
      padding: 4px 10px;
      background: rgba(255,255,255,0.1);
      border-radius: 12px;
    }

    .transcript-area {
      flex: 1;
      overflow-y: auto;
      font-size: 1.1rem;
      line-height: 1.8;
    }
    .segment {
      padding: 8px 12px;
      margin-bottom: 8px;
      border-radius: 8px;
      background: rgba(255,255,255,0.05);
      animation: fadeIn 0.3s;
      unicode-bidi: plaintext;
    }
    .segment.current {
      background: rgba(100,200,255,0.15);
      border-left: 3px solid #64c8ff;
    }
    .segment.rtl {
      direction: rtl;
      text-align: right;
      border-left: none;
      border-right: 3px solid #64c8ff;
    }
    .segment-time {
      font-size: 0.7rem;
      opacity: 0.5;
      margin-bottom: 4px;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

    .stats-bar {
      display: flex;
      gap: 20px;
      padding: 15px 20px;
      background: rgba(0,0,0,0.3);
      border-radius: 10px;
      font-size: 0.85rem;
    }
    .stat { display: flex; gap: 8px; align-items: center; }
    .stat-label { opacity: 0.6; }
    .stat-value { font-weight: 600; color: #64c8ff; }

    .instructions {
      text-align: center;
      padding: 40px;
      opacity: 0.6;
    }
    .instructions .icon { font-size: 3rem; margin-bottom: 15px; }

    @media (max-width: 768px) {
      .main-area { grid-template-columns: 1fr; }
      .status-bar { flex-direction: column; gap: 15px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Real-time Voice Translation</h1>
    <p class="subtitle">Speak naturally - translation happens automatically</p>

    <div class="status-bar">
      <div class="status-left">
        <div id="statusDot" class="status-dot"></div>
        <span id="statusText">Connecting...</span>
        <div class="volume-meter">
          <div id="volumeBar" class="volume-bar"></div>
        </div>
      </div>
      <div class="lang-select">
        <select id="sourceLang">
          <option value="auto" selected>Auto Detect</option>
          <option value="en">English</option>
          <option value="tr">Türkçe</option>
          <option value="de">Deutsch</option>
          <option value="fr">Français</option>
          <option value="es">Español</option>
          <option value="it">Italiano</option>
          <option value="pt">Português</option>
          <option value="ru">Русский</option>
          <option value="ja">日本語</option>
          <option value="ko">한국어</option>
          <option value="zh">中文</option>
          <option value="ar">العربية</option>
          <option value="hi">हिंदी</option>
          <option value="nl">Nederlands</option>
          <option value="pl">Polski</option>
          <option value="uk">Українська</option>
        </select>
        <span class="lang-arrow">→</span>
        <select id="targetLang">
          <option value="en" selected>English</option>
          <option value="tr">Türkçe</option>
          <option value="de">Deutsch</option>
          <option value="fr">Français</option>
          <option value="es">Español</option>
          <option value="it">Italiano</option>
          <option value="pt">Português</option>
          <option value="ru">Русский</option>
          <option value="ja">日本語</option>
          <option value="ko">한국어</option>
          <option value="zh">中文</option>
          <option value="ar">العربية</option>
          <option value="hi">हिंदी</option>
          <option value="nl">Nederlands</option>
          <option value="pl">Polski</option>
          <option value="uk">Українська</option>
        </select>
      </div>
    </div>

    <div class="main-area">
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Original Speech</span>
          <span id="srcLangBadge" class="panel-lang">AUTO</span>
        </div>
        <div id="transcriptArea" class="transcript-area">
          <div class="instructions">
            <div class="icon">🎤</div>
            <p>Start speaking...<br>Your words will appear here in real-time</p>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Translation</span>
          <span id="tgtLangBadge" class="panel-lang">EN</span>
        </div>
        <div id="translationArea" class="transcript-area">
          <div class="instructions">
            <div class="icon">🌐</div>
            <p>Translations will appear here<br>as you speak</p>
          </div>
        </div>
      </div>
    </div>

    <div class="stats-bar">
      <div class="stat">
        <span class="stat-label">Segments:</span>
        <span id="segmentCount" class="stat-value">0</span>
      </div>
      <div class="stat">
        <span class="stat-label">Avg Latency:</span>
        <span id="avgLatency" class="stat-value">-</span>
      </div>
      <div class="stat">
        <span class="stat-label">Status:</span>
        <span id="currentStatus" class="stat-value">Initializing</span>
      </div>
    </div>
  </div>

  <script>
    // Elements
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const volumeBar = document.getElementById('volumeBar');
    const sourceLang = document.getElementById('sourceLang');
    const targetLang = document.getElementById('targetLang');
    const transcriptArea = document.getElementById('transcriptArea');
    const translationArea = document.getElementById('translationArea');
    const srcLangBadge = document.getElementById('srcLangBadge');
    const tgtLangBadge = document.getElementById('tgtLangBadge');
    const segmentCountEl = document.getElementById('segmentCount');
    const avgLatencyEl = document.getElementById('avgLatency');
    const currentStatusEl = document.getElementById('currentStatus');

    // State
    let ws = null;
    let audioContext = null;
    let analyser = null;
    let mediaStream = null;
    let mediaRecorder = null;
    let audioChunks = [];
    let isListening = false;
    let isSpeaking = false;
    let silenceStart = null;
    let segmentId = 0;
    let latencies = [];

    // VAD Settings
    const SILENCE_THRESHOLD = 0.008; // Volume threshold for silence detection (lowered)
    const SILENCE_DURATION = 1200;  // ms of silence before sending segment
    const MAX_SEGMENT_DURATION = 8000; // Max segment length - auto-send after this
    let speechStart = null; // Track when speech started

    // Update language badges
    sourceLang.onchange = () => { srcLangBadge.textContent = sourceLang.value.toUpperCase(); };
    targetLang.onchange = () => { tgtLangBadge.textContent = targetLang.value.toUpperCase(); };

    function setStatus(status, text) {
      statusDot.className = 'status-dot ' + status;
      statusText.textContent = text;
      currentStatusEl.textContent = text;
    }

    async function connectWebSocket() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = protocol + '//' + window.location.host + '/ws/translate?test=true';

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        // Start realtime mode
        ws.send(JSON.stringify({
          type: 'start_realtime',
          data: { sourceLang: sourceLang.value, targetLang: targetLang.value }
        }));
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        console.log('Received:', msg.type, msg.data);

        switch (msg.type) {
          case 'realtime_ready':
          case 'pong':
            setStatus('ready', 'Ready - Start speaking');
            startListening();
            break;

          case 'segment_result':
            handleSegmentResult(msg.data);
            break;

          case 'error':
            console.error('Server error:', msg.data);
            break;
        }
      };

      ws.onclose = () => {
        setStatus('', 'Disconnected');
        setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
      };
    }

    async function startListening() {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        // Setup audio analysis for VAD
        audioContext = new AudioContext();

        // Resume AudioContext (required by browsers)
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }

        const source = audioContext.createMediaStreamSource(mediaStream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.3;
        source.connect(analyser);

        isListening = true;
        monitorVolume();

        console.log('Listening started, AudioContext state:', audioContext.state);
        setStatus('ready', 'Ready - Speak now!');
      } catch (err) {
        console.error('Microphone error:', err);
        setStatus('', 'Microphone access denied: ' + err.message);
      }
    }

    let volumeDebugCounter = 0;
    let isProcessing = false; // Prevent multiple simultaneous sends

    function monitorVolume() {
      if (!isListening || !analyser || isProcessing) {
        if (isListening && !isProcessing) requestAnimationFrame(monitorVolume);
        return;
      }

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(dataArray);

      // Calculate RMS volume
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const val = (dataArray[i] - 128) / 128;
        sum += val * val;
      }
      const volume = Math.sqrt(sum / dataArray.length);

      volumeBar.style.width = Math.min(100, volume * 500) + '%';

      // Debug log every 60 frames (~1 sec)
      volumeDebugCounter++;
      if (volumeDebugCounter % 60 === 0) {
        console.log('Vol:', volume.toFixed(3), 'Speaking:', isSpeaking);
      }

      const now = Date.now();

      if (volume > SILENCE_THRESHOLD) {
        silenceStart = null;
        if (!isSpeaking) {
          isSpeaking = true;
          speechStart = now;
          setStatus('listening', '🎤 Listening...');
          startRecording();
          console.log('>>> Speech STARTED');
        }
      } else if (isSpeaking) {
        if (!silenceStart) silenceStart = now;

        const silenceDuration = now - silenceStart;
        const speechDuration = speechStart ? now - speechStart : 0;

        // Send segment if: enough silence OR max duration reached
        if (silenceDuration > SILENCE_DURATION || speechDuration > MAX_SEGMENT_DURATION) {
          console.log('>>> Sending segment - speech:', speechDuration, 'ms');
          isProcessing = true;
          isSpeaking = false;
          speechStart = null;
          silenceStart = null;
          setStatus('processing', '⏳ Processing...');

          stopRecordingAndSend().finally(() => {
            isProcessing = false;
            setStatus('ready', '🎤 Ready - Speak');
            requestAnimationFrame(monitorVolume);
          });
          return; // Stop loop until processing done
        }
      }

      requestAnimationFrame(monitorVolume);
    }

    function startRecording() {
      audioChunks = [];
      mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'audio/webm;codecs=opus' });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.start(100); // Collect data every 100ms
      console.log('Recording started');
    }

    async function stopRecordingAndSend() {
      if (!mediaRecorder || mediaRecorder.state !== 'recording') {
        return;
      }

      return new Promise((resolve) => {
        mediaRecorder.onstop = async () => {
          if (audioChunks.length === 0) {
            resolve();
            return;
          }

          try {
            // Combine chunks
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

            // Convert to base64 using FileReader (no stack overflow)
            const base64Audio = await new Promise((res) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64 = reader.result.split(',')[1]; // Remove data URL prefix
                res(base64);
              };
              reader.readAsDataURL(audioBlob);
            });

            segmentId++;
            console.log('Sending segment', segmentId, 'size:', base64Audio.length);

            // Send to server
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'process_segment',
                data: {
                  audio: base64Audio,
                  segmentId: segmentId,
                  sourceLang: sourceLang.value,
                  targetLang: targetLang.value
                }
              }));
            }
          } catch (err) {
            console.error('Error sending segment:', err);
          }

          audioChunks = [];
          resolve();
        };

        mediaRecorder.stop();
      });
    }

    function handleSegmentResult(data) {
      setStatus('ready', 'Ready - Start speaking');

      if (data.isEmpty || data.error) {
        console.log('Empty or error segment:', data);
        return;
      }

      segmentCountEl.textContent = data.segmentId || segmentId;

      // Update detected language badge
      if (data.detectedLanguage) {
        srcLangBadge.textContent = data.detectedLanguage.toUpperCase();
      }

      // Track latency
      if (data.processingTimeMs) {
        latencies.push(data.processingTimeMs);
        if (latencies.length > 10) latencies.shift();
        const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
        avgLatencyEl.textContent = avg + 'ms';
      }

      // Clear instructions on first result
      if (transcriptArea.querySelector('.instructions')) {
        transcriptArea.innerHTML = '';
        translationArea.innerHTML = '';
      }

      // RTL language detection
      const rtlLangs = ['ar', 'he', 'fa', 'ur'];
      const isSourceRtl = rtlLangs.includes(data.detectedLanguage);
      const isTargetRtl = rtlLangs.includes(targetLang.value);

      // Add transcript segment
      const time = new Date().toLocaleTimeString();
      const langInfo = data.detectedLanguage ? ' [' + data.detectedLanguage.toUpperCase() + ']' : '';

      const transcriptDiv = document.createElement('div');
      transcriptDiv.className = 'segment current' + (isSourceRtl ? ' rtl' : '');
      transcriptDiv.innerHTML = '<div class="segment-time">' + time + langInfo + '</div>' + data.transcript;
      transcriptArea.appendChild(transcriptDiv);
      transcriptArea.scrollTop = transcriptArea.scrollHeight;

      // Add translation segment
      const translationDiv = document.createElement('div');
      translationDiv.className = 'segment current' + (isTargetRtl ? ' rtl' : '');
      translationDiv.innerHTML = '<div class="segment-time">' + time + ' (' + data.processingTimeMs + 'ms)</div>' + data.translation;
      translationArea.appendChild(translationDiv);
      translationArea.scrollTop = translationArea.scrollHeight;

      // Remove 'current' class from previous segments
      setTimeout(() => {
        transcriptDiv.classList.remove('current');
        translationDiv.classList.remove('current');
      }, 2000);
    }

    // Initialize
    connectWebSocket();
  </script>
</body>
</html>`;

      return reply.type('text/html').send(realtimePageHtml);
    });

    logger.info('Real-time test page available at /realtime');
  }

  logger.info('Application configured');

  return app;
}

/**
 * Start the application server.
 */
export async function startServer(): Promise<FastifyInstance> {
  // Build the application
  const app = await buildApp();

  // Connect to database
  await connectDatabase();

  // Start listening
  try {
    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });

    logger.info('Server started', {
      port: env.PORT,
      host: env.HOST,
      environment: env.NODE_ENV,
    });

    return app;
  } catch (error) {
    logger.error('Failed to start server', {}, error as Error);
    throw error;
  }
}

/**
 * Graceful shutdown handler.
 */
export async function gracefulShutdown(app: FastifyInstance): Promise<void> {
  logger.info('Shutting down gracefully...');

  try {
    await app.close();
    logger.info('Server closed');
  } catch (error) {
    logger.error('Error during shutdown', {}, error as Error);
    throw error;
  }
}

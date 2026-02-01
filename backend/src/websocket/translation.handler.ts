/**
 * =============================================================================
 * WebSocket Translation Handler
 * =============================================================================
 * Real-time voice translation via WebSocket connection.
 * Handles audio streaming, speech-to-text, translation, and optional TTS.
 * =============================================================================
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { WebSocket, RawData } from 'ws';
import { z } from 'zod';
import { sttService, STTResponse, StreamingSTTSession, AudioEncoding } from '../services/ai/stt.service.js';
import { aiTranslationService } from '../services/ai/translation.service.js';
import { ttsService } from '../services/ai/tts.service.js';
import { verifyAccessToken, extractBearerToken } from '../utils/jwt.js';
import { createLogger } from '../utils/logger.js';
import { prisma } from '../lib/prisma.js';
import { subscriptionLimits, SubscriptionTier } from '../config/env.js';

const logger = createLogger('ws-translation');

// =============================================================================
// Types
// =============================================================================

/**
 * WebSocket message types (client to server).
 */
type ClientMessageType =
  | 'start_session'
  | 'start_realtime'
  | 'audio_chunk'
  | 'process_segment'
  | 'end_session'
  | 'cancel_session'
  | 'ping';

/**
 * WebSocket message types (server to client).
 */
type ServerMessageType =
  | 'session_started'
  | 'realtime_ready'
  | 'session_ended'
  | 'interim_result'
  | 'segment_result'
  | 'final_result'
  | 'translation_result'
  | 'audio_result'
  | 'error'
  | 'pong';

/**
 * Client message structure.
 */
interface ClientMessage {
  type: ClientMessageType;
  data?: unknown;
}

/**
 * Server message structure.
 */
interface ServerMessage {
  type: ServerMessageType;
  data?: unknown;
  timestamp: string;
}

/**
 * Session configuration.
 */
interface SessionConfig {
  sourceLang: string;
  targetLang: string;
  enableTTS: boolean;
  audioEncoding: AudioEncoding;
  sampleRate: number;
}

/**
 * Active translation session.
 */
interface TranslationSession {
  id: string;
  userId: string;
  subscription: string;
  config: SessionConfig;
  sttSession: StreamingSTTSession;
  startTime: Date;
  audioChunksReceived: number;
  lastActivity: Date;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const sessionConfigSchema = z.object({
  sourceLang: z.string().default('auto'),
  targetLang: z.string().min(2).max(5),
  enableTTS: z.boolean().default(false),
  audioEncoding: z.enum(['LINEAR16', 'FLAC', 'OGG_OPUS', 'WEBM_OPUS', 'MP3']).default('LINEAR16'),
  sampleRate: z.number().int().min(8000).max(48000).default(16000),
});

// =============================================================================
// WebSocket Handler
// =============================================================================

/**
 * Active sessions map (userId -> session).
 * Enforces one session per user.
 */
const activeSessions = new Map<string, TranslationSession>();

/**
 * Session timeout in milliseconds (5 minutes of inactivity).
 */
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Maximum audio chunks per session (prevents abuse).
 */
const MAX_AUDIO_CHUNKS = 10000;

/**
 * Clean up inactive sessions periodically.
 */
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of activeSessions.entries()) {
    if (now - session.lastActivity.getTime() > SESSION_TIMEOUT_MS) {
      logger.warn('Session timeout, cleaning up', { userId, sessionId: session.id });
      activeSessions.delete(userId);
    }
  }
}, 60000);

/**
 * Send a message to the WebSocket client.
 */
function sendMessage(ws: WebSocket, type: ServerMessageType, data?: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }

  const message: ServerMessage = {
    type,
    data,
    timestamp: new Date().toISOString(),
  };

  ws.send(JSON.stringify(message));
}

/**
 * Send an error message to the client.
 */
function sendError(ws: WebSocket, code: string, message: string): void {
  sendMessage(ws, 'error', { code, message });
}

/**
 * Handle WebSocket connection for real-time translation.
 */
async function handleConnection(
  ws: WebSocket,
  request: FastifyRequest
): Promise<void> {
  let userId: string | null = null;
  let subscription = 'free';

  // Authenticate the connection
  try {
    const authHeader = request.headers.authorization;
    let token = extractBearerToken(authHeader);

    // Parse URL to check for token in query params (for mobile WebSocket connections)
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const queryToken = url.searchParams.get('token');
    const testMode = url.searchParams.get('test') === 'true';

    // If no header token, try query parameter token
    if (!token && queryToken) {
      token = queryToken;
      logger.info('WebSocket using query parameter token');
    }

    if (!token && testMode && process.env.NODE_ENV === 'development') {
      // Development test mode - create anonymous user
      userId = `test-user-${Date.now()}`;
      subscription = 'premium';
      logger.info('WebSocket test mode connection', { userId });
    } else if (!token) {
      // Allow guest/anonymous users with free tier limits
      userId = `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      subscription = 'free';
      logger.info('WebSocket guest connection', { userId });
    } else {
      const payload = verifyAccessToken(token);
      userId = payload.userId;
      subscription = payload.subscription;
    }
  } catch (error) {
    logger.warn('WebSocket authentication failed', { error: (error as Error).message });
    sendError(ws, 'UNAUTHORIZED', 'Invalid or expired token');
    ws.close(4001, 'Unauthorized');
    return;
  }

  logger.websocket('Client connected', { userId });

  // Check if user already has an active session
  if (activeSessions.has(userId)) {
    sendError(ws, 'SESSION_EXISTS', 'You already have an active translation session');
    ws.close(4002, 'Session exists');
    return;
  }

  // Handle incoming messages
  ws.on('message', async (rawData: RawData) => {
    try {
      await handleMessage(ws, userId!, subscription, rawData);
    } catch (error) {
      logger.error('Error handling WebSocket message', { userId }, error as Error);
      sendError(ws, 'INTERNAL_ERROR', 'Failed to process message');
    }
  });

  // Handle connection close
  ws.on('close', (code: number, reason: Buffer) => {
    logger.websocket('Client disconnected', {
      userId,
      code,
      reason: reason.toString(),
    });

    // Clean up session
    if (userId && activeSessions.has(userId)) {
      activeSessions.delete(userId);
    }
  });

  // Handle errors
  ws.on('error', (error: Error) => {
    logger.error('WebSocket error', { userId }, error);

    if (userId && activeSessions.has(userId)) {
      activeSessions.delete(userId);
    }
  });

  // Send connection confirmation
  sendMessage(ws, 'pong', { message: 'Connected successfully' });
}

/**
 * Handle incoming WebSocket message.
 */
async function handleMessage(
  ws: WebSocket,
  userId: string,
  subscription: string,
  rawData: RawData
): Promise<void> {
  // Convert to Buffer for processing
  let buffer: Buffer;
  if (Buffer.isBuffer(rawData)) {
    buffer = rawData;
  } else if (Array.isArray(rawData)) {
    buffer = Buffer.concat(rawData.map(chunk =>
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    ));
  } else {
    buffer = Buffer.from(rawData as ArrayBuffer);
  }

  // Try to parse as JSON first (text messages come as Buffer too)
  const text = buffer.toString('utf8');

  // Check if it looks like JSON (starts with '{')
  if (text.trimStart().startsWith('{')) {
    try {
      const message = JSON.parse(text) as ClientMessage;
      logger.info('Received JSON message', { userId, type: message.type });

      // Handle message based on type
      switch (message.type) {
        case 'start_session':
          // Support both { type, data: {...} } and { type, ...config } formats
          const sessionConfig = message.data || message;
          await handleStartSession(ws, userId, subscription, sessionConfig);
          break;

        case 'start_realtime':
          // Support both { type, data: { sourceLang, targetLang } } and { type, sourceLang, targetLang }
          const realtimeConfig = message.data || message;
          await handleStartRealtime(ws, userId, subscription, realtimeConfig);
          break;

        case 'process_segment':
          // Process a single audio segment immediately (real-time mode)
          // Support both { type, data: { audio, ... } } and { type, audio, ... } formats
          const segmentPayload = message.data || message;
          await handleProcessSegment(ws, userId, segmentPayload);
          break;

        case 'audio_chunk':
          // Audio sent as base64 in JSON (alternative to binary)
          if (typeof message.data === 'string') {
            const audioBuffer = Buffer.from(message.data, 'base64');
            logger.debug('Received base64 audio chunk', { userId, size: audioBuffer.length });
            await handleAudioChunk(ws, userId, audioBuffer);
          }
          break;

        case 'end_session':
          await handleEndSession(ws, userId);
          break;

        case 'cancel_session':
          await handleCancelSession(ws, userId);
          break;

        case 'ping':
          sendMessage(ws, 'pong', { time: Date.now() });
          break;

        default:
          sendError(ws, 'UNKNOWN_MESSAGE', `Unknown message type: ${message.type}`);
      }
      return;
    } catch (e) {
      // Not valid JSON, treat as binary audio
      logger.debug('Message is not JSON, treating as binary audio', { userId });
    }
  }

  // Binary audio data
  logger.debug('Received binary audio chunk', { userId, size: buffer.length });
  await handleAudioChunk(ws, userId, buffer);
}

/**
 * Handle start session request.
 */
async function handleStartSession(
  ws: WebSocket,
  userId: string,
  subscription: string,
  configData: unknown
): Promise<void> {
  logger.info('Starting session', { userId, subscription, configData });

  // Check if user already has a session
  if (activeSessions.has(userId)) {
    logger.warn('Session already exists', { userId });
    sendError(ws, 'SESSION_EXISTS', 'Session already active');
    return;
  }

  // Skip usage limits check for test users
  const isTestUser = userId.startsWith('test-user-');

  if (!isTestUser) {
    // Check usage limits
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { dailyUsage: true, lastUsageReset: true },
    });

    if (user) {
      const tier = subscription as SubscriptionTier;
      const limits = subscriptionLimits[tier] || subscriptionLimits.free;

      // Check if daily limit exceeded
      if (limits.dailyMinutes > 0 && user.dailyUsage >= limits.dailyMinutes) {
        sendError(ws, 'USAGE_LIMIT', 'Daily usage limit exceeded');
        return;
      }
    }
  } else {
    logger.info('Test user - skipping usage limits', { userId });
  }

  // Parse and validate config
  let config: SessionConfig;
  try {
    config = sessionConfigSchema.parse(configData || {});
  } catch (error) {
    sendError(ws, 'INVALID_CONFIG', 'Invalid session configuration');
    return;
  }

  // Validate languages
  if (!sttService.isLanguageSupported(config.sourceLang) && config.sourceLang !== 'auto') {
    sendError(ws, 'UNSUPPORTED_LANGUAGE', `Source language not supported: ${config.sourceLang}`);
    return;
  }

  if (!aiTranslationService.isLanguageSupported(config.targetLang)) {
    sendError(ws, 'UNSUPPORTED_LANGUAGE', `Target language not supported: ${config.targetLang}`);
    return;
  }

  // Create STT session
  const sttSession = sttService.createStreamingSession(
    config.sourceLang,
    config.audioEncoding,
    config.sampleRate
  );

  // Create translation session
  const session: TranslationSession = {
    id: `ts-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId,
    subscription,
    config,
    sttSession,
    startTime: new Date(),
    audioChunksReceived: 0,
    lastActivity: new Date(),
  };

  // Store session
  activeSessions.set(userId, session);

  logger.websocket('Session started', {
    userId,
    sessionId: session.id,
    config,
  });

  sendMessage(ws, 'session_started', {
    sessionId: session.id,
    config,
  });
}

/**
 * Handle audio chunk from client.
 */
async function handleAudioChunk(
  ws: WebSocket,
  userId: string,
  audioData: Buffer
): Promise<void> {
  const session = activeSessions.get(userId);

  if (!session) {
    sendError(ws, 'NO_SESSION', 'No active session. Please start a session first.');
    return;
  }

  // Check chunk limit
  if (session.audioChunksReceived >= MAX_AUDIO_CHUNKS) {
    sendError(ws, 'CHUNK_LIMIT', 'Maximum audio chunks exceeded. Please end session.');
    return;
  }

  // Update session activity
  session.audioChunksReceived++;
  session.lastActivity = new Date();

  // Send audio to STT session
  session.sttSession.sendAudio(audioData);

  // In a real streaming implementation, we would receive interim results
  // and send them back to the client
  // For now, we just acknowledge receipt
}

/**
 * Handle end session request.
 */
async function handleEndSession(
  ws: WebSocket,
  userId: string
): Promise<void> {
  const session = activeSessions.get(userId);

  if (!session) {
    sendError(ws, 'NO_SESSION', 'No active session');
    return;
  }

  try {
    // Get final STT result
    const sttResult: STTResponse = await session.sttSession.close();

    // Translate the transcribed text
    const translationResult = await aiTranslationService.translate({
      text: sttResult.transcript,
      sourceLang: sttResult.detectedLanguage,
      targetLang: session.config.targetLang,
    });

    // Send final result
    sendMessage(ws, 'final_result', {
      transcript: sttResult.transcript,
      confidence: sttResult.confidence,
      detectedLanguage: sttResult.detectedLanguage,
      durationMs: sttResult.durationMs,
    });

    sendMessage(ws, 'translation_result', {
      translatedText: translationResult.translatedText,
      sourceLang: translationResult.detectedSourceLang,
      targetLang: translationResult.targetLang,
      confidence: translationResult.confidence,
    });

    // Generate TTS if enabled
    if (session.config.enableTTS) {
      const ttsResult = await ttsService.synthesize({
        text: translationResult.translatedText,
        languageCode: session.config.targetLang,
        audioEncoding: 'MP3',
      });

      sendMessage(ws, 'audio_result', {
        audioContent: ttsResult.audioContent,
        audioEncoding: ttsResult.audioEncoding,
        durationMs: ttsResult.durationMs,
      });
    }

    // Save to history (skip for test users)
    const isTestUser = userId.startsWith('test-user-');
    if (!isTestUser) {
      await prisma.translation.create({
        data: {
          userId,
          sourceText: sttResult.transcript,
          targetText: translationResult.translatedText,
          sourceLang: sttResult.detectedLanguage,
          targetLang: session.config.targetLang,
          isVoice: true,
          durationMs: sttResult.durationMs,
          confidence: sttResult.confidence,
        },
      });

      // Update usage
      const durationMinutes = Math.ceil(sttResult.durationMs / 60000);
      await prisma.user.update({
        where: { id: userId },
        data: {
          dailyUsage: { increment: durationMinutes },
          monthlyUsage: { increment: durationMinutes },
        },
      });
    } else {
      logger.info('Test user - skipping database operations', { userId });
    }

    // Calculate session duration
    const sessionDuration = Date.now() - session.startTime.getTime();

    logger.websocket('Session ended', {
      userId,
      sessionId: session.id,
      durationMs: sessionDuration,
      audioChunks: session.audioChunksReceived,
      transcript: sttResult.transcript.substring(0, 100),
    });

    sendMessage(ws, 'session_ended', {
      sessionId: session.id,
      durationMs: sessionDuration,
      audioChunksProcessed: session.audioChunksReceived,
    });
  } catch (error) {
    logger.error('Error ending session', { userId }, error as Error);
    sendError(ws, 'SESSION_ERROR', 'Failed to process session');
  } finally {
    // Clean up session
    activeSessions.delete(userId);
  }
}

/**
 * Handle cancel session request.
 */
async function handleCancelSession(
  ws: WebSocket,
  userId: string
): Promise<void> {
  const session = activeSessions.get(userId);

  if (!session) {
    sendError(ws, 'NO_SESSION', 'No active session');
    return;
  }

  logger.websocket('Session cancelled', {
    userId,
    sessionId: session.id,
  });

  // Clean up session
  activeSessions.delete(userId);

  sendMessage(ws, 'session_ended', {
    sessionId: session.id,
    cancelled: true,
  });
}

// =============================================================================
// Real-time Mode Handlers
// =============================================================================

/**
 * Sentence context for continuous transcription
 */
interface SentenceContext {
  segmentId: number;
  text: string;
  translation: string;
  isFinal: boolean;
  timestamp: Date;
}

/**
 * Store realtime session configs with context (separate from batch sessions)
 */
const realtimeSessions = new Map<string, {
  sourceLang: string;
  targetLang: string;
  segmentCount: number;
  startTime: Date;
  // Sentence-level context tracking
  currentSentence: string;         // Current incomplete sentence
  currentSentenceId: number;       // ID of the current sentence segment
  completedSentences: SentenceContext[]; // History of completed sentences
  lastSegmentText: string;         // Last segment text for correction detection
  contextBuffer: string[];         // Recent transcriptions for context
  pendingCorrection: boolean;      // Whether we're waiting for correction
}>();

/**
 * Punctuation that indicates sentence end
 */
const SENTENCE_ENDINGS = /[.!?。？！؟।]/;

/**
 * Check if text ends with sentence-ending punctuation
 */
function endsWithSentence(text: string): boolean {
  const trimmed = text.trim();
  return SENTENCE_ENDINGS.test(trimmed.charAt(trimmed.length - 1));
}

/**
 * Check if new transcription is a correction of previous
 * (Whisper may provide better transcription with more context)
 */
function isCorrection(previous: string, current: string): boolean {
  if (!previous || !current) return false;

  const prevWords = previous.toLowerCase().trim().split(/\s+/);
  const currWords = current.toLowerCase().trim().split(/\s+/);

  // If current starts with most of previous words, it's a continuation/correction
  if (currWords.length < prevWords.length) return false;

  let matchCount = 0;
  for (let i = 0; i < Math.min(prevWords.length, currWords.length); i++) {
    if (prevWords[i] === currWords[i]) {
      matchCount++;
    }
  }

  // If at least 70% of previous words match, it's likely a correction
  return matchCount >= prevWords.length * 0.7 && currWords.length > prevWords.length;
}

/**
 * Handle start realtime session request.
 * This is for continuous real-time translation mode.
 */
async function handleStartRealtime(
  ws: WebSocket,
  userId: string,
  _subscription: string,
  configData: unknown
): Promise<void> {
  logger.info('Starting realtime session', { userId, configData });

  // Parse config
  const config = configData as { sourceLang?: string; targetLang?: string } || {};
  const sourceLang = config.sourceLang || 'auto';
  const targetLang = config.targetLang || 'en';

  // Store realtime session with context tracking
  realtimeSessions.set(userId, {
    sourceLang,
    targetLang,
    segmentCount: 0,
    startTime: new Date(),
    // Initialize sentence context
    currentSentence: '',
    currentSentenceId: 0,
    completedSentences: [],
    lastSegmentText: '',
    contextBuffer: [],
    pendingCorrection: false,
  });

  sendMessage(ws, 'realtime_ready', {
    sourceLang,
    targetLang,
    message: 'Ready for real-time translation. Send audio segments with process_segment.',
  });
}

/**
 * Handle process segment request.
 * Implements intelligent sentence detection, context tracking, and correction.
 */
async function handleProcessSegment(
  ws: WebSocket,
  userId: string,
  data: unknown
): Promise<void> {
  const startTime = Date.now();
  const segmentData = data as { audio: string; segmentId?: number; sourceLang?: string; targetLang?: string; encoding?: string };

  if (!segmentData?.audio) {
    sendError(ws, 'INVALID_SEGMENT', 'Audio data is required');
    return;
  }

  // Get or create realtime session
  let session = realtimeSessions.get(userId);
  if (!session) {
    session = {
      sourceLang: segmentData.sourceLang || 'auto',
      targetLang: segmentData.targetLang || 'en',
      segmentCount: 0,
      startTime: new Date(),
      currentSentence: '',
      currentSentenceId: 0,
      completedSentences: [],
      lastSegmentText: '',
      contextBuffer: [],
      pendingCorrection: false,
    };
    realtimeSessions.set(userId, session);
  }

  // Use segment-level language preferences (allows changing during session)
  const sourceLang = segmentData.sourceLang || session.sourceLang || 'auto';
  const targetLang = segmentData.targetLang || session.targetLang || 'en';

  session.segmentCount++;
  const segmentId = segmentData.segmentId || session.segmentCount;

  try {
    // Decode audio from base64
    const audioBuffer = Buffer.from(segmentData.audio, 'base64');
    logger.info('Processing segment', {
      userId,
      segmentId,
      size: audioBuffer.length,
      sourceLang,
      targetLang,
      contextSize: session.contextBuffer.length,
    });

    // Build context prompt from previous transcriptions for better accuracy
    const contextPrompt = session.contextBuffer.length > 0
      ? session.contextBuffer.slice(-3).join(' ')  // Use last 3 segments as context
      : undefined;

    // Determine audio encoding (client sends M4A from mobile, WEBM_OPUS from web)
    const audioEncoding = (segmentData.encoding || 'M4A') as 'MP3' | 'M4A' | 'WAV' | 'WEBM_OPUS';

    // Immediately transcribe using Whisper with context for better accuracy
    const sttResult = await sttService.transcribe({
      audioData: segmentData.audio,
      encoding: audioEncoding,
      sampleRateHertz: 48000, // Match the client sample rate
      languageCode: sourceLang,
      enableAutomaticPunctuation: true,
      enableWordTimeOffsets: true,
      prompt: contextPrompt, // Pass context for better word boundary detection
      temperature: 0, // More deterministic = more accurate
    });

    const sttTime = Date.now() - startTime;

    // If no transcript, skip translation
    if (!sttResult.transcript || sttResult.transcript.trim() === '') {
      logger.debug('Empty transcript for segment', { userId, segmentId });
      sendMessage(ws, 'segment_result', {
        segmentId,
        transcript: '',
        translation: '',
        isEmpty: true,
        isFinal: false,
        processingTimeMs: Date.now() - startTime,
      });
      return;
    }

    const transcript = sttResult.transcript.trim();
    const detectedLang = sttResult.detectedLanguage || sourceLang;

    // Check if this is a correction of the previous segment
    const isPotentialCorrection = isCorrection(session.lastSegmentText, transcript);

    // Check if this completes a sentence
    const completeSentence = endsWithSentence(transcript);

    // Update context buffer
    if (!isPotentialCorrection) {
      session.contextBuffer.push(transcript);
      if (session.contextBuffer.length > 5) {
        session.contextBuffer.shift(); // Keep only last 5 segments
      }
    }

    // Build the full sentence by combining with current incomplete sentence
    let fullText: string;
    let sentenceSegmentId: number;

    if (isPotentialCorrection) {
      // This is a correction - replace the last segment text
      fullText = session.currentSentence
        ? session.currentSentence.replace(session.lastSegmentText, '') + transcript
        : transcript;
      sentenceSegmentId = session.currentSentenceId;
      logger.info('Correction detected', {
        userId,
        segmentId,
        previous: session.lastSegmentText.substring(0, 30),
        current: transcript.substring(0, 30),
      });
    } else {
      // New segment - append to current sentence
      fullText = session.currentSentence
        ? session.currentSentence + ' ' + transcript
        : transcript;
      sentenceSegmentId = session.currentSentenceId || segmentId;
    }

    // Update session state
    session.lastSegmentText = transcript;

    // Translate the text
    const translationResult = await aiTranslationService.translate({
      text: fullText,
      sourceLang: detectedLang,
      targetLang: targetLang,
    });

    const totalTime = Date.now() - startTime;

    if (completeSentence) {
      // Sentence is complete - finalize it
      logger.info('Sentence completed', {
        userId,
        segmentId: sentenceSegmentId,
        sentence: fullText.substring(0, 50),
      });

      // Store completed sentence
      session.completedSentences.push({
        segmentId: sentenceSegmentId,
        text: fullText,
        translation: translationResult.translatedText,
        isFinal: true,
        timestamp: new Date(),
      });

      // Reset current sentence
      session.currentSentence = '';
      session.currentSentenceId = 0;

      // Send final result
      sendMessage(ws, 'segment_result', {
        segmentId: sentenceSegmentId,
        transcript: fullText,
        translation: translationResult.translatedText,
        detectedLanguage: sttResult.detectedLanguage,
        confidence: sttResult.confidence,
        isFinal: true,
        isCorrection: isPotentialCorrection,
        processingTimeMs: totalTime,
        sttTimeMs: sttTime,
        translationTimeMs: totalTime - sttTime,
      });

    } else {
      // Sentence is incomplete - send partial result
      session.currentSentence = fullText;
      if (!session.currentSentenceId) {
        session.currentSentenceId = segmentId;
      }

      logger.info('Partial segment processed', {
        userId,
        segmentId: sentenceSegmentId,
        currentSentence: fullText.substring(0, 50),
        sttTimeMs: sttTime,
        totalTimeMs: totalTime,
      });

      // Send partial/update result
      sendMessage(ws, 'segment_result', {
        segmentId: sentenceSegmentId,
        transcript: fullText,
        translation: translationResult.translatedText,
        detectedLanguage: sttResult.detectedLanguage,
        confidence: sttResult.confidence,
        isFinal: false,
        isCorrection: isPotentialCorrection,
        processingTimeMs: totalTime,
        sttTimeMs: sttTime,
        translationTimeMs: totalTime - sttTime,
      });
    }

  } catch (error) {
    // Properly extract error message
    let errorMessage = 'Unknown error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = String((error as any).message);
    }

    logger.error('Error processing segment', { userId, segmentId, errorMessage }, error as Error);
    sendMessage(ws, 'segment_result', {
      segmentId,
      error: errorMessage,
      processingTimeMs: Date.now() - startTime,
    });
  }
}

/**
 * Register WebSocket routes on Fastify instance.
 */
export async function registerWebSocketHandler(fastify: FastifyInstance): Promise<void> {
  // Register WebSocket plugin
  await fastify.register(import('@fastify/websocket'));

  // WebSocket route for real-time translation
  fastify.get(
    '/ws/translate',
    { websocket: true },
    (socket: WebSocket, request: FastifyRequest) => {
      handleConnection(socket, request);
    }
  );

  logger.info('WebSocket translation handler registered');
}

/**
 * Get count of active sessions (for monitoring).
 */
export function getActiveSessionCount(): number {
  return activeSessions.size;
}

/**
 * Get active session for a user (for debugging).
 */
export function getActiveSession(userId: string): TranslationSession | undefined {
  return activeSessions.get(userId);
}

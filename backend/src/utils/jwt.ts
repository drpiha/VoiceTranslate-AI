/**
 * =============================================================================
 * JWT Utility Functions
 * =============================================================================
 * Centralized JWT token generation and verification utilities.
 * Implements secure token handling with access/refresh token pattern.
 * =============================================================================
 */

import { createHmac, randomBytes } from 'crypto';
import { env } from '../config/env.js';
import { InvalidTokenError, TokenExpiredError } from './errors.js';

/**
 * Token payload structure for access tokens.
 */
export interface AccessTokenPayload {
  userId: string;
  email: string;
  subscription: string;
  type: 'access';
  iat: number;
  exp: number;
}

/**
 * Token payload structure for refresh tokens.
 */
export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
  type: 'refresh';
  iat: number;
  exp: number;
}

/**
 * Token pair returned after authentication.
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

/**
 * Parse duration string to milliseconds.
 * Supports: '15m', '1h', '7d', etc.
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const value = parseInt(match[1]!, 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}

/**
 * Base64URL encode a string.
 */
function base64UrlEncode(data: string | Buffer): string {
  const base64 = Buffer.from(data).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64URL decode a string.
 */
function base64UrlDecode(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const pad = data.length % 4;
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
  return Buffer.from(padded, 'base64').toString('utf8');
}

/**
 * Create HMAC-SHA256 signature for JWT.
 */
function createSignature(data: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(data);
  return base64UrlEncode(hmac.digest());
}

/**
 * Verify HMAC-SHA256 signature using timing-safe comparison.
 */
function verifySignature(data: string, signature: string, secret: string): boolean {
  const expectedSignature = createSignature(data, secret);

  // Timing-safe comparison to prevent timing attacks
  if (signature.length !== expectedSignature.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Create a JWT token with the given payload.
 */
function createToken<T extends object>(payload: T, secret: string, expiresIn: string): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const now = Math.floor(Date.now() / 1000);
  const exp = now + Math.floor(parseDuration(expiresIn) / 1000);

  const fullPayload = {
    ...payload,
    iat: now,
    exp,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const data = `${headerB64}.${payloadB64}`;
  const signature = createSignature(data, secret);

  return `${data}.${signature}`;
}

/**
 * Verify and decode a JWT token.
 */
function verifyToken<T>(token: string, secret: string): T {
  const parts = token.split('.');

  if (parts.length !== 3) {
    throw new InvalidTokenError('Malformed token');
  }

  const [headerB64, payloadB64, signature] = parts as [string, string, string];
  const data = `${headerB64}.${payloadB64}`;

  // Verify signature
  if (!verifySignature(data, signature, secret)) {
    throw new InvalidTokenError('Invalid token signature');
  }

  // Decode payload
  let payload: T & { exp?: number };
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64)) as T & { exp?: number };
  } catch {
    throw new InvalidTokenError('Invalid token payload');
  }

  // Check expiration
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new TokenExpiredError();
  }

  return payload as T;
}

/**
 * Generate a secure random token ID.
 */
export function generateTokenId(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Create an access token for a user.
 */
export function createAccessToken(
  userId: string,
  email: string,
  subscription: string
): { token: string; expiresAt: Date } {
  const payload = {
    userId,
    email,
    subscription,
    type: 'access' as const,
  };

  const token = createToken(payload, env.JWT_ACCESS_SECRET, env.JWT_ACCESS_EXPIRY);
  const expiresAt = new Date(Date.now() + parseDuration(env.JWT_ACCESS_EXPIRY));

  return { token, expiresAt };
}

/**
 * Create a refresh token for a user.
 */
export function createRefreshToken(
  userId: string,
  tokenId: string
): { token: string; expiresAt: Date } {
  const payload = {
    userId,
    tokenId,
    type: 'refresh' as const,
  };

  const token = createToken(payload, env.JWT_REFRESH_SECRET, env.JWT_REFRESH_EXPIRY);
  const expiresAt = new Date(Date.now() + parseDuration(env.JWT_REFRESH_EXPIRY));

  return { token, expiresAt };
}

/**
 * Verify an access token and return the payload.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = verifyToken<AccessTokenPayload>(token, env.JWT_ACCESS_SECRET);

  if (payload.type !== 'access') {
    throw new InvalidTokenError('Invalid token type');
  }

  return payload;
}

/**
 * Verify a refresh token and return the payload.
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = verifyToken<RefreshTokenPayload>(token, env.JWT_REFRESH_SECRET);

  if (payload.type !== 'refresh') {
    throw new InvalidTokenError('Invalid token type');
  }

  return payload;
}

/**
 * Generate a complete token pair for a user.
 */
export function generateTokenPair(
  userId: string,
  email: string,
  subscription: string,
  tokenId: string
): TokenPair {
  const access = createAccessToken(userId, email, subscription);
  const refresh = createRefreshToken(userId, tokenId);

  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshTokenExpiresAt: refresh.expiresAt,
  };
}

/**
 * Hash a refresh token for secure storage.
 * We store the hash, not the actual token.
 */
export function hashRefreshToken(token: string): string {
  const hmac = createHmac('sha256', env.JWT_REFRESH_SECRET);
  hmac.update(token);
  return hmac.digest('hex');
}

/**
 * Extract token from Authorization header.
 * Supports "Bearer <token>" format.
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1] ?? null;
}

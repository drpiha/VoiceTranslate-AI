/**
 * =============================================================================
 * Cryptographic Utility Functions
 * =============================================================================
 * Secure encryption, hashing, and random generation utilities.
 * Uses Node.js crypto module with AES-256-GCM for encryption.
 * =============================================================================
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'crypto';
import { env } from '../config/env.js';

// =============================================================================
// Constants
// =============================================================================

/**
 * Encryption algorithm - AES-256-GCM provides authenticated encryption.
 */
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

/**
 * IV (Initialization Vector) size for AES-GCM.
 */
const IV_SIZE = 16;

/**
 * Authentication tag size for AES-GCM.
 */
const AUTH_TAG_SIZE = 16;

/**
 * Salt size for key derivation.
 */
const SALT_SIZE = 32;

// =============================================================================
// Key Derivation
// =============================================================================

/**
 * Derive an encryption key from the master key using scrypt.
 * This adds an additional layer of security and allows key rotation.
 */
function deriveKey(salt: Buffer): Buffer {
  // Use scrypt for key derivation - resistant to GPU/ASIC attacks
  return scryptSync(env.ENCRYPTION_KEY, salt, 32);
}

// =============================================================================
// Encryption Functions
// =============================================================================

/**
 * Encrypt sensitive data using AES-256-GCM.
 * Returns a base64 string containing: salt + iv + authTag + ciphertext
 *
 * @param plaintext - The data to encrypt
 * @returns Base64 encoded encrypted data
 */
export function encrypt(plaintext: string): string {
  // Generate random salt and IV for each encryption
  const salt = randomBytes(SALT_SIZE);
  const iv = randomBytes(IV_SIZE);

  // Derive encryption key from master key + salt
  const key = deriveKey(salt);

  // Create cipher with AES-256-GCM
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  // Encrypt the plaintext
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  // Get the authentication tag
  const authTag = cipher.getAuthTag();

  // Combine all parts: salt + iv + authTag + ciphertext
  const combined = Buffer.concat([salt, iv, authTag, encrypted]);

  return combined.toString('base64');
}

/**
 * Decrypt data encrypted with encrypt().
 *
 * @param encryptedData - Base64 encoded encrypted data
 * @returns Decrypted plaintext string
 * @throws Error if decryption fails (invalid data or tampering detected)
 */
export function decrypt(encryptedData: string): string {
  try {
    const combined = Buffer.from(encryptedData, 'base64');

    // Extract components
    const salt = combined.subarray(0, SALT_SIZE);
    const iv = combined.subarray(SALT_SIZE, SALT_SIZE + IV_SIZE);
    const authTag = combined.subarray(SALT_SIZE + IV_SIZE, SALT_SIZE + IV_SIZE + AUTH_TAG_SIZE);
    const ciphertext = combined.subarray(SALT_SIZE + IV_SIZE + AUTH_TAG_SIZE);

    // Derive the same key using the extracted salt
    const key = deriveKey(salt);

    // Create decipher
    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (error) {
    // Don't expose internal error details
    throw new Error('Decryption failed: invalid or corrupted data');
  }
}

// =============================================================================
// Hashing Functions
// =============================================================================

/**
 * Create a SHA-256 hash of the input.
 *
 * @param data - Data to hash
 * @returns Hex-encoded hash string
 */
export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Create a SHA-512 hash of the input.
 *
 * @param data - Data to hash
 * @returns Hex-encoded hash string
 */
export function sha512(data: string): string {
  return createHash('sha512').update(data).digest('hex');
}

/**
 * Create a salted hash for storing sensitive data.
 * Uses SHA-256 with a random salt.
 *
 * @param data - Data to hash
 * @returns Object containing salt and hash
 */
export function createSaltedHash(data: string): { salt: string; hash: string } {
  const salt = randomBytes(32).toString('hex');
  const hash = sha256(salt + data);
  return { salt, hash };
}

/**
 * Verify a salted hash.
 *
 * @param data - Original data
 * @param salt - Salt used during hashing
 * @param expectedHash - Expected hash value
 * @returns True if hash matches
 */
export function verifySaltedHash(data: string, salt: string, expectedHash: string): boolean {
  const computedHash = sha256(salt + data);
  return timingSafeCompare(computedHash, expectedHash);
}

// =============================================================================
// Random Generation
// =============================================================================

/**
 * Generate a cryptographically secure random string.
 *
 * @param length - Length of the string in bytes (output will be hex, so 2x length)
 * @returns Random hex string
 */
export function generateRandomHex(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Generate a cryptographically secure random string (URL-safe base64).
 *
 * @param length - Length in bytes
 * @returns URL-safe base64 string
 */
export function generateRandomBase64(length: number = 32): string {
  return randomBytes(length)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate a random numeric OTP (One-Time Password).
 *
 * @param digits - Number of digits (default: 6)
 * @returns Numeric OTP string
 */
export function generateOTP(digits: number = 6): string {
  const max = Math.pow(10, digits);
  const randomValue = randomBytes(4).readUInt32BE(0);
  const otp = randomValue % max;
  return otp.toString().padStart(digits, '0');
}

/**
 * Generate a random API key with prefix.
 *
 * @param prefix - Key prefix for identification (e.g., 'vt' for VoiceTranslate)
 * @returns API key string
 */
export function generateApiKey(prefix: string = 'vt'): string {
  const randomPart = generateRandomBase64(32);
  return `${prefix}_${randomPart}`;
}

// =============================================================================
// Comparison Functions
// =============================================================================

/**
 * Timing-safe string comparison to prevent timing attacks.
 *
 * @param a - First string
 * @param b - Second string
 * @returns True if strings are equal
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare against itself to maintain constant time
    const dummy = Buffer.from(a);
    timingSafeEqual(dummy, dummy);
    return false;
  }

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  return timingSafeEqual(bufA, bufB);
}

// =============================================================================
// API Key Encryption
// =============================================================================

/**
 * Encrypt an API key for secure storage.
 * Use this for storing third-party API keys in the database.
 *
 * @param apiKey - The API key to encrypt
 * @returns Encrypted API key
 */
export function encryptApiKey(apiKey: string): string {
  return encrypt(apiKey);
}

/**
 * Decrypt a stored API key.
 *
 * @param encryptedKey - The encrypted API key
 * @returns Decrypted API key
 */
export function decryptApiKey(encryptedKey: string): string {
  return decrypt(encryptedKey);
}

// =============================================================================
// Sensitive Data Masking
// =============================================================================

/**
 * Mask sensitive data for logging purposes.
 * Shows only first and last few characters.
 *
 * @param data - Data to mask
 * @param visibleChars - Number of characters to show at start and end
 * @returns Masked string
 */
export function maskSensitiveData(data: string, visibleChars: number = 4): string {
  if (data.length <= visibleChars * 2) {
    return '*'.repeat(data.length);
  }

  const start = data.substring(0, visibleChars);
  const end = data.substring(data.length - visibleChars);
  const masked = '*'.repeat(Math.min(data.length - visibleChars * 2, 10));

  return `${start}${masked}${end}`;
}

/**
 * Redact sensitive fields from an object for logging.
 * Returns a new object with sensitive fields replaced with '[REDACTED]'.
 *
 * @param obj - Object to redact
 * @param sensitiveFields - Array of field names to redact
 * @returns New object with redacted fields
 */
export function redactSensitiveFields<T extends Record<string, unknown>>(
  obj: T,
  sensitiveFields: string[] = ['password', 'passwordHash', 'token', 'apiKey', 'secret']
): T {
  const redacted = { ...obj };

  for (const field of sensitiveFields) {
    if (field in redacted) {
      (redacted as Record<string, unknown>)[field] = '[REDACTED]';
    }
  }

  return redacted;
}

// =============================================================================
// Data Masking for Logging
// =============================================================================

export function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return '***@***.***';
  const local = parts[0] || '';
  const domain = parts[1] || '';
  const domainParts = domain.split('.');
  const maskedLocal = local.length > 2 ? local.slice(0, 2) + '**' : '**';
  const domainFirst = domainParts[0] || '';
  const maskedDomain = domainFirst.length > 2 ? domainFirst.slice(0, 2) + '***' : '***';
  const tld = domainParts[1] || '***';
  return maskedLocal + '@' + maskedDomain + '.' + tld;
}

export function hashForLog(data: string): string {
  return createHash('sha256').update(data).digest('hex').substring(0, 8);
}


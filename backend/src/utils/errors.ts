/**
 * =============================================================================
 * Custom Error Classes
 * =============================================================================
 * Centralized error handling with consistent error response format.
 * All custom errors extend AppError for unified error handling.
 * =============================================================================
 */

/**
 * Standard error response format for API responses.
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
  requestId?: string;
}

/**
 * Base application error class.
 * All custom errors should extend this class.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    details?: unknown
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);

    // Set the prototype explicitly for instanceof checks
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * Convert error to API response format.
   */
  toResponse(requestId?: string): ErrorResponse {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
      timestamp: new Date().toISOString(),
      requestId,
    };
  }
}

// =============================================================================
// Authentication Errors (401)
// =============================================================================

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required', details?: unknown) {
    super(message, 401, 'UNAUTHORIZED', true, details);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export class InvalidCredentialsError extends AppError {
  constructor(message: string = 'Invalid email or password') {
    super(message, 401, 'INVALID_CREDENTIALS', true);
    Object.setPrototypeOf(this, InvalidCredentialsError.prototype);
  }
}

export class TokenExpiredError extends AppError {
  constructor(message: string = 'Token has expired') {
    super(message, 401, 'TOKEN_EXPIRED', true);
    Object.setPrototypeOf(this, TokenExpiredError.prototype);
  }
}

export class InvalidTokenError extends AppError {
  constructor(message: string = 'Invalid token') {
    super(message, 401, 'INVALID_TOKEN', true);
    Object.setPrototypeOf(this, InvalidTokenError.prototype);
  }
}

// =============================================================================
// Authorization Errors (403)
// =============================================================================

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied', details?: unknown) {
    super(message, 403, 'FORBIDDEN', true, details);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

export class InsufficientPermissionsError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'INSUFFICIENT_PERMISSIONS', true);
    Object.setPrototypeOf(this, InsufficientPermissionsError.prototype);
  }
}

export class SubscriptionRequiredError extends AppError {
  constructor(requiredTier: string = 'premium') {
    super(
      `This feature requires a ${requiredTier} subscription`,
      403,
      'SUBSCRIPTION_REQUIRED',
      true,
      { requiredTier }
    );
    Object.setPrototypeOf(this, SubscriptionRequiredError.prototype);
  }
}

// =============================================================================
// Not Found Errors (404)
// =============================================================================

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource', details?: unknown) {
    super(`${resource} not found`, 404, 'NOT_FOUND', true, details);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class UserNotFoundError extends AppError {
  constructor() {
    super('User not found', 404, 'USER_NOT_FOUND', true);
    Object.setPrototypeOf(this, UserNotFoundError.prototype);
  }
}

// =============================================================================
// Validation Errors (400)
// =============================================================================

export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', true, details);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request', details?: unknown) {
    super(message, 400, 'BAD_REQUEST', true, details);
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}

export class DuplicateEntryError extends AppError {
  constructor(field: string = 'entry') {
    super(`${field} already exists`, 400, 'DUPLICATE_ENTRY', true, { field });
    Object.setPrototypeOf(this, DuplicateEntryError.prototype);
  }
}

// =============================================================================
// Rate Limiting Errors (429)
// =============================================================================

export class RateLimitExceededError extends AppError {
  public readonly retryAfter: number;

  constructor(retryAfter: number = 60, message?: string) {
    super(
      message || `Rate limit exceeded. Try again in ${retryAfter} seconds`,
      429,
      'RATE_LIMIT_EXCEEDED',
      true,
      { retryAfter }
    );
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, RateLimitExceededError.prototype);
  }
}

export class UsageLimitExceededError extends AppError {
  constructor(limitType: 'daily' | 'monthly', limit: number) {
    super(
      `${limitType.charAt(0).toUpperCase() + limitType.slice(1)} usage limit of ${limit} minutes exceeded`,
      429,
      'USAGE_LIMIT_EXCEEDED',
      true,
      { limitType, limit }
    );
    Object.setPrototypeOf(this, UsageLimitExceededError.prototype);
  }
}

// =============================================================================
// Conflict Errors (409)
// =============================================================================

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict', details?: unknown) {
    super(message, 409, 'CONFLICT', true, details);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

// =============================================================================
// External Service Errors (502, 503)
// =============================================================================

export class ExternalServiceError extends AppError {
  constructor(service: string, message?: string) {
    super(
      message || `External service error: ${service}`,
      502,
      'EXTERNAL_SERVICE_ERROR',
      true,
      { service }
    );
    Object.setPrototypeOf(this, ExternalServiceError.prototype);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE', true);
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
  }
}

// =============================================================================
// Internal Errors (500)
// =============================================================================

export class InternalError extends AppError {
  constructor(message: string = 'Internal server error', details?: unknown) {
    // Internal errors are not operational - they represent bugs
    super(message, 500, 'INTERNAL_ERROR', false, details);
    Object.setPrototypeOf(this, InternalError.prototype);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string = 'Database operation failed') {
    super(message, 500, 'DATABASE_ERROR', false);
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

// =============================================================================
// Translation-Specific Errors
// =============================================================================

export class UnsupportedLanguageError extends AppError {
  constructor(language: string) {
    super(
      `Language '${language}' is not supported`,
      400,
      'UNSUPPORTED_LANGUAGE',
      true,
      { language }
    );
    Object.setPrototypeOf(this, UnsupportedLanguageError.prototype);
  }
}

export class TranslationError extends AppError {
  constructor(message: string = 'Translation failed', details?: unknown) {
    super(message, 500, 'TRANSLATION_ERROR', true, details);
    Object.setPrototypeOf(this, TranslationError.prototype);
  }
}

export class AudioProcessingError extends AppError {
  constructor(message: string = 'Audio processing failed', details?: unknown) {
    super(message, 400, 'AUDIO_PROCESSING_ERROR', true, details);
    Object.setPrototypeOf(this, AudioProcessingError.prototype);
  }
}

// =============================================================================
// Error Type Guard
// =============================================================================

/**
 * Type guard to check if an error is an AppError.
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Convert unknown error to AppError.
 * Useful for error handlers that need to normalize errors.
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new InternalError(error.message);
  }

  return new InternalError('An unexpected error occurred');
}

/**
 * =============================================================================
 * Request Validation Middleware
 * =============================================================================
 * Zod-based request validation for type-safe API endpoints.
 * Provides consistent validation error responses.
 * =============================================================================
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { z, ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('validation');

/**
 * Validation schemas container for a route.
 */
export interface ValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  querystring?: ZodSchema;
  headers?: ZodSchema;
}

/**
 * Format Zod validation errors for API response.
 */
function formatZodErrors(error: ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root';
    if (!formatted[path]) {
      formatted[path] = [];
    }
    formatted[path]!.push(issue.message);
  }

  return formatted;
}

/**
 * Create validation middleware for request body.
 */
export function validateBody<T extends ZodSchema>(schema: T) {
  return async function validateBodyMiddleware(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    try {
      const validated = schema.parse(request.body);
      // Replace body with validated/transformed data
      (request as FastifyRequest & { body: z.infer<T> }).body = validated;
    } catch (error) {
      if (error instanceof ZodError) {
        const details = formatZodErrors(error);
        logger.debug('Body validation failed', {
          requestId: request.id,
          errors: details,
        });
        throw new ValidationError('Request body validation failed', details);
      }
      throw error;
    }
  };
}

/**
 * Create validation middleware for URL parameters.
 */
export function validateParams<T extends ZodSchema>(schema: T) {
  return async function validateParamsMiddleware(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    try {
      const validated = schema.parse(request.params);
      (request as FastifyRequest & { params: z.infer<T> }).params = validated;
    } catch (error) {
      if (error instanceof ZodError) {
        const details = formatZodErrors(error);
        logger.debug('Params validation failed', {
          requestId: request.id,
          errors: details,
        });
        throw new ValidationError('URL parameters validation failed', details);
      }
      throw error;
    }
  };
}

/**
 * Create validation middleware for query string.
 */
export function validateQuery<T extends ZodSchema>(schema: T) {
  return async function validateQueryMiddleware(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    try {
      const validated = schema.parse(request.query);
      (request as FastifyRequest & { query: z.infer<T> }).query = validated;
    } catch (error) {
      if (error instanceof ZodError) {
        const details = formatZodErrors(error);
        logger.debug('Query validation failed', {
          requestId: request.id,
          errors: details,
        });
        throw new ValidationError('Query string validation failed', details);
      }
      throw error;
    }
  };
}

/**
 * Combined validation middleware factory.
 * Validates multiple parts of the request in one middleware.
 */
export function validate(schemas: ValidationSchemas) {
  return async function validateMiddleware(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    const errors: Record<string, Record<string, string[]>> = {};

    // Validate body
    if (schemas.body) {
      try {
        const validated = schemas.body.parse(request.body);
        (request as FastifyRequest & { body: unknown }).body = validated;
      } catch (error) {
        if (error instanceof ZodError) {
          errors['body'] = formatZodErrors(error);
        } else {
          throw error;
        }
      }
    }

    // Validate params
    if (schemas.params) {
      try {
        const validated = schemas.params.parse(request.params);
        (request as FastifyRequest & { params: unknown }).params = validated;
      } catch (error) {
        if (error instanceof ZodError) {
          errors['params'] = formatZodErrors(error);
        } else {
          throw error;
        }
      }
    }

    // Validate querystring
    if (schemas.querystring) {
      try {
        const validated = schemas.querystring.parse(request.query);
        (request as FastifyRequest & { query: unknown }).query = validated;
      } catch (error) {
        if (error instanceof ZodError) {
          errors['querystring'] = formatZodErrors(error);
        } else {
          throw error;
        }
      }
    }

    // Validate headers (selective)
    if (schemas.headers) {
      try {
        schemas.headers.parse(request.headers);
      } catch (error) {
        if (error instanceof ZodError) {
          errors['headers'] = formatZodErrors(error);
        } else {
          throw error;
        }
      }
    }

    // If any validation errors occurred, throw combined error
    if (Object.keys(errors).length > 0) {
      logger.debug('Request validation failed', {
        requestId: request.id,
        errors,
      });
      throw new ValidationError('Request validation failed', errors);
    }
  };
}

// =============================================================================
// Common Validation Schemas
// =============================================================================

/**
 * UUID parameter schema.
 */
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

/**
 * Pagination query schema.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * Date range query schema.
 */
export const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  },
  { message: 'Start date must be before or equal to end date' }
);

/**
 * Email validation schema.
 */
export const emailSchema = z.string().email('Invalid email address').toLowerCase().trim();

/**
 * Password validation schema with security requirements.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/,
    'Password must contain at least lowercase, uppercase, number, and special character'
  );

/**
 * Language code validation schema (ISO 639-1).
 */
export const languageCodeSchema = z
  .string()
  .length(2, 'Language code must be 2 characters')
  .toLowerCase();

/**
 * Sanitize string input (trim and escape).
 */
export const sanitizedStringSchema = z.string().trim().transform((val) => {
  // Basic HTML entity escaping
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
});

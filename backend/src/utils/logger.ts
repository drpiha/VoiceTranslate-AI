/**
 * =============================================================================
 * Logging Utility
 * =============================================================================
 * Structured logging with request correlation and sensitive data redaction.
 * Supports JSON and pretty print formats based on environment.
 * =============================================================================
 */

import { env, isDevelopment } from '../config/env.js';
import { redactSensitiveFields } from './crypto.js';

// =============================================================================
// Types
// =============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  requestId?: string;
  userId?: string;
  service?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

// =============================================================================
// Log Level Priority
// =============================================================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLogLevel = LOG_LEVELS[env.LOG_LEVEL] ?? LOG_LEVELS.info;

// =============================================================================
// Formatting
// =============================================================================

/**
 * Format log entry as JSON.
 */
function formatJson(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Format log entry for human-readable output.
 */
function formatPretty(entry: LogEntry): string {
  const { timestamp, level, message, context, error } = entry;

  const levelColors: Record<LogLevel, string> = {
    debug: '\x1b[36m', // Cyan
    info: '\x1b[32m',  // Green
    warn: '\x1b[33m',  // Yellow
    error: '\x1b[31m', // Red
  };

  const reset = '\x1b[0m';
  const color = levelColors[level];
  const levelStr = level.toUpperCase().padEnd(5);

  let output = `${timestamp} ${color}${levelStr}${reset} ${message}`;

  if (context && Object.keys(context).length > 0) {
    output += ` ${JSON.stringify(context)}`;
  }

  if (error) {
    output += `\n  Error: ${error.name}: ${error.message}`;
    if (error.stack && isDevelopment) {
      output += `\n  Stack: ${error.stack}`;
    }
  }

  return output;
}

/**
 * Format log entry based on configuration.
 */
function formatLogEntry(entry: LogEntry): string {
  if (env.LOG_FORMAT === 'pretty' || isDevelopment) {
    return formatPretty(entry);
  }
  return formatJson(entry);
}

// =============================================================================
// Logger Class
// =============================================================================

class Logger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  /**
   * Create a child logger with additional context.
   */
  child(additionalContext: LogContext): Logger {
    return new Logger({
      ...this.context,
      ...additionalContext,
    });
  }

  /**
   * Log a message at the specified level.
   */
  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    // Skip if log level is below threshold
    if (LOG_LEVELS[level] < currentLogLevel) {
      return;
    }

    // Merge contexts and redact sensitive fields
    const mergedContext = context
      ? redactSensitiveFields({ ...this.context, ...context })
      : this.context;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: Object.keys(mergedContext).length > 0 ? mergedContext : undefined,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    const formatted = formatLogEntry(entry);

    // Output to appropriate stream
    if (level === 'error') {
      console.error(formatted);
    } else if (level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }

  /**
   * Log a debug message.
   */
  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  /**
   * Log an info message.
   */
  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  /**
   * Log a warning message.
   */
  warn(message: string, context?: LogContext, error?: Error): void {
    this.log('warn', message, context, error);
  }

  /**
   * Log an error message.
   */
  error(message: string, context?: LogContext, error?: Error): void {
    this.log('error', message, context, error);
  }

  /**
   * Log an HTTP request.
   */
  request(
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
    context?: LogContext
  ): void {
    const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    this.log(level, `${method} ${path} ${statusCode} ${durationMs}ms`, {
      ...context,
      http: {
        method,
        path,
        statusCode,
        durationMs,
      },
    });
  }

  /**
   * Log a WebSocket event.
   */
  websocket(event: string, context?: LogContext): void {
    this.info(`WebSocket: ${event}`, {
      ...context,
      transport: 'websocket',
    });
  }

  /**
   * Log a database operation.
   */
  database(operation: string, model: string, durationMs: number, context?: LogContext): void {
    this.debug(`DB ${operation} on ${model} (${durationMs}ms)`, {
      ...context,
      database: {
        operation,
        model,
        durationMs,
      },
    });
  }

  /**
   * Log an external service call.
   */
  externalService(
    service: string,
    operation: string,
    success: boolean,
    durationMs: number,
    context?: LogContext
  ): void {
    const level: LogLevel = success ? 'info' : 'error';

    this.log(level, `External service: ${service}.${operation} (${durationMs}ms)`, {
      ...context,
      external: {
        service,
        operation,
        success,
        durationMs,
      },
    });
  }

  /**
   * Log a security event.
   */
  security(event: string, context?: LogContext): void {
    this.warn(`Security: ${event}`, {
      ...context,
      security: true,
    });
  }
}

// =============================================================================
// Default Logger Instance
// =============================================================================

export const logger = new Logger({ service: 'voicetranslate-api' });

/**
 * Create a logger for a specific service/module.
 */
export function createLogger(service: string): Logger {
  return logger.child({ service });
}

export { Logger };

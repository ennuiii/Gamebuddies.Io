/**
 * BUG FIX #17: Configurable Logger with Log Levels
 *
 * Provides structured logging with configurable levels.
 * Levels: error, warn, info, debug, trace
 *
 * Set LOG_LEVEL environment variable to control output:
 * - production: 'warn' (only errors and warnings)
 * - development: 'debug' (info and debug)
 * - verbose: 'trace' (everything)
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

// Get log level from environment
function getLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel;
  if (envLevel && envLevel in LOG_LEVELS) {
    return envLevel;
  }

  // Default based on NODE_ENV
  if (process.env.NODE_ENV === 'production') {
    return 'warn';
  }
  return 'debug';
}

let currentLevel: LogLevel = getLogLevel();

interface LogContext {
  [key: string]: unknown;
}

interface Logger {
  error: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  debug: (message: string, context?: LogContext) => void;
  trace: (message: string, context?: LogContext) => void;
  setLevel: (level: LogLevel) => void;
  getLevel: () => LogLevel;
  child: (prefix: string) => Logger;
}

/**
 * Format log message with timestamp and context
 */
function formatMessage(level: LogLevel, prefix: string, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const levelIcon = {
    error: '❌',
    warn: '⚠️',
    info: 'ℹ️',
    debug: '🔍',
    trace: '📝',
  }[level];

  let formatted = `${timestamp} ${levelIcon} [${level.toUpperCase()}]`;
  if (prefix) {
    formatted += ` [${prefix}]`;
  }
  formatted += ` ${message}`;

  if (context && Object.keys(context).length > 0) {
    // In production, stringify context; in dev, let console handle it
    if (process.env.NODE_ENV === 'production') {
      formatted += ` ${JSON.stringify(context)}`;
    }
  }

  return formatted;
}

/**
 * Create a logger instance
 */
function createLogger(prefix: string = ''): Logger {
  const shouldLog = (level: LogLevel): boolean => {
    return LOG_LEVELS[level] <= LOG_LEVELS[currentLevel];
  };

  const log = (level: LogLevel, message: string, context?: LogContext): void => {
    if (!shouldLog(level)) return;

    const formatted = formatMessage(level, prefix, message, context);
    const consoleMethod = level === 'error' ? 'error' :
      level === 'warn' ? 'warn' :
        level === 'debug' || level === 'trace' ? 'debug' : 'log';

    // In development, pass context as separate argument for better inspection
    if (process.env.NODE_ENV !== 'production' && context && Object.keys(context).length > 0) {
      console[consoleMethod](formatted, context);
    } else {
      console[consoleMethod](formatted);
    }
  };

  return {
    error: (message: string, context?: LogContext) => log('error', message, context),
    warn: (message: string, context?: LogContext) => log('warn', message, context),
    info: (message: string, context?: LogContext) => log('info', message, context),
    debug: (message: string, context?: LogContext) => log('debug', message, context),
    trace: (message: string, context?: LogContext) => log('trace', message, context),

    setLevel: (level: LogLevel): void => {
      currentLevel = level;
    },

    getLevel: (): LogLevel => currentLevel,

    child: (childPrefix: string): Logger => {
      const newPrefix = prefix ? `${prefix}:${childPrefix}` : childPrefix;
      return createLogger(newPrefix);
    },
  };
}

// Create default logger
export const logger = createLogger();

// Create domain-specific loggers
export const socketLogger = createLogger('SOCKET');
export const roomLogger = createLogger('ROOM');
export const gameLogger = createLogger('GAME');
export const authLogger = createLogger('AUTH');
export const dbLogger = createLogger('DB');
export const apiLogger = createLogger('API');

// Export factory for custom loggers
export { createLogger };

export default logger;

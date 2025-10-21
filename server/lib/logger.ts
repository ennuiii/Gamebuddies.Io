/**
 * Structured Logging System for GameBuddies
 *
 * Uses Winston for production-grade logging with:
 * - Log levels (error, warn, info, debug)
 * - Timestamps
 * - JSON formatting for log aggregation
 * - File rotation
 * - Console output in development
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';
import constants from '../config/constants';
import { Logger, LoggerMeta } from '../types';
import { Request, Response } from 'express';

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Determine log level based on environment
const logLevel =
  process.env.LOG_LEVEL ||
  (process.env.NODE_ENV === 'production'
    ? constants.LOG_LEVEL_PRODUCTION
    : constants.LOG_LEVEL_DEVELOPMENT);

// Custom format for development console output
const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    let msg = `${timestamp} [${level}]`;
    if (service) msg += ` [${service}]`;
    msg += `: ${message}`;

    // Add metadata if present
    const metaStr = Object.keys(meta).length ? '\n' + JSON.stringify(meta, null, 2) : '';

    return msg + metaStr;
  })
);

// Production format - JSON for log aggregation tools
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create the base Winston logger instance
const baseLogger = winston.createLogger({
  level: logLevel,
  format: prodFormat,
  defaultMeta: {
    service: 'gamebuddies',
    environment: process.env.NODE_ENV || 'development',
    version: '2.0',
  },
  transports: [
    // Error log - only errors
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: constants.MAX_LOG_FILE_SIZE,
      maxFiles: constants.MAX_LOG_FILES,
    }),

    // Combined log - all levels
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: constants.MAX_LOG_FILE_SIZE,
      maxFiles: constants.MAX_LOG_FILES,
    }),

    // Warnings log
    new winston.transports.File({
      filename: path.join(logsDir, 'warnings.log'),
      level: 'warn',
      maxsize: constants.MAX_LOG_FILE_SIZE,
      maxFiles: constants.MAX_LOG_FILES,
    }),
  ],
  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
    }),
  ],
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  baseLogger.add(
    new winston.transports.Console({
      format: devFormat,
    })
  );
}

// Create extended logger with convenience methods
const logger = baseLogger as unknown as Logger;

// Add convenience methods with context
logger.room = (message: string, meta: LoggerMeta = {}): void => {
  logger.info(message, { ...meta, component: 'room' });
};

logger.socket = (message: string, meta: LoggerMeta = {}): void => {
  logger.info(message, { ...meta, component: 'socket' });
};

logger.db = (message: string, meta: LoggerMeta = {}): void => {
  logger.info(message, { ...meta, component: 'database' });
};

logger.api = (message: string, meta: LoggerMeta = {}): void => {
  logger.info(message, { ...meta, component: 'api' });
};

logger.proxy = (message: string, meta: LoggerMeta = {}): void => {
  logger.info(message, { ...meta, component: 'proxy' });
};

logger.auth = (message: string, meta: LoggerMeta = {}): void => {
  logger.info(message, { ...meta, component: 'auth' });
};

logger.security = (message: string, meta: LoggerMeta = {}): void => {
  logger.warn(message, { ...meta, component: 'security' });
};

// Request logging middleware helper
logger.logRequest = (req: Request, res: Response, duration: number): void => {
  const logData: LoggerMeta = {
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    duration: `${duration}ms`,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  };

  if ((req as any).id) {
    logData.requestId = (req as any).id;
  }

  if (res.statusCode >= 500) {
    logger.error('Request failed', logData);
  } else if (res.statusCode >= 400) {
    logger.warn('Request error', logData);
  } else {
    logger.info('Request completed', logData);
  }
};

// Startup information
logger.info('Logger initialized', {
  logLevel,
  nodeEnv: process.env.NODE_ENV,
  logsDirectory: logsDir,
});

export default logger;

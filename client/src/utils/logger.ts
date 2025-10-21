import log from 'loglevel';

// Set default log level based on environment
const isDevelopment = process.env.NODE_ENV === 'development';
const logLevel = isDevelopment ? 'debug' : 'warn';

log.setLevel(logLevel);

// Create custom logger methods with prefixes
export const logger = {
  debug: (message: string, ...args: any[]) => {
    log.debug(`[DEBUG] ${message}`, ...args);
  },

  info: (message: string, ...args: any[]) => {
    log.info(`[INFO] ${message}`, ...args);
  },

  warn: (message: string, ...args: any[]) => {
    log.warn(`[WARN] ${message}`, ...args);
  },

  error: (message: string, error?: Error | any, ...args: any[]) => {
    if (error instanceof Error) {
      log.error(`[ERROR] ${message}`, error.message, error.stack, ...args);
    } else {
      log.error(`[ERROR] ${message}`, error, ...args);
    }
  },

  // Specialized logging methods
  socket: (event: string, data?: any) => {
    log.debug(`[SOCKET] ${event}`, data);
  },

  api: (method: string, endpoint: string, data?: any) => {
    log.debug(`[API] ${method} ${endpoint}`, data);
  },

  room: (action: string, roomCode?: string, data?: any) => {
    log.debug(`[ROOM] ${action}${roomCode ? ` (${roomCode})` : ''}`, data);
  },

  user: (action: string, data?: any) => {
    log.debug(`[USER] ${action}`, data);
  },

  // Set log level dynamically
  setLevel: (level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent') => {
    log.setLevel(level);
  },

  // Get current log level
  getLevel: () => {
    return log.getLevel();
  },
};

export default logger;

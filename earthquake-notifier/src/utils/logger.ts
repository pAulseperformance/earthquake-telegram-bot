// Cloud logging utility for GCP deployments
import fs from 'fs';

// Log levels
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
}

// Determine if we're in a GCP environment
const isGcpEnvironment = process.env.K_SERVICE !== undefined || 
  process.env.FUNCTION_NAME !== undefined ||
  process.env.GAE_SERVICE !== undefined;

/**
 * Log a message with structured logging for GCP
 */
export function log(level: LogLevel, message: string, data?: any): void {
  const timestamp = new Date().toISOString();
  
  const logEntry: LogEntry = {
    timestamp,
    level,
    message
  };
  
  if (data) {
    logEntry.data = data;
  }

  // Format for structured logging in GCP
  if (isGcpEnvironment) {
    // Format for Cloud Logging
    const gcpLog = {
      severity: level,
      message,
      time: timestamp,
      ...data
    };
    console.log(JSON.stringify(gcpLog));
  } else {
    // Local development logging
    const color = {
      [LogLevel.DEBUG]: '\x1b[36m', // Cyan
      [LogLevel.INFO]: '\x1b[32m',  // Green
      [LogLevel.WARN]: '\x1b[33m',  // Yellow
      [LogLevel.ERROR]: '\x1b[31m', // Red
    };
    
    const reset = '\x1b[0m';
    console.log(`${color[level]}[${timestamp}] [${level}]${reset} ${message}`);
    
    if (data) {
      console.log(data);
    }
    
    // Also write to a local log file
    const logDir = process.env.LOG_DIR || './logs';
    if (!fs.existsSync(logDir)) {
      try {
        fs.mkdirSync(logDir, { recursive: true });
      } catch (err: any) {
        console.error(`Failed to create log directory: ${err.message}`);
        return; // Skip file logging but continue with console output
      }
    }
    
    const logFile = `${logDir}/${new Date().toISOString().split('T')[0]}.log`;
    try {
      fs.appendFileSync(
        logFile, 
        `[${timestamp}] [${level}] ${message} ${data ? JSON.stringify(data) : ''}\n`
      );
    } catch (err: any) {
      console.error(`Failed to write to log file: ${err.message}`);
    }
  }
}

// Helper methods for each log level
export const logger = {
  debug: (message: string, data?: any) => log(LogLevel.DEBUG, message, data),
  info: (message: string, data?: any) => log(LogLevel.INFO, message, data),
  warn: (message: string, data?: any) => log(LogLevel.WARN, message, data),
  error: (message: string, data?: any) => log(LogLevel.ERROR, message, data),
};

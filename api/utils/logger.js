import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define log colors
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue'
};

winston.addColors(logColors);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta, null, 2)}`;
    }
    return log;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: logLevels,
  format: fileFormat,
  defaultMeta: { service: 'aryan-api' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat,
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
    }),

    // Error log file
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true
    }),

    // Combined log file
    new DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true
    }),

    // HTTP requests log file
    new DailyRotateFile({
      filename: path.join(logsDir, 'http-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'http',
      maxSize: '20m',
      maxFiles: '7d',
      zippedArchive: true
    }),

    // Chat conversations log file
    new DailyRotateFile({
      filename: path.join(logsDir, 'chat-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'info',
      maxSize: '50m',
      maxFiles: '30d', // Keep chat logs longer
      zippedArchive: true,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json()
      )
    })
  ],

  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log')
    })
  ],

  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log')
    })
  ]
});

// Add custom methods for different types of logging
logger.api = {
  request: (req, res, responseTime) => {
    logger.http('API Request', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      timestamp: new Date().toISOString()
    });
  },

  error: (req, error, additionalInfo = {}) => {
    logger.error('API Error', {
      method: req.method,
      url: req.url,
      error: error.message,
      stack: error.stack,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      ...additionalInfo,
      timestamp: new Date().toISOString()
    });
  },

  success: (req, message, data = {}) => {
    logger.info('API Success', {
      method: req.method,
      url: req.url,
      message,
      ...data,
      timestamp: new Date().toISOString()
    });
  }
};

// Add external service logging
logger.external = {
  request: (service, endpoint, method = 'GET', additionalInfo = {}) => {
    logger.info('External Service Request', {
      service,
      endpoint,
      method,
      ...additionalInfo,
      timestamp: new Date().toISOString()
    });
  },

  response: (service, endpoint, statusCode, responseTime, additionalInfo = {}) => {
    logger.info('External Service Response', {
      service,
      endpoint,
      statusCode,
      responseTime: `${responseTime}ms`,
      ...additionalInfo,
      timestamp: new Date().toISOString()
    });
  },

  error: (service, endpoint, error, additionalInfo = {}) => {
    logger.error('External Service Error', {
      service,
      endpoint,
      error: error.message,
      stack: error.stack,
      ...additionalInfo,
      timestamp: new Date().toISOString()
    });
  }
};

// Add business logic logging
logger.business = {
  userAction: (action, userId, additionalInfo = {}) => {
    logger.info('User Action', {
      action,
      userId,
      ...additionalInfo,
      timestamp: new Date().toISOString()
    });
  },

  systemEvent: (event, additionalInfo = {}) => {
    logger.info('System Event', {
      event,
      ...additionalInfo,
      timestamp: new Date().toISOString()
    });
  },

  performance: (operation, duration, additionalInfo = {}) => {
    logger.info('Performance Metric', {
      operation,
      duration: `${duration}ms`,
      ...additionalInfo,
      timestamp: new Date().toISOString()
    });
  }
};

// Add chat logging functionality
logger.chat = {
  conversationStart: (sessionId, userInfo = {}) => {
    logger.info('Chat Conversation Started', {
      sessionId,
      ...userInfo,
      timestamp: new Date().toISOString()
    });
  },

  userMessage: (sessionId, message, intent, additionalInfo = {}) => {
    logger.info('User Message', {
      sessionId,
      message: message.substring(0, 500), // Limit message length for logs
      messageLength: message.length,
      intent,
      ...additionalInfo,
      timestamp: new Date().toISOString()
    });
  },

  aiResponse: (sessionId, response, responseTime, additionalInfo = {}) => {
    logger.info('AI Response', {
      sessionId,
      response: response.substring(0, 500), // Limit response length for logs
      responseLength: response.length,
      responseTime: `${responseTime}ms`,
      ...additionalInfo,
      timestamp: new Date().toISOString()
    });
  },

  conversationEnd: (sessionId, messageCount, duration, additionalInfo = {}) => {
    logger.info('Chat Conversation Ended', {
      sessionId,
      messageCount,
      duration: `${duration}ms`,
      ...additionalInfo,
      timestamp: new Date().toISOString()
    });
  },

  error: (sessionId, error, context = {}) => {
    logger.error('Chat Error', {
      sessionId,
      error: error.message,
      stack: error.stack,
      ...context,
      timestamp: new Date().toISOString()
    });
  },

  intentAnalysis: (sessionId, question, detectedIntents, primaryIntent) => {
    logger.debug('Intent Analysis', {
      sessionId,
      question: question.substring(0, 200),
      detectedIntents,
      primaryIntent,
      timestamp: new Date().toISOString()
    });
  },

  followUpSuggestions: (sessionId, suggestions, context = {}) => {
    logger.debug('Follow-up Suggestions Generated', {
      sessionId,
      suggestions,
      ...context,
      timestamp: new Date().toISOString()
    });
  },

  geminiApiCall: (sessionId, promptLength, responseTime, success, error = null) => {
    if (success) {
      logger.info('Gemini API Call Success', {
        sessionId,
        promptLength,
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.error('Gemini API Call Failed', {
        sessionId,
        promptLength,
        responseTime: `${responseTime}ms`,
        error: error?.message,
        timestamp: new Date().toISOString()
      });
    }
  }
};

// Create logs directory if it doesn't exist
import fs from 'fs';
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

export default logger;

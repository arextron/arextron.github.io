import logger from '../utils/logger.js';

// Request logging middleware
export const requestLogging = (req, res, next) => {
  const startTime = Date.now();
  
  // Log incoming request
  logger.http('Incoming Request', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    headers: {
      'content-type': req.get('Content-Type'),
      'authorization': req.get('Authorization') ? '[REDACTED]' : undefined,
      'origin': req.get('Origin')
    },
    query: req.query,
    body: req.method !== 'GET' ? req.body : undefined
  });

  // Override res.end to capture response details
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const responseTime = Date.now() - startTime;
    
    // Log response
    logger.api.request(req, res, responseTime);
    
    // Call original end method
    originalEnd.call(this, chunk, encoding);
  };

  next();
};

// Error logging middleware
export const errorLogging = (err, req, res, next) => {
  // Log the error
  logger.api.error(req, err, {
    statusCode: err.status || 500,
    stack: err.stack
  });

  // Send error response
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// Performance monitoring middleware
export const performanceLogging = (req, res, next) => {
  const startTime = process.hrtime.bigint();
  
  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    
    logger.business.performance(`${req.method} ${req.url}`, duration, {
      statusCode: res.statusCode,
      contentLength: res.get('Content-Length')
    });
  });
  
  next();
};

// Security logging middleware
export const securityLogging = (req, res, next) => {
  // Log suspicious activities
  const suspiciousPatterns = [
    /\.\./,  // Directory traversal
    /<script/i,  // XSS attempts
    /union.*select/i,  // SQL injection
    /eval\(/i,  // Code injection
    /javascript:/i  // JavaScript protocol
  ];

  const url = req.url.toLowerCase();
  const userAgent = req.get('User-Agent') || '';
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(url) || pattern.test(userAgent)) {
      logger.warn('Suspicious Activity Detected', {
        method: req.method,
        url: req.url,
        userAgent,
        ip: req.ip || req.connection.remoteAddress,
        pattern: pattern.toString(),
        timestamp: new Date().toISOString()
      });
      break;
    }
  }
  
  next();
};

// API usage analytics middleware
export const analyticsLogging = (req, res, next) => {
  // Track API endpoint usage
  const endpoint = `${req.method} ${req.route?.path || req.url}`;
  
  res.on('finish', () => {
    logger.business.systemEvent('API Endpoint Usage', {
      endpoint,
      statusCode: res.statusCode,
      responseTime: res.get('X-Response-Time'),
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress
    });
  });
  
  next();
};

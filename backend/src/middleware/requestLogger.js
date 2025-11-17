import { accessLogger } from '../config/logger.js';

/**
 * Middleware to log all HTTP requests
 * Logs request method, path, IP, user agent, response status, and response time
 */
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Log request
  accessLogger.info('Incoming request', {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.userId || 'anonymous'
  });

  // Capture response finish event
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    accessLogger.info('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userId: req.userId || 'anonymous'
    });
  });

  next();
};


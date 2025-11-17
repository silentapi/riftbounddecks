import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import logger from '../config/logger.js';

/**
 * Middleware to authenticate JWT tokens
 * Extracts token from Authorization header and verifies it
 */
export const authenticate = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Authentication failed: No token provided', {
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'No token provided. Please include a Bearer token in the Authorization header.'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      logger.warn('Authentication failed: Empty token', {
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid token format.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user and attach to request
    const user = await User.findById(decoded.userId).select('-password_hash');
    
    if (!user) {
      logger.warn('Authentication failed: User not found', {
        userId: decoded.userId,
        path: req.path,
        method: req.method
      });
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'User not found.'
      });
    }

    // Attach user to request object
    req.user = user;
    req.userId = user._id.toString();

    logger.debug('Authentication successful', {
      userId: req.userId,
      username: user.username,
      path: req.path,
      method: req.method
    });

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      logger.warn('Authentication failed: Invalid token', {
        error: error.message,
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid token.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      logger.warn('Authentication failed: Token expired', {
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Token has expired.'
      });
    }

    logger.error('Authentication error:', {
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method
    });
    
    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'An error occurred during authentication.'
    });
  }
};


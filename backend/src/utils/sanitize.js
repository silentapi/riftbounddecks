/**
 * Utility functions to sanitize data before logging
 * Removes sensitive fields like passwords from objects
 */

// Fields that should never be logged (case-insensitive matching)
const SENSITIVE_FIELDS = [
  'password',
  'password_hash',
  'passwordHash',
  'currentPassword',
  'current_password',
  'newPassword',
  'new_password',
  'oldPassword',
  'old_password',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'jwt_secret',
  'jwtSecret'
];

/**
 * Recursively sanitize an object by removing sensitive fields
 * @param {any} obj - The object to sanitize
 * @param {number} depth - Current recursion depth (prevents infinite loops)
 * @returns {any} - Sanitized object
 */
export function sanitizeForLogging(obj, depth = 0) {
  // Prevent infinite recursion
  if (depth > 10) {
    return '[Max depth reached]';
  }

  // Handle null/undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle primitives
  if (typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForLogging(item, depth + 1));
  }

  // Handle Date objects
  if (obj instanceof Date) {
    return obj;
  }

  // Handle objects
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    
    // Check if this field should be sanitized
    const isSensitive = SENSITIVE_FIELDS.some(field => 
      keyLower === field.toLowerCase() || keyLower.includes(field.toLowerCase())
    );

    if (isSensitive) {
      // Replace sensitive fields with [REDACTED]
      sanitized[key] = '[REDACTED]';
    } else {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeForLogging(value, depth + 1);
    }
  }

  return sanitized;
}

/**
 * Sanitize a request body for logging
 * @param {object} body - Request body object
 * @returns {object} - Sanitized request body
 */
export function sanitizeRequestBody(body) {
  if (!body || typeof body !== 'object') {
    return body;
  }
  return sanitizeForLogging(body);
}


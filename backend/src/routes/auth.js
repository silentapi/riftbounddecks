import express from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import UserPreferences from '../models/UserPreferences.js';
import RegistrationKey from '../models/RegistrationKey.js';
import RegistrationUsage from '../models/RegistrationUsage.js';
import RefreshToken from '../models/RefreshToken.js';
import { authenticate } from '../middleware/auth.js';
import { isMasterKey } from '../config/masterKey.js';
import logger from '../config/logger.js';
import crypto from 'crypto';
import { sanitizeForLogging } from '../utils/sanitize.js';

const router = express.Router();

/**
 * Helper function to generate access token and refresh token
 * @param {Object} user - User object
 * @param {boolean} rememberMe - Whether to use long-lived refresh token
 * @returns {Object} - Object with accessToken and refreshToken
 */
function generateTokens(user, rememberMe = false) {
  // Access token: short-lived (default 1h, or from env)
  const accessTokenExpiry = process.env.JWT_EXPIRES_IN || '1h';
  const accessToken = jwt.sign(
    { userId: user._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn: accessTokenExpiry }
  );

  // Refresh token: long-lived if rememberMe is true, otherwise shorter
  // Default: 7 days if rememberMe, 24 hours if not
  const refreshTokenExpiryDays = rememberMe 
    ? parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || '7', 10)
    : 1;
  
  const refreshTokenExpiry = new Date();
  refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + refreshTokenExpiryDays);

  return {
    accessToken,
    refreshTokenExpiry
  };
}

/**
 * Helper function to set refresh token cookie
 * @param {Object} res - Express response object
 * @param {string} token - Refresh token string
 * @param {Date} expiresAt - Expiration date
 */
function setRefreshTokenCookie(res, token, expiresAt) {
  const isProduction = process.env.NODE_ENV === 'production';
  const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  
  res.cookie('refreshToken', token, {
    httpOnly: true, // Prevents JavaScript access (XSS protection)
    secure: isProduction, // Only send over HTTPS in production
    sameSite: 'strict', // CSRF protection
    maxAge: maxAge * 1000, // Convert to milliseconds
    path: '/' // Available for all paths on the same domain
  });
}

/**
 * Helper function to clear refresh token cookie
 * @param {Object} res - Express response object
 */
function clearRefreshTokenCookie(res) {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });
}

/**
 * POST /api/auth/register
 * Register a new user with an invite code
 */
router.post('/register', [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one letter and one number'),
  body('registrationKey')
    .trim()
    .notEmpty()
    .withMessage('Registration key is required'),
  body('displayName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Display name must be between 1 and 50 characters')
], async (req, res, next) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Registration validation failed', {
        errors: sanitizeForLogging(errors.array()),
        username: req.body.username,
        email: req.body.email
      });
      return res.status(400).json({
        error: 'Validation Error',
        message: errors.array().map(e => e.msg).join(', ')
      });
    }

    const { username, email, password, registrationKey, rememberMe, displayName } = req.body;

    logger.info('Registration attempt', { username, email, displayName });

    // Check if username or email already exists
    const existingUser = await User.findOne({
      $or: [{ username }, { email }]
    });

    if (existingUser) {
      logger.warn('Registration failed: User already exists', {
        username,
        email,
        existingField: existingUser.username === username ? 'username' : 'email'
      });
      return res.status(409).json({
        error: 'Conflict',
        message: existingUser.username === username 
          ? 'Username already exists' 
          : 'Email already exists'
      });
    }

    // Check if displayName is provided and if it's already taken
    if (displayName) {
      const existingDisplayName = await UserPreferences.findOne({ displayName });
      if (existingDisplayName) {
        logger.warn('Registration failed: Display name already exists', {
          displayName
        });
        return res.status(409).json({
          error: 'Conflict',
          message: 'Display name already exists'
        });
      }
    }

    // Check if it's the in-memory master key first
    const isMasterRegistrationKey = isMasterKey(registrationKey);
    
    let regKey = null;
    
    if (isMasterRegistrationKey) {
      // Master key is valid - no need to check database
      logger.info('Registration using master key (in-memory)', {
        username,
        email
      });
    } else {
      // Validate registration key from database
      regKey = await RegistrationKey.findOne({ key: registrationKey });
      
      if (!regKey) {
        logger.warn('Registration failed: Invalid registration key', {
          username,
          email,
          registrationKey
        });
        return res.status(404).json({
          error: 'Not Found',
          message: 'Registration key not found'
        });
      }

      // Check if key can be used
      if (!regKey.canBeUsed()) {
        logger.warn('Registration failed: Registration key exhausted', {
          username,
          email,
          registrationKey: regKey.key,
          currentUses: regKey.currentUses,
          maxUses: regKey.maxUses
        });
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Registration key has been exhausted'
        });
      }
    }

    // Hash password
    const password_hash = await User.hashPassword(password);

    // Create user
    const user = new User({
      username,
      email,
      password_hash
    });

    await user.save();

    logger.info('User created successfully', {
      userId: user._id.toString(),
      username: user.username
    });

    // Create default user preferences
    const preferences = new UserPreferences({
      userId: user._id,
      theme: 'dark',
      lastOpenedDeck: null,
      defaultDeckId: null,
      screenshotMode: 'full',
      profilePictureCardId: 'OGN-155',
      displayName: displayName || null
    });
    await preferences.save();

    logger.debug('User preferences created', {
      userId: user._id.toString(),
      preferencesId: preferences._id.toString()
    });

    // Increment registration key usage (only for database keys, not master key)
    if (!isMasterRegistrationKey && regKey) {
      await regKey.incrementUsage();

      // Create registration usage record
      const usage = new RegistrationUsage({
        registrationKeyId: regKey._id,
        registeredUserId: user._id
      });
      await usage.save();

      logger.debug('Registration usage recorded', {
        registrationKeyId: regKey._id.toString(),
        registeredUserId: user._id.toString()
      });
    } else {
      logger.debug('Registration using master key - no usage tracking', {
        userId: user._id.toString()
      });
    }

    // Create 3 separate single-use registration keys for new user
    const newUserRegKeys = [];
    for (let i = 0; i < 3; i++) {
      const newUserRegKey = new RegistrationKey({
        ownerId: user._id,
        maxUses: 1,
        currentUses: 0,
        isMasterKey: false
      });
      await newUserRegKey.save();
      newUserRegKeys.push(newUserRegKey);
      
      logger.debug('Registration key created for new user', {
        userId: user._id.toString(),
        registrationKeyId: newUserRegKey._id.toString(),
        key: newUserRegKey.key,
        keyNumber: i + 1
      });
    }

    logger.info('3 registration keys created for new user', {
      userId: user._id.toString(),
      keys: newUserRegKeys.map(k => ({ id: k._id.toString(), key: k.key }))
    });

    // Generate tokens
    const { accessToken, refreshTokenExpiry } = generateTokens(user, rememberMe === true);
    
    // Create and save refresh token
    const refreshTokenValue = RefreshToken.generateToken();
    const refreshToken = new RefreshToken({
      token: refreshTokenValue,
      userId: user._id,
      expiresAt: refreshTokenExpiry
    });
    await refreshToken.save();

    // Set refresh token as httpOnly cookie
    setRefreshTokenCookie(res, refreshTokenValue, refreshTokenExpiry);

    logger.info('Registration successful', {
      userId: user._id.toString(),
      username: user.username,
      rememberMe: rememberMe === true
    });

    // Return user data (without password) and access token
    res.status(201).json({
      user: {
        _id: user._id.toString(),
        username: user.username,
        email: user.email,
        dateCreated: user.dateCreated,
        lastUpdated: user.lastUpdated
      },
      token: accessToken,
      preferences: {
        _id: preferences._id.toString(),
        userId: preferences.userId.toString(),
        theme: preferences.theme,
        lastOpenedDeck: preferences.lastOpenedDeck,
        defaultDeckId: preferences.defaultDeckId || null,
        screenshotMode: preferences.screenshotMode || 'full',
        profilePictureCardId: preferences.profilePictureCardId || 'OGN-155',
        displayName: preferences.displayName || null,
        dateCreated: preferences.dateCreated,
        lastUpdated: preferences.lastUpdated
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
router.post('/login', [
  body('username')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Username cannot be empty'),
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], async (req, res, next) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Login validation failed', {
        errors: sanitizeForLogging(errors.array())
      });
      return res.status(400).json({
        error: 'Validation Error',
        message: errors.array().map(e => e.msg).join(', ')
      });
    }

    const { username, email, password, rememberMe } = req.body;

    // Must provide either username or email (but not both)
    if (!username && !email) {
      logger.warn('Login failed: Missing username or email');
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Either username or email is required'
      });
    }

    if (username && email) {
      logger.warn('Login failed: Both username and email provided');
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Provide either username or email, not both'
      });
    }

    logger.info('Login attempt', {
      identifier: username || email
    });

    // Find user by username or email
    const user = await User.findOne(
      username ? { username } : { email }
    ).select('+password_hash'); // Include password_hash for comparison

    if (!user) {
      logger.warn('Login failed: User not found', {
        identifier: username || email
      });
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid username/email or password'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      logger.warn('Login failed: Invalid password', {
        userId: user._id.toString(),
        username: user.username
      });
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid username/email or password'
      });
    }

    // Get user preferences
    let preferences = await UserPreferences.findOne({ userId: user._id });
    
    // Create default preferences if they don't exist
    if (!preferences) {
      preferences = new UserPreferences({
        userId: user._id,
        theme: 'dark',
        lastOpenedDeck: null,
        defaultDeckId: null,
        screenshotMode: 'full',
        profilePictureCardId: 'OGN-155',
        displayName: null
      });
      await preferences.save();
      logger.debug('Default preferences created for user', {
        userId: user._id.toString()
      });
    }

    // Generate tokens
    const { accessToken, refreshTokenExpiry } = generateTokens(user, rememberMe === true);
    
    // Create and save refresh token
    const refreshTokenValue = RefreshToken.generateToken();
    const refreshToken = new RefreshToken({
      token: refreshTokenValue,
      userId: user._id,
      expiresAt: refreshTokenExpiry
    });
    await refreshToken.save();

    // Set refresh token as httpOnly cookie
    setRefreshTokenCookie(res, refreshTokenValue, refreshTokenExpiry);

    logger.info('Login successful', {
      userId: user._id.toString(),
      username: user.username,
      rememberMe: rememberMe === true
    });

    // Return user data (without password) and access token
    res.json({
      user: {
        _id: user._id.toString(),
        username: user.username,
        email: user.email,
        dateCreated: user.dateCreated,
        lastUpdated: user.lastUpdated
      },
      token: accessToken,
      preferences: {
        _id: preferences._id.toString(),
        userId: preferences.userId.toString(),
        theme: preferences.theme,
        lastOpenedDeck: preferences.lastOpenedDeck 
          ? preferences.lastOpenedDeck.toString() 
          : null,
        defaultDeckId: preferences.defaultDeckId || null,
        screenshotMode: preferences.screenshotMode || 'full',
        profilePictureCardId: preferences.profilePictureCardId || 'OGN-155',
        displayName: preferences.displayName || null,
        dateCreated: preferences.dateCreated,
        lastUpdated: preferences.lastUpdated
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    logger.debug('Get current user', {
      userId: req.userId
    });

    res.json({
      _id: req.user._id.toString(),
      username: req.user.username,
      email: req.user.email,
      dateCreated: req.user.dateCreated,
      lastUpdated: req.user.lastUpdated
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/registration-keys
 * Get all registration keys owned by current user
 */
router.get('/registration-keys', authenticate, async (req, res, next) => {
  try {
    logger.debug('Get registration keys', {
      userId: req.userId
    });

    const regKeys = await RegistrationKey.find({ ownerId: req.userId })
      .sort({ dateCreated: 1 }); // Sort by creation date, oldest first

    if (!regKeys || regKeys.length === 0) {
      logger.debug('No registration keys found for user', {
        userId: req.userId
      });
      return res.json([]);
    }

    // Get usage history and last claimed user for each key
    const keysWithUsage = await Promise.all(regKeys.map(async (regKey) => {
      // Get the most recent usage (last claimed user)
      const lastUsage = await RegistrationUsage.findOne({
        registrationKeyId: regKey._id
      })
        .populate('registeredUserId', 'username')
        .sort({ dateCreated: -1 });

      const remainingUses = regKey.isMasterKey || regKey.maxUses === -1
        ? -1
        : Math.max(0, regKey.maxUses - regKey.currentUses);

      const isFullyClaimed = !regKey.isMasterKey && regKey.maxUses !== -1 && regKey.currentUses >= regKey.maxUses;

      return {
        _id: regKey._id.toString(),
        key: regKey.key,
        ownerId: regKey.ownerId.toString(),
        maxUses: regKey.maxUses,
        currentUses: regKey.currentUses,
        remainingUses,
        isMasterKey: regKey.isMasterKey,
        isFullyClaimed,
        dateCreated: regKey.dateCreated,
        lastUpdated: regKey.lastUpdated,
        lastClaimedBy: lastUsage?.registeredUserId?.username || null
      };
    }));

    res.json(keysWithUsage);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token from cookie
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const refreshTokenValue = req.cookies?.refreshToken;

    if (!refreshTokenValue) {
      logger.warn('Refresh token missing', {
        ip: req.ip
      });
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Refresh token not provided'
      });
    }

    // Find refresh token in database
    const refreshToken = await RefreshToken.findOne({ token: refreshTokenValue });

    if (!refreshToken) {
      logger.warn('Refresh token not found', {
        ip: req.ip
      });
      clearRefreshTokenCookie(res);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid refresh token'
      });
    }

    // Check if token is expired
    if (refreshToken.isExpired()) {
      logger.warn('Refresh token expired', {
        userId: refreshToken.userId.toString(),
        ip: req.ip
      });
      await RefreshToken.deleteOne({ _id: refreshToken._id });
      clearRefreshTokenCookie(res);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Refresh token expired'
      });
    }

    // Find user
    const user = await User.findById(refreshToken.userId);

    if (!user) {
      logger.warn('User not found for refresh token', {
        userId: refreshToken.userId.toString(),
        ip: req.ip
      });
      await RefreshToken.deleteOne({ _id: refreshToken._id });
      clearRefreshTokenCookie(res);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not found'
      });
    }

    // Update last used timestamp
    await refreshToken.updateLastUsed();

    // Generate new access token (short-lived)
    const accessTokenExpiry = process.env.JWT_EXPIRES_IN || '1h';
    const accessToken = jwt.sign(
      { userId: user._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: accessTokenExpiry }
    );

    logger.debug('Token refreshed successfully', {
      userId: user._id.toString(),
      username: user.username
    });

    // Return new access token
    res.json({
      token: accessToken
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/logout
 * Logout user and invalidate refresh token
 */
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const refreshTokenValue = req.cookies?.refreshToken;

    if (refreshTokenValue) {
      // Delete refresh token from database
      await RefreshToken.deleteOne({ token: refreshTokenValue });
      logger.debug('Refresh token invalidated', {
        userId: req.userId
      });
    }

    // Clear refresh token cookie
    clearRefreshTokenCookie(res);

    logger.info('Logout successful', {
      userId: req.userId,
      username: req.user.username
    });

    res.json({
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/change-password
 * Change user password
 */
router.post('/change-password', authenticate, [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one letter and one number')
], async (req, res, next) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Change password validation failed', {
        errors: sanitizeForLogging(errors.array()),
        userId: req.userId
      });
      return res.status(400).json({
        error: 'Validation Error',
        message: errors.array().map(e => e.msg).join(', ')
      });
    }

    const { currentPassword, newPassword } = req.body;

    logger.info('Password change attempt', {
      userId: req.userId,
      username: req.user.username
    });

    // Get user with password_hash
    const user = await User.findById(req.userId).select('+password_hash');

    if (!user) {
      logger.warn('Password change failed: User not found', {
        userId: req.userId
      });
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found'
      });
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);

    if (!isPasswordValid) {
      logger.warn('Password change failed: Invalid current password', {
        userId: req.userId,
        username: req.user.username
      });
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Current password is incorrect'
      });
    }

    // Check if new password is the same as current password
    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
      logger.warn('Password change failed: New password same as current', {
        userId: req.userId,
        username: req.user.username
      });
      return res.status(400).json({
        error: 'Validation Error',
        message: 'New password must be different from current password'
      });
    }

    // Hash new password
    const newPasswordHash = await User.hashPassword(newPassword);

    // Update password
    user.password_hash = newPasswordHash;
    await user.save();

    logger.info('Password changed successfully', {
      userId: req.userId,
      username: req.user.username
    });

    res.json({
      message: 'Password changed successfully'
    });
  } catch (error) {
    next(error);
  }
});

export default router;


import express from 'express';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import UserPreferences from '../models/UserPreferences.js';
import { authenticate } from '../middleware/auth.js';
import logger from '../config/logger.js';
import { sanitizeForLogging } from '../utils/sanitize.js';

const router = express.Router();

/**
 * GET /api/user/preferences
 * Get current user's preferences
 */
router.get('/preferences', authenticate, async (req, res, next) => {
  try {
    logger.debug('Get user preferences', {
      userId: req.userId
    });

    let preferences = await UserPreferences.findOne({ userId: req.userId });

    // Create default preferences if they don't exist
    if (!preferences) {
      preferences = new UserPreferences({
        userId: req.userId,
        theme: 'dark',
        lastOpenedDeck: null,
        defaultDeckId: null,
        screenshotMode: 'full',
        profilePictureCardId: 'OGN-155',
        displayName: null
      });
      await preferences.save();
      logger.debug('Default preferences created', {
        userId: req.userId
      });
    }

    res.json({
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
      firstName: preferences.firstName || null,
      lastName: preferences.lastName || null,
      riotId: preferences.riotId || null,
      dateCreated: preferences.dateCreated,
      lastUpdated: preferences.lastUpdated
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/user/preferences
 * Update user preferences (upsert)
 */
router.post('/preferences', [
  authenticate,
  body('theme')
    .optional()
    .isIn(['light', 'dark'])
    .withMessage('Theme must be either "light" or "dark"'),
  body('lastOpenedDeck')
    .optional()
    .custom((value) => {
      if (value === null) return true;
      // Validate ObjectId format (MongoDB ObjectId) or UUID format
      if (typeof value === 'string' && (/^[0-9a-fA-F]{24}$/.test(value) || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))) {
        return true;
      }
      throw new Error('lastOpenedDeck must be a valid ObjectId or UUID, or null');
    }),
  body('defaultDeckId')
    .optional()
    .custom((value) => {
      if (value === null || value === undefined) return true;
      // Validate UUID format
      if (typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
        return true;
      }
      throw new Error('defaultDeckId must be a valid UUID or null');
    }),
  body('screenshotMode')
    .optional()
    .isIn(['full', 'deck'])
    .withMessage('Screenshot mode must be either "full" or "deck"'),
  body('profilePictureCardId')
    .optional()
    .isString()
    .withMessage('Profile picture card ID must be a string')
    .matches(/^[A-Z]+-\d+(-\d+)?$/)
    .withMessage('Profile picture card ID must be in format like "OGN-155" or "OGN-155-1"'),
  body('displayName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Display name must be between 1 and 50 characters'),
  body('firstName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('First name cannot exceed 100 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Last name cannot exceed 100 characters'),
  body('riotId')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Riot ID cannot exceed 100 characters')
], async (req, res, next) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Preferences update validation failed', {
        userId: req.userId,
        errors: errors.array()
      });
      return res.status(400).json({
        error: 'Validation Error',
        message: errors.array().map(e => e.msg).join(', ')
      });
    }

    const { theme, lastOpenedDeck, defaultDeckId, screenshotMode, profilePictureCardId, displayName, firstName, lastName, riotId } = req.body;

    logger.info('Update user preferences', {
      userId: req.userId,
      theme,
      lastOpenedDeck,
      defaultDeckId,
      screenshotMode,
      profilePictureCardId,
      displayName,
      firstName,
      lastName,
      riotId
    });

    // Check if displayName is being updated and if it's already taken (unless it's the same as current)
    if (displayName !== undefined && displayName !== null) {
      const currentPreferences = await UserPreferences.findOne({ userId: req.userId });
      // Only check uniqueness if it's different from the current display name
      if (!currentPreferences || currentPreferences.displayName !== displayName) {
        const existingDisplayName = await UserPreferences.findOne({ 
          displayName,
          userId: { $ne: req.userId } // Exclude current user
        });
        if (existingDisplayName) {
          logger.warn('Update preferences failed: Display name already exists', {
            userId: req.userId,
            displayName
          });
          return res.status(409).json({
            error: 'Conflict',
            message: 'Display name already exists'
          });
        }
      }
    }

    // If defaultDeckId is provided, verify the deck exists and belongs to user
    if (defaultDeckId !== null && defaultDeckId !== undefined) {
      const Deck = (await import('../models/Deck.js')).default;
      const deck = await Deck.findOne({ id: defaultDeckId, userId: req.userId });
      if (!deck) {
        logger.warn('Update preferences failed: Default deck not found', {
          userId: req.userId,
          defaultDeckId
        });
        return res.status(404).json({
          error: 'Not Found',
          message: 'Default deck not found or does not belong to user'
        });
      }
    }

    // Upsert preferences
    const preferences = await UserPreferences.findOneAndUpdate(
      { userId: req.userId },
      {
        $set: {
          ...(theme && { theme }),
          ...(lastOpenedDeck !== undefined && { lastOpenedDeck: lastOpenedDeck || null }),
          ...(defaultDeckId !== undefined && { defaultDeckId: defaultDeckId || null }),
          ...(screenshotMode && { screenshotMode }),
          ...(profilePictureCardId !== undefined && { profilePictureCardId }),
          ...(displayName !== undefined && { displayName: displayName || null }),
          ...(firstName !== undefined && { firstName: firstName || null }),
          ...(lastName !== undefined && { lastName: lastName || null }),
          ...(riotId !== undefined && { riotId: riotId || null })
        }
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    );

    logger.info('Preferences updated successfully', {
      userId: req.userId,
      preferencesId: preferences._id.toString()
    });

    const statusCode = preferences.dateCreated.getTime() === preferences.lastUpdated.getTime()
      ? 201
      : 200;

    res.status(statusCode).json({
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
      firstName: preferences.firstName || null,
      lastName: preferences.lastName || null,
      riotId: preferences.riotId || null,
      dateCreated: preferences.dateCreated,
      lastUpdated: preferences.lastUpdated
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/user/change-password
 * Change user password
 */
router.post('/change-password', [
  authenticate,
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one letter and one number')
], async (req, res, next) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Change password validation failed', {
        userId: req.userId,
        errors: sanitizeForLogging(errors.array())
      });
      return res.status(400).json({
        error: 'Validation Error',
        message: errors.array().map(e => e.msg).join(', ')
      });
    }

    const { currentPassword, newPassword } = req.body;

    logger.info('Password change attempt', {
      userId: req.userId
    });

    // Get user with password hash
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
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);

    if (!isCurrentPasswordValid) {
      logger.warn('Password change failed: Invalid current password', {
        userId: req.userId
      });
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const newPasswordHash = await User.hashPassword(newPassword);

    // Update password
    user.password_hash = newPasswordHash;
    await user.save();

    logger.info('Password changed successfully', {
      userId: req.userId
    });

    res.json({
      message: 'Password changed successfully'
    });
  } catch (error) {
    next(error);
  }
});

export default router;


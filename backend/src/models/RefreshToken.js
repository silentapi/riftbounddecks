import mongoose from 'mongoose';
import crypto from 'crypto';

const refreshTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: [true, 'Token is required'],
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  expiresAt: {
    type: Date,
    required: [true, 'Expiration date is required'],
    index: { expireAfterSeconds: 0 } // MongoDB TTL index to auto-delete expired tokens
  },
  dateCreated: {
    type: Date,
    default: Date.now
  },
  lastUsed: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false
});

// Generate a secure random token
refreshTokenSchema.statics.generateToken = function() {
  return crypto.randomBytes(32).toString('hex');
};

// Check if token is expired
refreshTokenSchema.methods.isExpired = function() {
  return new Date() >= this.expiresAt;
};

// Update last used timestamp
refreshTokenSchema.methods.updateLastUsed = async function() {
  this.lastUsed = new Date();
  await this.save();
};

// Indexes for performance
refreshTokenSchema.index({ userId: 1, expiresAt: 1 });
refreshTokenSchema.index({ token: 1 });

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

export default RefreshToken;


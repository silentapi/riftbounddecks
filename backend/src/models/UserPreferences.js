import mongoose from 'mongoose';

const userPreferencesSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    unique: true
  },
  theme: {
    type: String,
    enum: ['light', 'dark'],
    default: 'dark'
  },
  lastOpenedDeck: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Deck',
    default: null
  },
  defaultDeckId: {
    type: String,
    default: null
  },
  screenshotMode: {
    type: String,
    enum: ['full', 'deck'],
    default: 'full'
  },
  profilePictureCardId: {
    type: String,
    default: 'OGN-155'
  },
  displayName: {
    type: String,
    default: null,
    unique: true,
    sparse: true, // Allow multiple null values
    trim: true,
    minlength: [1, 'Display name must be at least 1 character'],
    maxlength: [50, 'Display name cannot exceed 50 characters']
  },
  dateCreated: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false,
  toJSON: {
    transform: function(doc, ret) {
      if (ret.userId) ret.userId = ret.userId.toString();
      if (ret.lastOpenedDeck) ret.lastOpenedDeck = ret.lastOpenedDeck.toString();
      if (ret._id) ret._id = ret._id.toString();
      // defaultDeckId and screenshotMode are already strings, no transformation needed
      return ret;
    }
  }
});

// Indexes
userPreferencesSchema.index({ userId: 1 }, { unique: true });
userPreferencesSchema.index({ displayName: 1 }, { unique: true, sparse: true }); // Sparse index allows multiple nulls

// Update lastUpdated before saving
userPreferencesSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

const UserPreferences = mongoose.model('UserPreferences', userPreferencesSchema);

export default UserPreferences;


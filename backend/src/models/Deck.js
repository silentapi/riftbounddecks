import mongoose from 'mongoose';

const deckSchema = new mongoose.Schema({
  id: {
    type: String,
    required: [true, 'Deck ID (UUID) is required'],
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  name: {
    type: String,
    required: [true, 'Deck name is required'],
    trim: true,
    minlength: [1, 'Deck name cannot be empty'],
    maxlength: [64, 'Deck name cannot exceed 64 characters']
  },
  cards: {
    mainDeck: {
      type: [String],
      default: [],
      validate: {
        validator: function(v) {
          return v.length <= 40;
        },
        message: 'Main deck cannot exceed 40 cards'
      }
    },
    chosenChampion: {
      type: String,
      default: null
    },
    sideDeck: {
      type: [String],
      default: [],
      validate: {
        validator: function(v) {
          return v.length <= 8;
        },
        message: 'Side deck cannot exceed 8 cards'
      }
    },
    battlefields: {
      type: [String],
      default: [],
      validate: {
        validator: function(v) {
          return v.length <= 3;
        },
        message: 'Battlefields cannot exceed 3 cards'
      }
    },
    runeACount: {
      type: Number,
      default: 6,
      min: [0, 'Rune A count cannot be negative'],
      max: [12, 'Rune A count cannot exceed 12']
    },
    runeBCount: {
      type: Number,
      default: 6,
      min: [0, 'Rune B count cannot be negative'],
      max: [12, 'Rune B count cannot exceed 12']
    },
    runeAVariantIndex: {
      type: Number,
      default: 0,
      min: [0, 'Rune A variant index cannot be negative']
    },
    runeBVariantIndex: {
      type: Number,
      default: 0,
      min: [0, 'Rune B variant index cannot be negative']
    },
    legendCard: {
      type: String,
      default: null
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  legacyUUID: {
    type: String,
    default: null,
    index: true,
    sparse: true // Only index documents that have this field
  },
  shared: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: false, // We're managing timestamps manually
  toJSON: {
    transform: function(doc, ret) {
      // Transform _id to id for consistency with frontend
      ret.id = ret.id || ret._id.toString();
      delete ret._id;
      delete ret.__v;
      if (ret.userId) ret.userId = ret.userId.toString();
      return ret;
    }
  }
});

// Compound index for userId + name (case-insensitive uniqueness per user)
deckSchema.index({ userId: 1, name: 1 }, { 
  unique: true,
  collation: { locale: 'en', strength: 2 } // Case-insensitive
});

// Index on userId for efficient queries
deckSchema.index({ userId: 1 });

// Index on id (UUID) for efficient lookups
deckSchema.index({ id: 1 });

// Update updatedAt before saving
deckSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Validate rune counts total <= 12
deckSchema.pre('save', function(next) {
  if (this.cards.runeACount + this.cards.runeBCount > 12) {
    next(new Error('Total rune count (runeACount + runeBCount) cannot exceed 12'));
  } else {
    next();
  }
});

const Deck = mongoose.model('Deck', deckSchema);

export default Deck;


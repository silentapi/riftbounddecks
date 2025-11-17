import mongoose from 'mongoose';
import crypto from 'crypto';

const registrationKeySchema = new mongoose.Schema({
  key: {
    type: String,
    required: [true, 'Registration key is required'],
    unique: true,
    default: () => crypto.randomBytes(16).toString('hex')
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Owner ID is required']
  },
  maxUses: {
    type: Number,
    default: 3,
    min: -1 // -1 means unlimited (master key)
  },
  currentUses: {
    type: Number,
    default: 0,
    min: 0
  },
  isMasterKey: {
    type: Boolean,
    default: false
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
      if (ret.ownerId) ret.ownerId = ret.ownerId.toString();
      if (ret._id) ret._id = ret._id.toString();
      return ret;
    }
  }
});

// Indexes
registrationKeySchema.index({ key: 1 }, { unique: true });
registrationKeySchema.index({ ownerId: 1 });

// Update lastUpdated before saving
registrationKeySchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

// Method to check if key can be used
registrationKeySchema.methods.canBeUsed = function() {
  if (this.isMasterKey) return true;
  if (this.maxUses === -1) return true;
  return this.currentUses < this.maxUses;
};

// Method to increment usage
registrationKeySchema.methods.incrementUsage = async function() {
  if (!this.isMasterKey && this.maxUses !== -1) {
    this.currentUses += 1;
    await this.save();
  }
};

const RegistrationKey = mongoose.model('RegistrationKey', registrationKeySchema);

export default RegistrationKey;


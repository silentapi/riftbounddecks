import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [50, 'Username cannot exceed 50 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
  },
  password_hash: {
    type: String,
    required: [true, 'Password hash is required'],
    select: false // Don't return password hash by default
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
  timestamps: false, // We're managing timestamps manually
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password_hash;
      ret._id = ret._id.toString();
      return ret;
    }
  }
});

// Indexes
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true });

// Update lastUpdated before saving
userSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password_hash);
};

// Static method to hash password
userSchema.statics.hashPassword = async function(password) {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

const User = mongoose.model('User', userSchema);

export default User;


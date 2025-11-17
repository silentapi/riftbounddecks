import mongoose from 'mongoose';

const registrationUsageSchema = new mongoose.Schema({
  registrationKeyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RegistrationKey',
    required: [true, 'Registration key ID is required']
  },
  registeredUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Registered user ID is required']
  },
  dateCreated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false,
  toJSON: {
    transform: function(doc, ret) {
      if (ret.registrationKeyId) ret.registrationKeyId = ret.registrationKeyId.toString();
      if (ret.registeredUserId) ret.registeredUserId = ret.registeredUserId.toString();
      if (ret._id) ret._id = ret._id.toString();
      return ret;
    }
  }
});

// Indexes
registrationUsageSchema.index({ registrationKeyId: 1 });
registrationUsageSchema.index({ registeredUserId: 1 });

const RegistrationUsage = mongoose.model('RegistrationUsage', registrationUsageSchema);

export default RegistrationUsage;


const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');

const schema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6, select: false },
  phone:    { type: String, default: '' },
  location: { type: String, default: '' },
  sectors:  { type: [String], default: ['shop'] },
  avatar:   { type: String, default: null },
  // Password reset
  resetToken:       { type: String, default: null, select: false },
  resetTokenExpiry: { type: Date,   default: null, select: false },
  // Push notifications
  pushSubscription: { type: Object, default: null },
  // Phone verification
  phoneVerified:    { type: Boolean, default: false },
  otpHash:          { type: String,  default: null, select: false },
  otpExpiry:        { type: Date,    default: null, select: false },
  otpAttempts:      { type: Number,  default: 0 },

  // Multi-user: if set, this user is staff linked to an owner's business
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  role:       { type: String, enum: ['owner','staff'], default: 'owner' },
  lastLoginAt: { type: Date, default: null },
}, { timestamps: true });

schema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

schema.methods.comparePassword = function(candidate) {
  return bcrypt.compare(candidate, this.password);
};

schema.methods.createResetToken = function() {
  const raw   = crypto.randomBytes(32).toString('hex');
  this.resetToken       = crypto.createHash('sha256').update(raw).digest('hex');
  this.resetTokenExpiry = Date.now() + 30 * 60 * 1000; // 30 min
  return raw; // send this in the email
};

schema.set('toJSON', { transform(_, ret) { delete ret.password; return ret; } });

module.exports = mongoose.model('User', schema);

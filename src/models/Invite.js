const mongoose = require('mongoose');
const crypto   = require('crypto');

const inviteSchema = new mongoose.Schema({
  ownerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  email:     { type: String, required: true, lowercase: true, trim: true },
  token:     { type: String, required: true, unique: true },
  status:    { type: String, enum: ['pending','accepted','revoked'], default: 'pending' },
  staffId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, // 7 days
}, { timestamps: true });

module.exports = mongoose.model('Invite', inviteSchema);

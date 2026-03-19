const mongoose = require('mongoose');

// One document per user — stores ALL their app data as JSON
// Simple, flexible, easy to sync. Upgrade to separate collections later if needed.
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  // Each field mirrors a localStorage key from the app
  inventory:   { type: Array,  default: [] },
  shopSales:   { type: Array,  default: [] },
  farmExpenses:{ type: Array,  default: [] },
  salesFields: { type: Object, default: null },
  salesEntries:{ type: Array,  default: [] },
  debtRecords: { type: Array,  default: [] },
  settings:    { type: Object, default: {} }, // darkMode, sector, etc.
  syncedAt:    { type: Date,   default: null },
}, { timestamps: true });

module.exports = mongoose.model('UserData', schema);

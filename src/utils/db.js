const mongoose = require('mongoose');
let connected = false;

module.exports = async function connectDB() {
  if (connected) return;
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  connected = true;
  console.log('🍃  MongoDB connected');
  mongoose.connection.on('disconnected', () => { connected = false; console.warn('⚠️  MongoDB disconnected'); });
};

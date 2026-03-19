require('dotenv').config();
const express = require('express');
const app = express();

const PORT = process.env.PORT || 5000;

// Absolute minimal health check
app.get('/', (req, res) => res.send('OK'));
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log('ENV PORT:', process.env.PORT);
  console.log('MONGODB_URI set:', !!process.env.MONGODB_URI);
  console.log('JWT_SECRET set:', !!process.env.JWT_SECRET);
  
  // Connect DB after server is up
  if (process.env.MONGODB_URI) {
    const mongoose = require('mongoose');
    mongoose.connect(process.env.MONGODB_URI)
      .then(() => console.log('MongoDB connected'))
      .catch(e => console.error('MongoDB error:', e.message));
  } else {
    console.warn('MONGODB_URI not set - skipping DB connection');
  }
});

process.on('unhandledRejection', err => console.error('Unhandled:', err.message));
process.on('uncaughtException', err => console.error('Uncaught:', err.message));

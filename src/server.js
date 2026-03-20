require('dotenv').config();
const express = require('express');
const app = express();
const PORT = process.env.PORT || 5000;

// ── CORS — must be FIRST before anything else ──
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Health
app.get('/',       (_, res) => res.json({ status: 'ok', app: 'Record Chief API' }));
app.get('/health', (_, res) => res.status(200).json({ status: 'ok' }));

// Routes
try {
  const authRoutes = require('./routes/auth');
  const dataRoutes = require('./routes/data');
  const pushRoutes = require('./routes/push');
  const rateLimit  = require('express-rate-limit');
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/data', dataRoutes);
  app.use('/api/push', pushRoutes);
} catch(e) {
  console.error('Route load error:', e.message);
}

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.status || 500).json({ error: err.message || 'Server error.' });
});

// Start server first, then connect DB
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Record Chief API running on port ${PORT}`);
  console.log('MONGODB_URI set:', !!process.env.MONGODB_URI);
  console.log('JWT_SECRET set:', !!process.env.JWT_SECRET);

  if (process.env.MONGODB_URI) {
    const mongoose = require('mongoose');
    mongoose.connect(process.env.MONGODB_URI)
      .then(() => {
        console.log('🍃 MongoDB connected');
        try {
          const { startReminderJob } = require('./utils/reminderJob');
          startReminderJob();
        } catch(e) { console.log('Reminder job skipped:', e.message); }
      })
      .catch(e => console.error('MongoDB error:', e.message));
  }
});

process.on('unhandledRejection', err => console.error('Unhandled:', err.message));
process.on('uncaughtException',  err => console.error('Uncaught:',  err.message));

require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();

// ── CORS ──────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(helmet({ crossOriginResourcePolicy: false }));

// ── Rate limiting ──────────────────────────────
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

// ── Parsing ────────────────────────────────────
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// ── Health ─────────────────────────────────────
app.get('/',       (_, res) => res.json({ status: 'ok', app: 'Record Chief API', version: '2.0' }));
app.get('/health', (_, res) => res.status(200).json({ status: 'ok', time: new Date() }));
app.get('/debug',  (_, res) => res.json({ routes: ['auth','data','push','invite','otp'], env: { mongo: !!process.env.MONGODB_URI, jwt: !!process.env.JWT_SECRET, email: !!process.env.EMAIL_USER } }));

// ── Routes — loaded directly (no try/catch hiding errors) ──
const authRoutes   = require('./routes/auth');
const dataRoutes   = require('./routes/data');
const pushRoutes   = require('./routes/push');
const inviteRoutes = require('./routes/invite');
const otpRoutes    = require('./routes/otp');

app.use('/api/auth',   authLimiter, authRoutes);
app.use('/api/data',   dataRoutes);
app.use('/api/push',   pushRoutes);
app.use('/api/invite', inviteRoutes);
app.use('/api/otp',    otpRoutes);

// ── 404 ────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));

// ── Error handler ──────────────────────────────
app.use((err, req, res, next) => {
  console.error('App error:', err.stack || err.message);
  res.status(err.status || 500).json({ error: err.message || 'Server error.' });
});

module.exports = app;

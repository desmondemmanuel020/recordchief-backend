require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');

const app = express();

// ── Security ──────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',') : '*',
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  message: { error: 'Too many attempts, try again later.' }
});

// ── Parsing ───────────────────────────────────
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// ── Health checks (respond BEFORE routes so Railway passes) ──
app.get('/', (_, res) => {
  res.json({ status: 'ok', app: 'Record Chief API', timestamp: new Date() });
});
app.get('/health', (_, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// ── Routes ────────────────────────────────────
try {
  const authRoutes = require('./routes/auth');
  const dataRoutes = require('./routes/data');
  const pushRoutes = require('./routes/push');

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/data', dataRoutes);
  app.use('/api/push', pushRoutes);
} catch(e) {
  console.error('Route loading error:', e.message);
}

// ── 404 ───────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));

// ── Error handler ─────────────────────────────
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong.' });
});

module.exports = app;

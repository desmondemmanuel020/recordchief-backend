require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();

// ── CORS — allow ALL origins for now (tighten after testing) ──
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: false,
}));
app.options('*', cors()); // handle preflight

// ── Security ──────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: false }));

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

// ── Health (must be before auth middleware) ───
app.get('/',       (_, res) => res.json({ status: 'ok', app: 'Record Chief API' }));
app.get('/health', (_, res) => res.status(200).json({ status: 'ok', time: new Date() }));

// ── Routes ────────────────────────────────────
try {
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
} catch(e) {
  console.error('Route load error:', e.message);
}

// ── 404 ───────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

// ── Error handler ─────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.status || 500).json({ error: err.message || 'Server error.' });
});

module.exports = app;

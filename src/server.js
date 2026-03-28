require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const mongoose  = require('mongoose');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const crypto    = require('crypto');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── CORS ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json({ limit: '5mb' }));

// ── HEALTH ────────────────────────────────────────────────────────
app.get('/',       (_, res) => res.json({ status: 'ok', app: 'Record Chief API v2' }));
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// ── MODELS ────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  email:         { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:      { type: String, required: true, minlength: 6, select: false },
  phone:         { type: String, default: '' },
  location:      { type: String, default: '' },
  sectors:       { type: [String], default: ['shop'] },
  avatar:        { type: String, default: null },
  emailVerified: { type: Boolean, default: false },
  otpHash:       { type: String, default: null, select: false },
  otpExpiry:     { type: Date,   default: null, select: false },
  otpAttempts:   { type: Number, default: 0 },
  resetToken:    { type: String, default: null, select: false },
  resetTokenExpiry: { type: Date, default: null, select: false },
  pushSubscription: { type: Object, default: null },
  businessId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  role:          { type: String, enum: ['owner','staff'], default: 'owner' },
  lastLoginAt:   { type: Date, default: null },
}, { timestamps: true });
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
userSchema.methods.comparePassword = function(c) { return bcrypt.compare(c, this.password); };
userSchema.set('toJSON', { transform(_, ret) { delete ret.password; return ret; } });
const User = mongoose.model('User', userSchema);

const dataSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  inventory:    { type: Array,  default: [] },
  shopSales:    { type: Array,  default: [] },
  farmExpenses: { type: Array,  default: [] },
  salesFields:  { type: Object, default: null },
  salesEntries: { type: Array,  default: [] },
  debtRecords:  { type: Array,  default: [] },
  settings:     { type: Object, default: {} },
  syncedAt:     { type: Date,   default: null },
}, { timestamps: true });
const UserData = mongoose.model('UserData', dataSchema);

const inviteSchema = new mongoose.Schema({
  ownerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  email:     { type: String, required: true, lowercase: true, trim: true },
  token:     { type: String, required: true, unique: true },
  status:    { type: String, enum: ['pending','accepted','revoked'], default: 'pending' },
  staffId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7*24*60*60*1000) },
}, { timestamps: true });
const Invite = mongoose.model('Invite', inviteSchema);

// ── HELPERS ───────────────────────────────────────────────────────
const signToken = id => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
const verifyToken = tok => jwt.verify(tok, process.env.JWT_SECRET);
const hashOTP = otp => crypto.createHash('sha256').update(otp).digest('hex');
const genOTP  = () => Math.floor(100000 + Math.random() * 900000).toString();

function getMailer() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST, port: Number(process.env.EMAIL_PORT) || 587,
    secure: false, auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

async function sendMail(to, subject, html) {
  if (!process.env.EMAIL_HOST) { console.log('Email skipped (no config)'); return; }
  await getMailer().sendMail({ from: process.env.EMAIL_FROM || 'Record Chief <noreply@recordchief.app>', to, subject, html });
}

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────
async function protect(req, res, next) {
  try {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated.' });
    const decoded = verifyToken(h.split(' ')[1]);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ error: 'User not found.' });
    next();
  } catch(e) {
    res.status(401).json({ error: e.name === 'TokenExpiredError' ? 'Session expired.' : 'Invalid token.' });
  }
}

const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20 });
const otpLimiter  = rateLimit({ windowMs: 10*60*1000, max: 5, keyGenerator: req => req.user?._id?.toString() || req.ip });

// ══════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ══════════════════════════════════════════════════════════════════
app.post('/api/auth/signup', authLimiter, async (req, res) => {
  try {
    const { name, email, password, phone, location, sectors } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (await User.findOne({ email: email.toLowerCase() })) return res.status(400).json({ error: 'An account with this email already exists.' });
    const user  = await User.create({ name: name.trim(), email, password, phone, location, sectors: sectors || ['shop'] });
    const token = signToken(user._id);
    sendMail(user.email, 'Welcome to Record Chief 📒', `<p>Hi ${user.name}, welcome to Record Chief! <a href="${process.env.CLIENT_URL}">Open the app</a></p>`).catch(()=>{});
    res.status(201).json({ token, user });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.comparePassword(password))) return res.status(401).json({ error: 'Incorrect email or password.' });
    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });
    res.json({ token: signToken(user._id), user });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', protect, (req, res) => res.json({ user: req.user }));

app.patch('/api/auth/profile', protect, async (req, res) => {
  try {
    const allowed = ['name','phone','location','sectors','avatar'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    if (updates.avatar && updates.avatar.length > 3_600_000) return res.status(400).json({ error: 'Avatar too large.' });
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json({ user });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/auth/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required.' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be 6+ characters.' });
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(currentPassword))) return res.status(401).json({ error: 'Current password is wrong.' });
    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password updated.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase() });
    if (!user) return res.json({ message: 'If an account exists, a reset email has been sent.' });
    const raw    = crypto.randomBytes(32).toString('hex');
    const hashed = crypto.createHash('sha256').update(raw).digest('hex');
    await User.findByIdAndUpdate(user._id, { resetToken: hashed, resetTokenExpiry: Date.now() + 30*60*1000 });
    const url = `${process.env.CLIENT_URL}/reset-password?token=${raw}`;
    await sendMail(user.email, 'Reset your Record Chief password', `<p>Hi ${user.name},</p><p><a href="${url}">Click here to reset your password</a>. Expires in 30 minutes.</p>`);
    res.json({ message: 'Password reset email sent.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password required.' });
    const hashed = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({ resetToken: hashed, resetTokenExpiry: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ error: 'Reset link is invalid or expired.' });
    user.password = password;
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();
    res.json({ token: signToken(user._id), user, message: 'Password reset successfully.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/auth/account', protect, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || email.toLowerCase() !== req.user.email.toLowerCase()) return res.status(400).json({ error: 'Email does not match your account.' });
    const uid = req.user._id;
    await Promise.all([
      UserData.deleteOne({ userId: uid }),
      Invite.deleteMany({ ownerId: uid }),
      Invite.updateMany({ staffId: uid }, { staffId: null, status: 'revoked' }),
      User.updateMany({ businessId: uid }, { businessId: null, role: 'owner' }),
      User.findByIdAndDelete(uid),
    ]);
    res.json({ message: 'Account deleted.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// DATA SYNC ROUTES
// ══════════════════════════════════════════════════════════════════
app.get('/api/data', protect, async (req, res) => {
  try {
    const targetId = req.user.businessId || req.user._id;
    const data = await UserData.findOne({ userId: targetId });
    res.json({ data: data || null, syncedAt: data?.syncedAt || null, role: req.user.role });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/data', protect, async (req, res) => {
  try {
    const { inventory, shopSales, farmExpenses, salesFields, salesEntries, debtRecords, settings } = req.body;
    const targetId = req.user.businessId || req.user._id;
    const data = await UserData.findOneAndUpdate(
      { userId: targetId },
      { $set: { ...(inventory !== undefined && { inventory }), ...(shopSales !== undefined && { shopSales }), ...(farmExpenses !== undefined && { farmExpenses }), ...(salesFields !== undefined && { salesFields }), ...(salesEntries !== undefined && { salesEntries }), ...(debtRecords !== undefined && { debtRecords }), ...(settings !== undefined && { settings }), syncedAt: new Date() } },
      { upsert: true, new: true }
    );
    res.json({ data, syncedAt: data.syncedAt });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/data/:section', protect, async (req, res) => {
  try {
    const allowed = ['inventory','shopSales','farmExpenses','salesFields','salesEntries','debtRecords','settings'];
    const { section } = req.params;
    if (!allowed.includes(section)) return res.status(400).json({ error: 'Invalid section.' });
    const targetId = req.user.businessId || req.user._id;
    const data = await UserData.findOneAndUpdate(
      { userId: targetId },
      { $set: { [section]: req.body[section], syncedAt: new Date() } },
      { upsert: true, new: true }
    );
    res.json({ [section]: data[section], syncedAt: data.syncedAt });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// OTP / EMAIL VERIFICATION ROUTES
// ══════════════════════════════════════════════════════════════════
app.post('/api/otp/send', protect, otpLimiter, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.emailVerified) return res.status(400).json({ error: 'Your email is already verified.' });
    const otp = genOTP();
    await User.findByIdAndUpdate(user._id, { otpHash: hashOTP(otp), otpExpiry: new Date(Date.now() + 10*60*1000), otpAttempts: 0 });
    try {
      await sendMail(user.email, 'Your Record Chief verification code', `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
          <h2 style="color:#2563EB">📒 Record Chief</h2>
          <p>Hi ${user.name}, your email verification code is:</p>
          <div style="text-align:center;margin:28px 0">
            <span style="font-size:42px;font-weight:900;font-family:monospace;letter-spacing:12px;color:#1E3A8A;background:#EFF6FF;padding:16px 24px;border-radius:12px">${otp}</span>
          </div>
          <p style="color:#64748B;font-size:13px">This code expires in <strong>10 minutes</strong>. Do not share it.</p>
        </div>
      `);
    } catch(emailErr) {
      return res.status(503).json({ error: 'Could not send email. Check your email settings in Railway variables.' });
    }
    res.json({ message: `Verification code sent to ${user.email}. Check your inbox.` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/otp/verify', protect, async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ error: 'Code is required.' });
    const user = await User.findById(req.user._id).select('+otpHash +otpExpiry +otpAttempts');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (!user.otpHash) return res.status(400).json({ error: 'No code was requested. Please request a new one.' });
    if (user.otpExpiry < Date.now()) return res.status(400).json({ error: 'Code has expired. Please request a new one.' });
    if (user.otpAttempts >= 5) return res.status(400).json({ error: 'Too many incorrect attempts. Request a new code.' });
    if (hashOTP(otp.trim()) !== user.otpHash) {
      await User.findByIdAndUpdate(user._id, { $inc: { otpAttempts: 1 } });
      const left = 5 - (user.otpAttempts + 1);
      return res.status(400).json({ error: `Incorrect code. ${left} attempt${left !== 1 ? 's' : ''} remaining.` });
    }
    const updated = await User.findByIdAndUpdate(user._id, { emailVerified: true, otpHash: null, otpExpiry: null, otpAttempts: 0 }, { new: true });
    res.json({ message: 'Email verified! ✅', user: updated });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/otp/status', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ emailVerified: user?.emailVerified || false, email: user?.email });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// STAFF INVITE ROUTES
// ══════════════════════════════════════════════════════════════════
app.get('/api/invite', protect, async (req, res) => {
  try {
    const invites = await Invite.find({ ownerId: req.user._id }).sort({ createdAt: -1 });
    const enriched = await Promise.all(invites.map(async inv => {
      const obj = inv.toObject();
      if (inv.staffId) {
        const staff = await User.findById(inv.staffId).select('name email');
        obj.staffName = staff?.name || ''; obj.staffEmail = staff?.email || '';
      }
      return obj;
    }));
    res.json({ invites: enriched });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/invite', protect, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    if (req.user.role === 'staff') return res.status(403).json({ error: 'Only the business owner can invite staff.' });
    const existing = await Invite.findOne({ ownerId: req.user._id, email: email.toLowerCase(), status: 'pending' });
    if (existing) return res.status(400).json({ error: 'An invite has already been sent to this email.' });
    const token  = crypto.randomBytes(32).toString('hex');
    const invite = await Invite.create({ ownerId: req.user._id, email: email.toLowerCase(), token });
    const inviteURL = `${process.env.CLIENT_URL || 'https://record-chief.vercel.app'}?invite=${token}`;
    sendMail(email, `${req.user.name} invited you to Record Chief`, `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
        <h2 style="color:#2563EB">📒 Record Chief</h2>
        <p><strong>${req.user.name}</strong> has invited you to manage their business records.</p>
        <a href="${inviteURL}" style="display:inline-block;margin:20px 0;padding:14px 28px;background:#2563EB;color:#fff;border-radius:10px;text-decoration:none;font-weight:700">Accept Invitation</a>
        <p style="color:#64748B;font-size:13px">This link expires in 7 days.</p>
      </div>
    `).catch(()=>{});
    res.status(201).json({ invite, inviteURL, message: 'Invite sent!' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/invite/accept', protect, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Invite token required.' });
    const invite = await Invite.findOne({ token, status: 'pending' });
    if (!invite) return res.status(404).json({ error: 'Invalid or expired invite.' });
    if (invite.expiresAt < new Date()) return res.status(400).json({ error: 'Invite has expired.' });
    await User.findByIdAndUpdate(req.user._id, { businessId: invite.ownerId, role: 'staff' });
    await Invite.findByIdAndUpdate(invite._id, { status: 'accepted', staffId: req.user._id });
    const ownerData = await UserData.findOne({ userId: invite.ownerId });
    res.json({ message: 'You now have access to the business records.', ownerData: ownerData || null });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/invite/:id', protect, async (req, res) => {
  try {
    const invite = await Invite.findOne({ _id: req.params.id, ownerId: req.user._id });
    if (!invite) return res.status(404).json({ error: 'Invite not found.' });
    if (invite.staffId) await User.findByIdAndUpdate(invite.staffId, { businessId: null, role: 'owner' });
    await Invite.findByIdAndUpdate(invite._id, { status: 'revoked' });
    res.json({ message: 'Access revoked.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// PUSH NOTIFICATION ROUTES
// ══════════════════════════════════════════════════════════════════
app.get('/api/push/vapid-key', protect, (req, res) => res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null }));
app.post('/api/push/subscribe', protect, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { pushSubscription: req.body.subscription });
    res.json({ message: 'Subscribed.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── 404 ───────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));
app.use((err, req, res, next) => { console.error(err.message); res.status(500).json({ error: err.message }); });

// ══════════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════════
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Record Chief API on port ${PORT}`);
  if (process.env.MONGODB_URI) {
    mongoose.connect(process.env.MONGODB_URI)
      .then(() => console.log('🍃 MongoDB connected'))
      .catch(e => console.error('MongoDB error:', e.message));
  } else {
    console.warn('⚠️ MONGODB_URI not set');
  }
});
process.on('unhandledRejection', e => console.error('Unhandled:', e.message));

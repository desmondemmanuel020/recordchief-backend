const router = require('express').Router();
const crypto = require('crypto');
const User   = require('../models/User');
const { protect }          = require('../middleware/auth');
const { sign }             = require('../utils/jwt');
const { sendPasswordReset, sendWelcome } = require('../utils/email');

// POST /api/auth/signup
router.post('/signup', async (req, res, next) => {
  try {
    const { name, email, password, phone, location, sectors } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
    if (password.length < 6)          return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (await User.findOne({ email: email.toLowerCase() }))
      return res.status(400).json({ error: 'An account with this email already exists.' });

    const user  = await User.create({ name: name.trim(), email, password, phone, location, sectors: sectors || ['shop'] });
    const token = sign(user._id);

    // Send welcome email (non-blocking)
    sendWelcome(user.email, user.name).catch(() => {});

    res.status(201).json({ token, user });
  } catch (err) { next(err); }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ error: 'Incorrect email or password.' });

    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    res.json({ token: sign(user._id), user });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get('/me', protect, (req, res) => res.json({ user: req.user }));

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase() });
    // Always respond OK so we don't reveal whether email exists
    if (!user) return res.json({ message: 'If an account exists, a reset email has been sent.' });

    const raw = user.createResetToken();
    await user.save({ validateBeforeSave: false });

    const resetURL = `${process.env.CLIENT_URL}/reset-password?token=${raw}`;
    await sendPasswordReset(user.email, user.name, resetURL);

    res.json({ message: 'Password reset email sent.' });
  } catch (err) { next(err); }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and new password required.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const hashed = crypto.createHash('sha256').update(token).digest('hex');
    const user   = await User.findOne({ resetToken: hashed, resetTokenExpiry: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ error: 'Reset link is invalid or has expired.' });

    user.password         = password;
    user.resetToken       = null;
    user.resetTokenExpiry = null;
    await user.save();

    res.json({ token: sign(user._id), user, message: 'Password reset successfully.' });
  } catch (err) { next(err); }
});

// PATCH /api/auth/profile
router.patch('/profile', protect, async (req, res, next) => {
  try {
    const allowed = ['name', 'phone', 'location', 'sectors', 'avatar'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    if (updates.avatar && updates.avatar.length > 3_600_000)
      return res.status(400).json({ error: 'Avatar must be under 2MB.' });
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json({ user });
  } catch (err) { next(err); }
});

// PATCH /api/auth/change-password
router.patch('/change-password', protect, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required.' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be 6+ characters.' });
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(currentPassword))) return res.status(401).json({ error: 'Current password is wrong.' });
    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password updated.' });
  } catch (err) { next(err); }
});

module.exports = router;

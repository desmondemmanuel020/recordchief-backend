const router    = require('express').Router();
const rateLimit = require('express-rate-limit');
const User      = require('../models/User');
const { protect }                   = require('../middleware/auth');
const { generateOTP, hashOTP, sendOTPviaEmail } = require('../utils/otp');

// Max 3 OTP requests per 10 minutes per user
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, max: 3,
  message: { error: 'Too many requests. Please wait 10 minutes before trying again.' },
  keyGenerator: req => req.user?._id?.toString() || req.ip,
});

// POST /api/otp/send — send verification code to user's email
router.post('/send', protect, otpLimiter, async (req, res, next) => {
  try {
    const user = req.user;

    if (user.emailVerified) {
      return res.status(400).json({ error: 'Your email is already verified.' });
    }

    const otp    = generateOTP();
    const hashed = hashOTP(otp);
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await User.findByIdAndUpdate(user._id, {
      otpHash: hashed, otpExpiry: expiry, otpAttempts: 0,
    });

    await sendOTPviaEmail(user.email, user.name, otp);

    res.json({
      message: `Verification code sent to ${user.email}.`,
      expiresIn: 600,
    });
  } catch(err) { next(err); }
});

// POST /api/otp/verify — verify the code
router.post('/verify', protect, async (req, res, next) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ error: 'Code is required.' });

    const user = await User.findById(req.user._id).select('+otpHash +otpExpiry +otpAttempts');

    if (!user.otpHash)          return res.status(400).json({ error: 'No code was requested. Please request a new one.' });
    if (user.otpExpiry < Date.now()) return res.status(400).json({ error: 'Code has expired. Please request a new one.' });
    if (user.otpAttempts >= 5)  return res.status(400).json({ error: 'Too many incorrect attempts. Request a new code.' });

    if (hashOTP(otp.trim()) !== user.otpHash) {
      await User.findByIdAndUpdate(user._id, { $inc: { otpAttempts: 1 } });
      const left = 5 - (user.otpAttempts + 1);
      return res.status(400).json({ error: `Incorrect code. ${left} attempt${left !== 1 ? 's' : ''} remaining.` });
    }

    // Correct — mark email verified
    const updated = await User.findByIdAndUpdate(user._id, {
      emailVerified: true, otpHash: null, otpExpiry: null, otpAttempts: 0,
    }, { new: true });

    res.json({ message: 'Email verified successfully! ✅', user: updated });
  } catch(err) { next(err); }
});

// GET /api/otp/status
router.get('/status', protect, (req, res) => {
  res.json({ emailVerified: req.user.emailVerified || false, email: req.user.email });
});

module.exports = router;

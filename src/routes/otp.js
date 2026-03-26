const router  = require('express').Router();
const rateLimit = require('express-rate-limit');
const User    = require('../models/User');
const { protect }                            = require('../middleware/auth');
const { generateOTP, hashOTP, sendOTPviaSMS, sendOTPviaWhatsApp } = require('../utils/otp');

// Rate limit — max 3 OTP requests per phone per 10 minutes
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, max: 3,
  message: { error: 'Too many OTP requests. Please wait 10 minutes.' },
  keyGenerator: req => req.body.phone || req.ip,
});

// POST /api/otp/send — send OTP to user's phone
router.post('/send', protect, otpLimiter, async (req, res, next) => {
  try {
    const { channel = 'sms' } = req.body; // 'sms' or 'whatsapp'
    const user = req.user;

    if (!user.phone) {
      return res.status(400).json({ error: 'No phone number on your account. Please update your profile first.' });
    }
    if (user.phoneVerified) {
      return res.status(400).json({ error: 'Your phone number is already verified.' });
    }

    const otp    = generateOTP();
    const hashed = hashOTP(otp);
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save hashed OTP and expiry
    await User.findByIdAndUpdate(user._id, {
      otpHash: hashed,
      otpExpiry: expiry,
      otpAttempts: 0,
    });

    // Send via chosen channel
    if (channel === 'whatsapp') {
      await sendOTPviaWhatsApp(user.phone, otp);
    } else {
      await sendOTPviaSMS(user.phone, otp);
    }

    res.json({
      message: `Verification code sent to ${user.phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1****$3')} via ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}.`,
      expiresIn: 600, // seconds
    });
  } catch (err) {
    // If Termii not configured, return helpful error
    if (err.message.includes('TERMII_API_KEY')) {
      return res.status(503).json({ error: 'SMS service not configured. Contact support.' });
    }
    next(err);
  }
});

// POST /api/otp/verify — verify the OTP
router.post('/verify', protect, async (req, res, next) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ error: 'OTP is required.' });

    const user = await User.findById(req.user._id).select('+otpHash +otpExpiry +otpAttempts');

    if (!user.otpHash) {
      return res.status(400).json({ error: 'No OTP was requested. Please request a new one.' });
    }
    if (user.otpExpiry < new Date()) {
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }
    if (user.otpAttempts >= 5) {
      return res.status(400).json({ error: 'Too many incorrect attempts. Please request a new OTP.' });
    }

    const hashed = hashOTP(otp.trim());
    if (hashed !== user.otpHash) {
      await User.findByIdAndUpdate(user._id, { $inc: { otpAttempts: 1 } });
      const remaining = 5 - (user.otpAttempts + 1);
      return res.status(400).json({ error: `Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` });
    }

    // OTP correct — mark phone as verified, clear OTP
    const updated = await User.findByIdAndUpdate(user._id, {
      phoneVerified: true,
      otpHash: null,
      otpExpiry: null,
      otpAttempts: 0,
    }, { new: true });

    res.json({ message: 'Phone number verified successfully! ✅', user: updated });
  } catch (err) { next(err); }
});

// GET /api/otp/status — check if phone is verified
router.get('/status', protect, (req, res) => {
  res.json({
    phoneVerified: req.user.phoneVerified || false,
    phone: req.user.phone || null,
  });
});

module.exports = router;

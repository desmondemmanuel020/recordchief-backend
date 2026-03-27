const router   = require('express').Router();
const crypto   = require('crypto');
const User     = require('../models/User');
const Invite   = require('../models/Invite');
const UserData = require('../models/Data');
const { protect }    = require('../middleware/auth');
const { sign }       = require('../utils/jwt');
const { sendInvite } = require('../utils/email');

// ── Public route: validate invite token (no auth needed) ──
router.get('/validate/:token', async (req, res, next) => {
  try {
    const invite = await Invite.findOne({ token: req.params.token, status: 'pending' });
    if (!invite)              return res.status(404).json({ error: 'Invite link is invalid or has already been used.' });
    if (invite.expiresAt < new Date()) {
      await Invite.findByIdAndUpdate(invite._id, { status: 'revoked' });
      return res.status(400).json({ error: 'This invite link has expired. Ask the owner to send a new one.' });
    }
    const owner = await User.findById(invite.ownerId).select('name email');
    res.json({ valid: true, email: invite.email, ownerName: owner?.name, ownerEmail: owner?.email });
  } catch(err) { next(err); }
});

// ── All routes below require authentication ──
router.use(protect);

// GET /api/invite — list all staff invited by this owner
router.get('/', async (req, res, next) => {
  try {
    const invites = await Invite.find({ ownerId: req.user._id }).sort({ createdAt: -1 });
    const enriched = await Promise.all(invites.map(async inv => {
      const obj = inv.toObject();
      if (inv.staffId) {
        const staff = await User.findById(inv.staffId).select('name email');
        obj.staffName = staff?.name || '';
        obj.staffEmail = staff?.email || '';
      }
      return obj;
    }));
    res.json({ invites: enriched });
  } catch(err) { next(err); }
});

// POST /api/invite — send invite to an email
router.post('/', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    if (req.user.role === 'staff') return res.status(403).json({ error: 'Only the business owner can invite staff.' });

    const existing = await Invite.findOne({ ownerId: req.user._id, email: email.toLowerCase(), status: 'pending' });
    if (existing) return res.status(400).json({ error: 'An invite has already been sent to this email.' });

    const token  = crypto.randomBytes(32).toString('hex');
    const invite = await Invite.create({ ownerId: req.user._id, email: email.toLowerCase(), token });
    const inviteURL = `${process.env.CLIENT_URL}?invite=${token}`;

    sendInvite(email, req.user.name, inviteURL).catch(() => {});

    res.status(201).json({ invite, inviteURL, message: 'Invite sent!' });
  } catch(err) { next(err); }
});

// POST /api/invite/accept — accept an invite (staff must be logged in)
router.post('/accept', async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Invite token required.' });

    const invite = await Invite.findOne({ token, status: 'pending' });
    if (!invite)              return res.status(404).json({ error: 'Invalid or expired invite.' });
    if (invite.expiresAt < new Date()) return res.status(400).json({ error: 'Invite has expired.' });

    await User.findByIdAndUpdate(req.user._id, { businessId: invite.ownerId, role: 'staff' });
    await Invite.findByIdAndUpdate(invite._id, { status: 'accepted', staffId: req.user._id });

    const ownerData = await UserData.findOne({ userId: invite.ownerId });
    res.json({ message: 'You now have access to the business records.', ownerData: ownerData || null });
  } catch(err) { next(err); }
});

// DELETE /api/invite/:id — revoke invite or remove staff
router.delete('/:id', async (req, res, next) => {
  try {
    const invite = await Invite.findOne({ _id: req.params.id, ownerId: req.user._id });
    if (!invite) return res.status(404).json({ error: 'Invite not found.' });
    if (invite.staffId) {
      await User.findByIdAndUpdate(invite.staffId, { businessId: null, role: 'owner' });
    }
    await Invite.findByIdAndUpdate(invite._id, { status: 'revoked' });
    res.json({ message: 'Access revoked.' });
  } catch(err) { next(err); }
});

module.exports = router;

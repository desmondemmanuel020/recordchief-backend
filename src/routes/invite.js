const router  = require('express').Router();
const crypto  = require('crypto');
const User    = require('../models/User');
const Invite  = require('../models/Invite');
const UserData = require('../models/Data');
const { protect } = require('../middleware/auth');
const { sign }    = require('../utils/jwt');
const { sendInvite } = require('../utils/email');

router.use(protect);

// GET /api/invite — get all staff invited by this owner
router.get('/', async (req, res, next) => {
  try {
    const invites = await Invite.find({ ownerId: req.user._id }).sort({ createdAt: -1 });
    // Enrich with staff name if accepted
    const enriched = await Promise.all(invites.map(async inv => {
      const obj = inv.toObject();
      if (inv.staffId) {
        const staff = await User.findById(inv.staffId).select('name email');
        obj.staffName = staff?.name || '';
      }
      return obj;
    }));
    res.json({ invites: enriched });
  } catch(err) { next(err); }
});

// POST /api/invite — owner sends invite to an email
router.post('/', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    // Only owners can invite
    if (req.user.role === 'staff') {
      return res.status(403).json({ error: 'Only the business owner can invite staff.' });
    }

    // Check not already pending
    const existing = await Invite.findOne({ ownerId: req.user._id, email: email.toLowerCase(), status: 'pending' });
    if (existing) return res.status(400).json({ error: 'An invite has already been sent to this email.' });

    // Generate unique token
    const token = crypto.randomBytes(32).toString('hex');
    const invite = await Invite.create({ ownerId: req.user._id, email, token });

    // Build invite URL
    const inviteURL = `${process.env.CLIENT_URL}?invite=${token}`;

    // Send email (non-blocking)
    sendInvite(email, req.user.name, inviteURL).catch(() => {});

    res.status(201).json({ invite, inviteURL, message: 'Invite sent!' });
  } catch(err) { next(err); }
});

// GET /api/invite/accept/:token — validate token (called before signup/login)
router.get('/accept/:token', async (req, res, next) => {
  try {
    const invite = await Invite.findOne({ token: req.params.token, status: 'pending' });
    if (!invite) return res.status(404).json({ error: 'Invite link is invalid or has expired.' });
    if (invite.expiresAt < new Date()) {
      await Invite.findByIdAndUpdate(invite._id, { status: 'revoked' });
      return res.status(400).json({ error: 'This invite link has expired. Ask the owner to send a new one.' });
    }
    const owner = await User.findById(invite.ownerId).select('name email');
    res.json({ valid: true, email: invite.email, ownerName: owner?.name, ownerEmail: owner?.email });
  } catch(err) { next(err); }
});

// POST /api/invite/accept/:token — staff accepts after signing up/logging in
router.post('/accept/:token', async (req, res, next) => {
  try {
    const invite = await Invite.findOne({ token: req.params.token, status: 'pending' });
    if (!invite) return res.status(404).json({ error: 'Invalid or expired invite.' });

    // Link staff to owner's business
    const staffUser = req.user;
    await User.findByIdAndUpdate(staffUser._id, {
      businessId: invite.ownerId,
      role: 'staff',
    });
    await Invite.findByIdAndUpdate(invite._id, { status: 'accepted', staffId: staffUser._id });

    // Return owner's data so staff can sync it
    const ownerData = await UserData.findOne({ userId: invite.ownerId });

    res.json({ message: 'You now have access to the business records.', ownerData: ownerData || null });
  } catch(err) { next(err); }
});

// DELETE /api/invite/:id — owner revokes a staff invite or removes staff
router.delete('/:id', async (req, res, next) => {
  try {
    const invite = await Invite.findOne({ _id: req.params.id, ownerId: req.user._id });
    if (!invite) return res.status(404).json({ error: 'Invite not found.' });

    // If already accepted, unlink staff
    if (invite.staffId) {
      await User.findByIdAndUpdate(invite.staffId, { businessId: null, role: 'owner' });
    }
    await Invite.findByIdAndUpdate(invite._id, { status: 'revoked' });

    res.json({ message: 'Access revoked.' });
  } catch(err) { next(err); }
});

module.exports = router;

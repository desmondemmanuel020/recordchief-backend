const router  = require('express').Router();
const webpush = require('web-push');
const User    = require('../models/User');
const { protect } = require('../middleware/auth');

router.use(protect);

// GET /api/push/vapid-key — public key for client subscription
router.get('/vapid-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

// POST /api/push/subscribe — save push subscription
router.post('/subscribe', async (req, res, next) => {
  try {
    const { subscription } = req.body;
    await User.findByIdAndUpdate(req.user._id, { pushSubscription: subscription });
    res.json({ message: 'Push subscription saved.' });
  } catch (err) { next(err); }
});

// DELETE /api/push/subscribe — unsubscribe
router.delete('/subscribe', async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { pushSubscription: null });
    res.json({ message: 'Push subscription removed.' });
  } catch (err) { next(err); }
});

// POST /api/push/test — send a test notification
router.post('/test', async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user.pushSubscription) return res.status(400).json({ error: 'No push subscription found.' });
    if (!process.env.VAPID_PUBLIC_KEY) return res.status(400).json({ error: 'Push not configured on server.' });

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@recordchief.app',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    await webpush.sendNotification(
      user.pushSubscription,
      JSON.stringify({
        title: '📒 Record Chief',
        body:  'Push notifications are working!',
        icon:  '/icons/icon-192.png',
      })
    );
    res.json({ message: 'Test notification sent.' });
  } catch (err) { next(err); }
});

module.exports = router;

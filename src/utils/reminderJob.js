const webpush = require('web-push');

function setupWebPush() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@recordchief.app',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    return true;
  }
  return false;
}

async function checkDuePayments() {
  try {
    const User     = require('../models/User');
    const UserData = require('../models/Data');
    const today    = new Date().toISOString().split('T')[0];

    const usersWithPush = await User.find({ pushSubscription: { $ne: null } });

    for (const user of usersWithPush) {
      const data = await UserData.findOne({ userId: user._id });
      if (!data?.debtRecords?.length) continue;

      const alerts = data.debtRecords.filter(r => {
        if (r.settled || r.archived || !r.dueDate) return false;
        const daysLeft   = Math.ceil((new Date(r.dueDate) - new Date()) / 86400000);
        const threshold  = parseInt(r.reminderDays ?? 1);
        return daysLeft >= 0 && daysLeft <= threshold;
      });

      const overdues = data.debtRecords.filter(r =>
        !r.settled && !r.archived && r.dueDate && r.dueDate < today
      );

      if (alerts.length === 0 && overdues.length === 0) continue;

      const totalAlerts = alerts.length + overdues.length;
      const body = overdues.length > 0
        ? `${overdues.length} record${overdues.length > 1 ? 's are' : ' is'} overdue!`
        : `${alerts.length} payment${alerts.length > 1 ? 's' : ''} due soon`;

      try {
        await webpush.sendNotification(
          user.pushSubscription,
          JSON.stringify({
            title: `🔔 Record Chief — ${totalAlerts} alert${totalAlerts > 1 ? 's' : ''}`,
            body,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-32.png',
            url: '/notifications',
          })
        );
      } catch (pushErr) {
        // Subscription expired — remove it
        if (pushErr.statusCode === 410) {
          await User.findByIdAndUpdate(user._id, { pushSubscription: null });
        }
      }
    }
  } catch (err) {
    console.error('Reminder job error:', err.message);
  }
}

function startReminderJob() {
  if (!setupWebPush()) {
    console.log('ℹ️  Push notifications disabled (VAPID keys not set)');
    return;
  }
  console.log('🔔  Due-payment reminder job started (runs every 6 hours)');
  checkDuePayments(); // run immediately on start
  setInterval(checkDuePayments, 6 * 60 * 60 * 1000); // every 6 hours
}

module.exports = { startReminderJob };

const crypto = require('crypto');

// Generate a 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Hash OTP for storage (never store raw OTP)
function hashOTP(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

// Send OTP via Termii SMS
async function sendOTPviaSMS(phone, otp) {
  const apiKey = process.env.TERMII_API_KEY;
  if (!apiKey) throw new Error('TERMII_API_KEY not configured');

  // Normalize Nigerian phone number to international format
  let normalized = phone.replace(/\s+/g, '').replace(/^0/, '234');
  if (!normalized.startsWith('234')) normalized = '234' + normalized;

  const payload = {
    to: normalized,
    from: process.env.TERMII_SENDER_ID || 'N-Alert',
    sms: `Your Record Chief verification code is: ${otp}. Valid for 10 minutes. Do not share this code.`,
    type: 'plain',
    channel: 'generic', // tries SMS first, falls back to DND routes
    api_key: apiKey,
  };

  const res = await fetch('https://api.ng.termii.com/api/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok || data.code === 'error') {
    throw new Error(data.message || 'Failed to send OTP');
  }
  return { sent: true, messageId: data.message_id };
}

// Send OTP via WhatsApp (Termii WhatsApp channel)
async function sendOTPviaWhatsApp(phone, otp) {
  const apiKey = process.env.TERMII_API_KEY;
  if (!apiKey) throw new Error('TERMII_API_KEY not configured');

  let normalized = phone.replace(/\s+/g, '').replace(/^0/, '234');
  if (!normalized.startsWith('234')) normalized = '234' + normalized;

  const payload = {
    to: normalized,
    from: 'RecordChief',
    sms: `Your Record Chief verification code is: *${otp}*\n\nValid for 10 minutes. Do not share this code.`,
    type: 'plain',
    channel: 'whatsapp',
    api_key: apiKey,
  };

  const res = await fetch('https://api.ng.termii.com/api/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to send OTP via WhatsApp');
  return { sent: true };
}

module.exports = { generateOTP, hashOTP, sendOTPviaSMS, sendOTPviaWhatsApp };

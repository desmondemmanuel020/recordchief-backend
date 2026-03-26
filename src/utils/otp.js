const crypto = require('crypto');
const { sendOTPEmail } = require('./email');

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashOTP(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

async function sendOTPviaEmail(email, name, otp) {
  await sendOTPEmail(email, name, otp);
  return { sent: true };
}

module.exports = { generateOTP, hashOTP, sendOTPviaEmail };

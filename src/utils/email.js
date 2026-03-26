const nodemailer = require('nodemailer');

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

async function sendPasswordReset(email, name, resetURL) {
  const transport = getTransport();
  await transport.sendMail({
    from: process.env.EMAIL_FROM || 'Record Chief <no-reply@recordchief.app>',
    to:   email,
    subject: 'Reset your Record Chief password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
        <h2 style="color:#2563EB">📒 Record Chief</h2>
        <p>Hi ${name},</p>
        <p>You requested a password reset. Click the button below — it expires in <strong>30 minutes</strong>.</p>
        <a href="${resetURL}" style="display:inline-block;margin:20px 0;padding:14px 28px;background:#2563EB;color:#fff;border-radius:10px;text-decoration:none;font-weight:700">
          Reset Password
        </a>
        <p style="color:#64748B;font-size:13px">If you didn't request this, ignore this email — your password is unchanged.</p>
        <hr style="border:none;border-top:1px solid #E2E8F0;margin:20px 0">
        <p style="color:#94A3B8;font-size:12px">Record Chief · Built for Nigerian businesses</p>
      </div>
    `,
  });
}

async function sendWelcome(email, name) {
  const transport = getTransport();
  await transport.sendMail({
    from: process.env.EMAIL_FROM || 'Record Chief <no-reply@recordchief.app>',
    to:   email,
    subject: 'Welcome to Record Chief! 📒',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
        <h2 style="color:#2563EB">📒 Welcome to Record Chief, ${name}!</h2>
        <p>Your account is set up. Start tracking your business records — sales, farm expenses, debts and more.</p>
        <a href="${process.env.CLIENT_URL}" style="display:inline-block;margin:20px 0;padding:14px 28px;background:#059669;color:#fff;border-radius:10px;text-decoration:none;font-weight:700">
          Open Record Chief
        </a>
        <p style="color:#64748B;font-size:13px">Questions? WhatsApp us: <a href="https://wa.me/2348119528922">+234 811 952 8922</a></p>
      </div>
    `,
  });
}

async function sendInvite(email, ownerName, inviteURL) {
  const transport = getTransport();
  await transport.sendMail({
    from: process.env.EMAIL_FROM || 'Record Chief <no-reply@recordchief.app>',
    to: email,
    subject: `${ownerName} invited you to Record Chief`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
        <h2 style="color:#2563EB">📒 Record Chief</h2>
        <p>Hi there,</p>
        <p><strong>${ownerName}</strong> has invited you to view and manage their business records on Record Chief.</p>
        <a href="${inviteURL}" style="display:inline-block;margin:20px 0;padding:14px 28px;background:#2563EB;color:#fff;border-radius:10px;text-decoration:none;font-weight:700">
          Accept Invitation
        </a>
        <p style="color:#64748B;font-size:13px">This link expires in 7 days. If you didn't expect this, you can ignore it.</p>
        <hr style="border:none;border-top:1px solid #E2E8F0;margin:20px 0">
        <p style="color:#94A3B8;font-size:12px">Record Chief · Built for Nigerian businesses</p>
      </div>
    `,
  });
}


async function sendOTPEmail(email, name, otp) {
  const transport = getTransport();
  await transport.sendMail({
    from: process.env.EMAIL_FROM || 'Record Chief <no-reply@recordchief.app>',
    to: email,
    subject: 'Your Record Chief verification code',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
        <h2 style="color:#2563EB">📒 Record Chief</h2>
        <p>Hi ${name},</p>
        <p>Your email verification code is:</p>
        <div style="text-align:center;margin:28px 0">
          <span style="font-size:42px;font-weight:900;font-family:monospace;letter-spacing:12px;color:#1E3A8A;background:#EFF6FF;padding:16px 24px;border-radius:12px">${otp}</span>
        </div>
        <p style="color:#64748B;font-size:13px">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
        <p style="color:#64748B;font-size:13px">If you didn't request this, ignore this email.</p>
        <hr style="border:none;border-top:1px solid #E2E8F0;margin:20px 0">
        <p style="color:#94A3B8;font-size:12px">Record Chief · Built for Nigerian businesses</p>
      </div>
    `,
  });
}

module.exports = { sendPasswordReset, sendWelcome, sendInvite, sendOTPEmail };

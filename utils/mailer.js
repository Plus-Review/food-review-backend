const nodemailer = require('nodemailer');

let transporter;

const getClientOrigin = () => (
    String(process.env.CLIENT_URL || 'http://localhost:5173')
        .split(',')[0]
        .trim()
        .replace(/\/+$/, '')
);

const isMailerConfigured = () => Boolean(
    process.env.SMTP_HOST
    && process.env.SMTP_PORT
    && process.env.SMTP_USER
    && process.env.SMTP_PASS
    && process.env.MAIL_FROM
);

const getTransporter = () => {
    if (!isMailerConfigured()) return null;
    if (transporter) return transporter;

    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        pool: true,
        maxConnections: 3,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        tls: {
            rejectUnauthorized: String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false',
        },
    });

    return transporter;
};

const verifyMailerConnection = async () => {
    const activeTransporter = getTransporter();
    if (!activeTransporter) {
        throw new Error('Konfigurasi SMTP belum lengkap.');
    }

    await activeTransporter.verify();
    return true;
};

const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const emailFrame = ({ eyebrow, title, body, actionLabel, actionUrl, code }) => `
<!doctype html>
<html lang="id">
  <body style="margin:0;background:#f6f4ee;font-family:Arial,sans-serif;color:#181714;padding:28px 14px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e8e3d8;border-radius:12px;overflow:hidden;">
          <tr><td style="height:4px;background:linear-gradient(90deg,#1f3f2f 0 68%,#efb84f 68% 100%);"></td></tr>
          <tr><td style="padding:30px;">
            <div style="font-size:13px;font-weight:800;color:#8a5a00;">${escapeHtml(eyebrow)}</div>
            <h1 style="margin:10px 0 12px;font-size:28px;line-height:1.15;color:#173326;">${escapeHtml(title)}</h1>
            <p style="margin:0;color:#665f54;font-size:15px;line-height:1.7;">${escapeHtml(body)}</p>
            ${code ? `<div style="margin:24px 0;padding:16px;border-radius:10px;background:#f4f7f2;color:#173326;font-size:30px;font-weight:900;letter-spacing:6px;text-align:center;">${escapeHtml(code)}</div>` : ''}
            ${actionUrl ? `<a href="${escapeHtml(actionUrl)}" style="display:inline-block;margin-top:24px;border-radius:8px;background:#1f3f2f;color:#fff;font-size:14px;font-weight:800;padding:13px 18px;text-decoration:none;">${escapeHtml(actionLabel)}</a>` : ''}
            <p style="margin:24px 0 0;color:#8a8378;font-size:12px;line-height:1.6;">Abaikan email ini jika kamu tidak melakukan permintaan tersebut.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

const sendMail = async ({ to, subject, text, html }) => {
    const activeTransporter = getTransporter();
    if (!activeTransporter) return { delivered: false, development: true };

    await activeTransporter.sendMail({
        from: process.env.MAIL_FROM,
        to,
        subject,
        text,
        html,
    });

    return { delivered: true, development: false };
};

const sendVerificationEmail = ({ to, name, code }) => sendMail({
    to,
    subject: 'Verifikasi akun Plus Review',
    text: `Halo ${name}. Kode verifikasi Plus Review kamu adalah ${code}. Kode berlaku selama 15 menit.`,
    html: emailFrame({
        eyebrow: 'Verifikasi email',
        title: `Halo, ${name}`,
        body: 'Masukkan kode berikut untuk memastikan email ini benar-benar milikmu. Kode berlaku selama 15 menit.',
        code,
    }),
});

const sendPasswordResetEmail = ({ to, name, token }) => {
    const resetUrl = `${getClientOrigin()}/reset-password?token=${encodeURIComponent(token)}`;
    return sendMail({
        to,
        subject: 'Reset password Plus Review',
        text: `Halo ${name}. Reset password Plus Review melalui tautan berikut: ${resetUrl}. Tautan berlaku selama 30 menit.`,
        html: emailFrame({
            eyebrow: 'Keamanan akun',
            title: 'Atur password baru',
            body: 'Permintaan reset password telah diterima. Tautan ini hanya dapat digunakan satu kali dan berlaku selama 30 menit.',
            actionLabel: 'Reset password',
            actionUrl: resetUrl,
        }),
    }).then((result) => ({ ...result, resetUrl }));
};

module.exports = {
    isMailerConfigured,
    sendPasswordResetEmail,
    sendVerificationEmail,
    verifyMailerConnection,
};

// Outgoing app email.
//   1. Resend API when RESEND_API_KEY is set
//   2. SMTP (nodemailer) when SMTP_HOST is set
//   3. Otherwise nothing is sent and { sent: false, configured: false } is returned
// Secrets come from Netlify env vars only.

const DEFAULT_FROM = 'FLO Onboarding <onboarding@hacflo.com>';

export function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST);
}

export async function sendMail({ to, subject, html, text }) {
  const from = process.env.MAIL_FROM || DEFAULT_FROM;

  try {
    if (process.env.RESEND_API_KEY) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ from, to: [to], subject, html, text })
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
      return { sent: true, configured: true, provider: 'resend' };
    }

    if (process.env.SMTP_HOST) {
      const { default: nodemailer } = await import('nodemailer');
      const port = Number(process.env.SMTP_PORT || 465);
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
      });
      await transport.sendMail({ from, to, subject, html, text });
      return { sent: true, configured: true, provider: 'smtp' };
    }
  } catch (e) {
    console.error('sendMail failed', e.message);
    return { sent: false, configured: true, error: 'send_failed' };
  }

  return { sent: false, configured: false };
}

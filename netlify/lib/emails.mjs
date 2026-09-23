// App email bodies. Same look as supabase/email-templates: dark header with the
// light FLO logo, teal accents, plain friendly copy.
import { escapeHtml } from './http.mjs';

function layout({ portalUrl, title, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'DM Sans',Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#0a2a2e;padding:28px 32px" align="left"><img src="${escapeHtml(portalUrl)}/assets/brand/flo-logo-light.png" alt="FLO" height="40" style="display:block;height:40px;width:auto;border:0"></td></tr>
<tr><td style="height:4px;background:#2dd4bf;line-height:4px;font-size:0">&nbsp;</td></tr>
<tr><td style="padding:32px">${bodyHtml}</td></tr>
<tr><td style="padding:20px 32px;background:#f9fafb;color:#9ca3af;font-size:12px;line-height:1.5">FLO by HAC Texas. You're receiving this because your FLO team set up an onboarding portal account for you.</td></tr>
</table></td></tr></table></body></html>`;
}

export function welcomeEmail({ fullName, orgName, portalUrl }) {
  const first = (fullName || '').trim().split(/\s+/)[0] || 'there';
  const subject = 'Your FLO onboarding portal is ready';
  const bodyHtml = `
<h1 style="margin:0 0 12px;font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:22px;color:#0a2a2e">Hi ${escapeHtml(first)}, your portal is ready</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151">Your FLO onboarding portal for <strong>${escapeHtml(orgName)}</strong> is set up. Track progress, submit your data and go live with confidence, step by step.</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151">Sign in with this email address. We'll send you a one-time code; no password needed.</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:9999px;background:#1a8a7d"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none">Open the portal</a></td></tr></table>
<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6b7280">Or paste this link into your browser: <a href="${escapeHtml(portalUrl)}" style="color:#1a8a7d">${escapeHtml(portalUrl)}</a></p>
<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#6b7280">Tip: ask your IT team to allowlist onboarding@hacflo.com so sign-in codes don't end up in quarantine.</p>`;
  const text = `Hi ${first},

Your FLO onboarding portal for ${orgName} is ready.

Open the portal: ${portalUrl}

Sign in with this email address. We'll send you a one-time code; no password needed.

Tip: ask your IT team to allowlist onboarding@hacflo.com so sign-in codes don't end up in quarantine.

FLO by HAC Texas`;
  return { subject, html: layout({ portalUrl, title: subject, bodyHtml }), text };
}

import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';

/** In-memory outbox used by automated tests (EMAIL_TRANSPORT=memory). */
export const memoryOutbox = [];

let transporter;
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  });
  return transporter;
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

export function renderEmail({ title, paragraphs = [], cta }) {
  const text = [title, '', ...paragraphs, ...(cta ? ['', `${cta.label}: ${cta.url}`] : []), '', '— The Rivoshoppa team'].join('\n');
  const body = paragraphs.map((p) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${escapeHtml(p)}</p>`).join('');
  const button = cta
    ? `<p style="margin:24px 0"><a href="${escapeHtml(cta.url)}" style="background:#f2653a;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${escapeHtml(cta.label)}</a></p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f3f6f8;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0b6e75;padding:18px 24px;color:#ffffff;font-size:20px;font-weight:bold">Rivoshoppa</td></tr>
<tr><td style="padding:24px"><h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>${body}${button}</td></tr>
<tr><td style="padding:16px 24px;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0">You received this email because you have a Rivoshoppa account.</td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}

export async function sendEmail({ to, subject, title, paragraphs, cta }) {
  const { text, html } = renderEmail({ title: title ?? subject, paragraphs, cta });
  const message = { from: config.EMAIL_FROM, to, subject, text, html };

  if (config.EMAIL_TRANSPORT === 'memory') {
    memoryOutbox.push(message);
    return;
  }
  if (config.EMAIL_TRANSPORT === 'console') {
    logger.info({ to, subject }, `Email (console transport)\n${text}`);
    return;
  }
  await getTransporter().sendMail(message);
}

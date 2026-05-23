import { resend, FROM_ADDRESS } from '@/lib/shared/email';

/**
 * Daily reminder email. Body is intentionally PII-free per operations §7 —
 * no compound names, no dose values, no protocol detail. The user clicks
 * through to /tracker to see the specifics behind their authenticated session.
 */
export async function sendReminderEmail(toEmail: string): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: 'resend_not_configured' };
  }
  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: toEmail,
      subject: 'Daily peptide reminder',
      html: `<p>Time to log today&apos;s doses.</p>
<p><a href="${process.env.NEXTAUTH_URL ?? ''}/tracker">Open your tracker →</a></p>
<p style="color:#888;font-size:12px;">You can change reminders or unsubscribe anytime in Settings.</p>`,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? 'email_send_failed' };
  }
}

// Send helper used by both the confirmation (webhook) and shipping
// (label purchase) paths. Never throws — returns a structured result so
// callers can decide how to handle failure without compromising the
// primary operation.
import type { SupabaseClient } from '@supabase/supabase-js';
import { getResendClient, getFromAddress } from '../resend';

export type EmailType = 'order_confirmation' | 'shipping_notification';

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  orderId?: string;
  emailType: EmailType;
}

export interface SendEmailResult {
  ok: boolean;
  resend_id?: string;
  error?: string;
}

export async function sendEmail(
  supabase: SupabaseClient,
  args: SendEmailArgs,
): Promise<SendEmailResult> {
  const { to, subject, html, text, orderId, emailType } = args;

  try {
    const client = getResendClient();
    const { data, error } = await client.emails.send({
      from: getFromAddress(),
      to,
      subject,
      html,
      text,
    });

    if (error) {
      await logAttempt(supabase, {
        orderId,
        emailType,
        recipient: to,
        status: 'failed',
        errorMessage: (error as any).message || String(error),
      });
      return { ok: false, error: (error as any).message || 'Resend error' };
    }

    const resendId = data?.id ?? null;
    await logAttempt(supabase, {
      orderId,
      emailType,
      recipient: to,
      status: 'sent',
      resendId,
    });
    return { ok: true, resend_id: resendId ?? undefined };
  } catch (err) {
    const message = (err as Error).message || 'Send threw';
    await logAttempt(supabase, {
      orderId,
      emailType,
      recipient: to,
      status: 'failed',
      errorMessage: message,
    });
    return { ok: false, error: message };
  }
}

async function logAttempt(
  supabase: SupabaseClient,
  entry: {
    orderId?: string;
    emailType: EmailType;
    recipient: string;
    status: 'sent' | 'failed';
    resendId?: string | null;
    errorMessage?: string;
  },
): Promise<void> {
  try {
    await supabase.from('email_log').insert({
      order_id: entry.orderId ?? null,
      email_type: entry.emailType,
      recipient: entry.recipient,
      resend_id: entry.resendId ?? null,
      status: entry.status,
      error_message: entry.errorMessage ?? null,
    });
  } catch (err) {
    // Logging failures are swallowed — the table is observability, not
    // state. Print to console so Netlify logs still show something.
    console.warn('Failed to insert email_log row', err);
  }
}

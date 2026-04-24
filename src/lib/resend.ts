// Server-only Resend client. Never import from client-side code.
// Lazy-instantiated so missing env vars surface as a helpful error at send
// time, not at module load.
import { Resend } from 'resend';

let _client: Resend | null = null;

export function getResendClient(): Resend {
  if (_client) return _client;
  const key =
    (typeof process !== 'undefined' && process.env?.RESEND_API_KEY) ||
    import.meta.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  _client = new Resend(key);
  return _client;
}

export function getFromAddress(): string {
  const name =
    (typeof process !== 'undefined' && process.env?.EMAIL_FROM_NAME) ||
    import.meta.env.EMAIL_FROM_NAME ||
    'Tacky Turquoise';
  const email =
    (typeof process !== 'undefined' && process.env?.EMAIL_FROM) ||
    import.meta.env.EMAIL_FROM ||
    'orders@tackyturquoise.com';
  return `${name} <${email}>`;
}

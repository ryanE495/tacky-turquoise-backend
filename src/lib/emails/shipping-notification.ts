// Shipping notification email template. Fires after a label is purchased.
import type { ShipTo } from './order-confirmation';

export interface ShippingNotificationArgs {
  order_number: string;
  customer_name: string;
  tracking_number: string;
  tracking_url: string;
  shipping_service_level: string | null;
  ship_to: ShipTo;
}

export function shippingNotificationEmail(o: ShippingNotificationArgs): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = firstWord(o.customer_name) || 'there';
  const subject = 'Your Tacky Turquoise order is on its way';
  return {
    subject,
    html: buildHtml(o, firstName),
    text: buildText(o, firstName),
  };
}

function firstWord(s: string): string {
  const trimmed = (s || '').trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0];
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(o: ShippingNotificationArgs, firstName: string): string {
  const addr = o.ship_to;
  const addrLines = [
    esc(addr.name),
    esc(addr.line1),
    addr.line2 ? esc(addr.line2) : null,
    `${esc(addr.city)}, ${esc(addr.state)} ${esc(addr.postal_code)}`,
  ]
    .filter(Boolean)
    .join('<br>');

  const serviceLine = o.shipping_service_level
    ? `<p style="margin:18px 0 0;font-size:14px;color:#6b6b6b;">Shipped via ${esc(o.shipping_service_level)}.</p>`
    : '';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Your order is on its way</title>
</head>
<body style="margin:0;padding:0;background:#f7f6f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f2;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e2ded4;border-radius:10px;">
          <tr>
            <td style="padding:28px 28px 8px 28px;">
              <div style="font-size:22px;font-weight:700;color:#1f6f6a;letter-spacing:0.01em;">Tacky Turquoise</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 8px 28px;">
              <h1 style="margin:0;font-size:20px;font-weight:600;color:#1a1a1a;">Hi ${esc(firstName)},</h1>
              <p style="margin:12px 0 0;font-size:15px;line-height:1.5;color:#1a1a1a;">
                Good news — your order ${esc(o.order_number)} is on its way!
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 8px 28px;">
              <div style="font-size:12px;color:#6b6b6b;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">
                Tracking
              </div>
              <div style="margin-top:8px;font-size:16px;font-weight:600;letter-spacing:0.01em;color:#1a1a1a;font-variant-numeric:tabular-nums;">
                ${esc(o.tracking_number)}
              </div>
              <div style="margin-top:14px;">
                <a href="${esc(o.tracking_url)}"
                   style="display:inline-block;padding:11px 22px;background:#1f6f6a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">
                  Track your shipment
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 0 28px;">
              <div style="font-size:12px;color:#6b6b6b;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">
                Shipping to
              </div>
              <div style="margin-top:6px;font-size:14px;line-height:1.5;color:#1a1a1a;">
                ${addrLines}
              </div>
              ${serviceLine}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 8px 28px;border-top:1px solid #e7e4dc;margin-top:24px;font-size:14px;color:#1a1a1a;">
              <p style="margin:16px 0 0;">Any questions? Just reply to this email.</p>
              <p style="margin:18px 0 6px;color:#6b6b6b;">— Tacky Turquoise</p>
              <p style="margin:0 0 6px;"><a href="https://tackyturquoise.com" style="color:#1f6f6a;text-decoration:none;">tackyturquoise.com</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildText(o: ShippingNotificationArgs, firstName: string): string {
  const addr = o.ship_to;
  const addrLines = [
    addr.name,
    addr.line1,
    addr.line2 || null,
    `${addr.city}, ${addr.state} ${addr.postal_code}`,
  ]
    .filter(Boolean)
    .join('\n');

  return `Hi ${firstName},

Good news — your order ${o.order_number} is on its way!

TRACKING: ${o.tracking_number}
Track your shipment: ${o.tracking_url}

SHIPPING TO
${addrLines}${
    o.shipping_service_level ? `\n\nShipped via ${o.shipping_service_level}.` : ''
  }

Any questions? Just reply to this email.

— Tacky Turquoise
tackyturquoise.com
`;
}

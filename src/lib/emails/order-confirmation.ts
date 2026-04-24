// Order confirmation email template. Returns { subject, html, text }.
// HTML uses table-based layout + inline styles so it renders consistently
// across Gmail, Apple Mail, Outlook, etc.
import { formatPrice } from '../format';

export interface ConfirmationItem {
  title: string;
  piece_id: string;
  price_cents: number;
  primary_image_url: string | null;
}

export interface ShipTo {
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export interface OrderConfirmationArgs {
  order_number: string;
  customer_name: string;
  items: ConfirmationItem[];
  ship_to: ShipTo;
  subtotal_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
}

export function orderConfirmationEmail(o: OrderConfirmationArgs): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = firstWord(o.customer_name) || 'there';
  const subject = `Order ${o.order_number} confirmed — Tacky Turquoise`;
  const html = buildHtml(o, firstName);
  const text = buildText(o, firstName);
  return { subject, html, text };
}

function firstWord(s: string): string {
  const trimmed = (s || '').trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s+/);
  return parts[0];
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(o: OrderConfirmationArgs, firstName: string): string {
  const itemsHtml = o.items
    .map((it) => {
      const img = it.primary_image_url
        ? `<img src="${esc(it.primary_image_url)}" alt="${esc(it.title)}" width="64" height="64" style="display:block;border-radius:6px;object-fit:cover;" />`
        : `<div style="width:64px;height:64px;border-radius:6px;background:#e7e4dc;"></div>`;
      return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #e7e4dc;vertical-align:top;width:80px;">
            ${img}
          </td>
          <td style="padding:10px 0 10px 12px;border-bottom:1px solid #e7e4dc;vertical-align:top;">
            <div style="font-size:15px;color:#1a1a1a;font-weight:600;">${esc(it.title)}</div>
            <div style="font-size:12px;color:#6b6b6b;letter-spacing:0.05em;text-transform:uppercase;margin-top:2px;">Piece ${esc(it.piece_id)}</div>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #e7e4dc;vertical-align:top;text-align:right;font-variant-numeric:tabular-nums;font-size:14px;color:#1a1a1a;">
            ${formatPrice(it.price_cents)}
          </td>
        </tr>`;
    })
    .join('');

  const addr = o.ship_to;
  const addrLines = [
    esc(addr.name),
    esc(addr.line1),
    addr.line2 ? esc(addr.line2) : null,
    `${esc(addr.city)}, ${esc(addr.state)} ${esc(addr.postal_code)}`,
  ]
    .filter(Boolean)
    .join('<br>');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Order ${esc(o.order_number)} confirmed</title>
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
                Thanks for your order! We've got it and we'll be in touch when it ships.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 8px 28px;">
              <div style="font-size:12px;color:#6b6b6b;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">
                Order ${esc(o.order_number)}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${itemsHtml}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 28px 0 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
                <tr>
                  <td style="padding:3px 0;color:#6b6b6b;">Subtotal</td>
                  <td style="padding:3px 0;text-align:right;font-variant-numeric:tabular-nums;">${formatPrice(o.subtotal_cents)}</td>
                </tr>
                <tr>
                  <td style="padding:3px 0;color:#6b6b6b;">Shipping</td>
                  <td style="padding:3px 0;text-align:right;font-variant-numeric:tabular-nums;">${formatPrice(o.shipping_cents)}</td>
                </tr>
                ${
                  o.tax_cents > 0
                    ? `<tr><td style="padding:3px 0;color:#6b6b6b;">Tax</td><td style="padding:3px 0;text-align:right;font-variant-numeric:tabular-nums;">${formatPrice(o.tax_cents)}</td></tr>`
                    : ''
                }
                <tr>
                  <td style="padding:10px 0 0;border-top:1px solid #e7e4dc;font-weight:700;color:#1a1a1a;">Total</td>
                  <td style="padding:10px 0 0;border-top:1px solid #e7e4dc;text-align:right;font-variant-numeric:tabular-nums;font-weight:700;color:#1a1a1a;">${formatPrice(o.total_cents)}</td>
                </tr>
              </table>
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
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 8px 28px;border-top:1px solid #e7e4dc;margin-top:24px;font-size:14px;color:#1a1a1a;">
              <p style="margin:16px 0 0;">If you have questions, just reply to this email.</p>
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

function buildText(o: OrderConfirmationArgs, firstName: string): string {
  const itemLines = o.items
    .map(
      (it) =>
        `  ${it.title} (Piece ${it.piece_id})    ${formatPrice(it.price_cents)}`,
    )
    .join('\n');
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

Thanks for your order! We've got it and we'll be in touch when it ships.

ORDER ${o.order_number}

${itemLines}

Subtotal   ${formatPrice(o.subtotal_cents)}
Shipping   ${formatPrice(o.shipping_cents)}${o.tax_cents > 0 ? `\nTax        ${formatPrice(o.tax_cents)}` : ''}
Total      ${formatPrice(o.total_cents)}

SHIPPING TO
${addrLines}

If you have questions, just reply to this email.

— Tacky Turquoise
tackyturquoise.com
`;
}

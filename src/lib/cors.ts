// CORS helpers for public API routes that get called from the storefront
// (separate Netlify site). Admin routes and the Stripe webhook do NOT use
// this — they stay same-origin / signature-verified.
//
// Allowlist is driven by PUBLIC_FRONTEND_ORIGINS (comma-separated). If the
// env var is unset, we fail closed — the browser will block the request.

const allowedOrigins = (import.meta.env.PUBLIC_FRONTEND_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };

  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

export function handleOptions(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export function withCors(request: Request, response: Response): Response {
  const corsHeaders = getCorsHeaders(request);
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

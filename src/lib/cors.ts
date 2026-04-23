// CORS helpers for public API routes that get called from the storefront
// (separate Netlify site). Admin routes and the Stripe webhook do NOT use
// this — they stay same-origin / signature-verified.
//
// Root cause of the earlier failure: `import.meta.env.PUBLIC_*` is handled
// by Vite via static replacement at build time, not read at runtime. If the
// env var wasn't present in the build environment (or the deploy happened
// before the env var was added on Netlify), the compiled function ships
// with the reference frozen to `undefined`. That meant the allowlist was
// always empty and the Access-Control-Allow-Origin header was never
// emitted, even though the dashboard had the value set.
//
// Fix: read `process.env.PUBLIC_FRONTEND_ORIGINS` at request time.
// process.env is populated by the Netlify Functions runtime on every cold
// start from the current dashboard env vars, so env changes take effect
// on the next deploy without needing a code change. `import.meta.env`
// remains a fallback so local `astro dev` keeps working from .env.
//
// Parsing happens per-request (the list is tiny; the cost is negligible).

function readAllowedOrigins(): string[] {
  const raw =
    (typeof process !== 'undefined' && process.env?.PUBLIC_FRONTEND_ORIGINS) ||
    (import.meta.env.PUBLIC_FRONTEND_ORIGINS ?? '');
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };

  const allowed = readAllowedOrigins();
  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  } else if (origin) {
    // Visible in Netlify function logs so a misconfigured allowlist is easy
    // to diagnose without rebuilding to change logging.
    console.warn(
      `[cors] blocking origin="${origin}" (allowlist=[${allowed.join(', ') || 'empty'}])`,
    );
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

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

interface ServerContext {
  cookies: AstroCookies;
  request: Request;
}

export function createSupabaseServerClient(ctx: ServerContext) {
  return createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(ctx.request.headers.get('cookie'));
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            ctx.cookies.set(name, value, toAstroCookieOptions(options));
          }
        },
      },
    },
  );
}

function parseCookieHeader(header: string | null): Array<{ name: string; value: string }> {
  if (!header) return [];
  const out: Array<{ name: string; value: string }> = [];
  for (const pair of header.split(';')) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) {
      out.push({ name: trimmed, value: '' });
      continue;
    }
    const name = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      value = raw;
    }
    out.push({ name, value });
  }
  return out;
}

function toAstroCookieOptions(options: CookieOptions) {
  return {
    path: options.path ?? '/',
    domain: options.domain,
    maxAge: options.maxAge,
    expires: options.expires,
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite as 'lax' | 'strict' | 'none' | boolean | undefined,
  };
}

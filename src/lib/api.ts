export function json<T>(body: { ok: true; data: T } | { ok: false; error: string }, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

export const ok = <T>(data: T, init?: ResponseInit) => json({ ok: true, data }, init);
export const fail = (error: string, status = 400) => json({ ok: false, error }, { status });

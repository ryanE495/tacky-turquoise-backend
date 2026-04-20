import type { SupabaseClient, User } from '@supabase/supabase-js';

export interface AdminUserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  created_at: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

export async function listAdminUsers(supabase: SupabaseClient): Promise<AdminUserRow[]> {
  const users = await listAllAuthUsers(supabase);
  const ids = users.map((u) => u.id);

  const profileMap = new Map<string, string | null>();
  if (ids.length) {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', ids);
    if (error) throw error;
    for (const p of profiles ?? []) profileMap.set(p.id, p.display_name);
  }

  const rows: AdminUserRow[] = users
    .map((u) => ({
      id: u.id,
      email: u.email ?? null,
      display_name: profileMap.get(u.id) ?? null,
      email_confirmed_at: u.email_confirmed_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      created_at: u.created_at,
    }))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return rows;
}

export async function getAdminUserById(
  supabase: SupabaseClient,
  id: string,
): Promise<AdminUserRow | null> {
  const { data, error } = await supabase.auth.admin.getUserById(id);
  if (error || !data?.user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', id)
    .maybeSingle();
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    display_name: profile?.display_name ?? null,
    email_confirmed_at: data.user.email_confirmed_at ?? null,
    last_sign_in_at: data.user.last_sign_in_at ?? null,
    created_at: data.user.created_at,
  };
}

async function listAllAuthUsers(supabase: SupabaseClient): Promise<User[]> {
  const all: User[] = [];
  const perPage = 200;
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    all.push(...data.users);
    if (data.users.length < perPage) break;
    page += 1;
    if (page > 20) break;
  }
  return all;
}

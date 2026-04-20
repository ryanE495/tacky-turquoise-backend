-- Harden the new-user trigger so a profile insert failure can never
-- block the underlying auth.users insert. Also schema-qualifies and
-- pins search_path so SECURITY DEFINER runs deterministically.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  begin
    insert into public.profiles (id, display_name)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
    )
    on conflict (id) do nothing;
  exception when others then
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- Let the function insert past RLS on profiles.
grant insert on public.profiles to postgres, service_role;

-- Allow the service role to bypass RLS for admin inserts (separate policy,
-- since policies are role-scoped).
drop policy if exists "Service role full access to profiles" on public.profiles;
create policy "Service role full access to profiles"
  on public.profiles for all
  to service_role
  using (true) with check (true);

-- General-purpose media bucket for the admin media library.
-- Separate from product-images so product assets stay cleanly scoped.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 10485760)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

drop policy if exists "Public view media" on storage.objects;
create policy "Public view media"
  on storage.objects for select
  using (bucket_id = 'media');

drop policy if exists "Authenticated upload media" on storage.objects;
create policy "Authenticated upload media"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'media');

drop policy if exists "Authenticated delete media" on storage.objects;
create policy "Authenticated delete media"
  on storage.objects for delete to authenticated
  using (bucket_id = 'media');

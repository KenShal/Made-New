-- Storage buckets.
--   artwork-private: creator uploads. Private. Objects are written ONLY by the
--     server (service role) after type/size/dimension validation, re-encoding and
--     malware scanning. Paths are random UUIDs: {creator_id}/{uuid}.png
--     Owners and reviewers read through short-lived signed URLs minted by the server.
--   product-public: approved mockups for published products. Public read, server write.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('artwork-private', 'artwork-private', false, 26214400, array['image/png', 'image/jpeg', 'image/webp']),
  ('product-public', 'product-public', true, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- No INSERT/UPDATE/DELETE policies for anon/authenticated: clients cannot write objects directly.
create policy artwork_owner_read on storage.objects for select to authenticated
  using (
    bucket_id = 'artwork-private'
    and (
      (storage.foldername(name))[1] = public.my_creator_id()::text
      or public.is_reviewer()
    )
  );

create policy product_public_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-public');

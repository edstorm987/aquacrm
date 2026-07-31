insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('aquacrm-public', 'aquacrm-public', true, 52428800, array['image/jpeg','image/png','image/webp','image/gif','image/svg+xml','video/mp4','application/pdf']),
  ('aquacrm-uploads', 'aquacrm-uploads', false, 104857600, array['image/jpeg','image/png','image/webp','video/mp4','application/pdf','application/zip','text/plain','text/csv']),
  ('aquaoasis-web-public', 'aquaoasis-web-public', true, 52428800, array['image/jpeg','image/png','image/webp','image/gif','image/svg+xml','video/mp4','application/pdf']),
  ('aquaoasis-web-uploads', 'aquaoasis-web-uploads', false, 104857600, array['image/jpeg','image/png','image/webp','video/mp4','application/pdf','application/zip','text/plain','text/csv']),
  ('milesymedia-public', 'milesymedia-public', true, 104857600, array['image/jpeg','image/png','image/webp','image/gif','image/svg+xml','video/mp4','application/pdf']),
  ('milesymedia-uploads', 'milesymedia-uploads', false, 2147483648, array['image/jpeg','image/png','image/webp','video/mp4','application/pdf','application/zip','text/plain','text/csv']),
  ('zimante-group-public', 'zimante-group-public', true, 52428800, array['image/jpeg','image/png','image/webp','image/gif','image/svg+xml','video/mp4','application/pdf']),
  ('zimante-group-uploads', 'zimante-group-uploads', false, 104857600, array['image/jpeg','image/png','image/webp','video/mp4','application/pdf','application/zip','text/plain','text/csv'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read public ecosystem assets" on storage.objects;
create policy "Public can read public ecosystem assets"
on storage.objects for select
to anon, authenticated
using (
  bucket_id in ('aquacrm-public', 'aquaoasis-web-public', 'milesymedia-public', 'zimante-group-public')
);

drop policy if exists "Internal users manage ecosystem storage" on storage.objects;
create policy "Internal users manage ecosystem storage"
on storage.objects for all
to authenticated
using (
  bucket_id in (
    'aquacrm-public',
    'aquacrm-uploads',
    'aquaoasis-web-public',
    'aquaoasis-web-uploads',
    'milesymedia-public',
    'milesymedia-uploads',
    'zimante-group-public',
    'zimante-group-uploads'
  )
  and public.is_internal_user()
)
with check (
  bucket_id in (
    'aquacrm-public',
    'aquacrm-uploads',
    'aquaoasis-web-public',
    'aquaoasis-web-uploads',
    'milesymedia-public',
    'milesymedia-uploads',
    'zimante-group-public',
    'zimante-group-uploads'
  )
  and public.is_internal_user()
);

drop policy if exists "Portal users manage their own upload folder" on storage.objects;
create policy "Portal users manage their own upload folder"
on storage.objects for all
to authenticated
using (
  bucket_id in ('aquacrm-uploads', 'aquaoasis-web-uploads', 'milesymedia-uploads', 'zimante-group-uploads')
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_internal_user())
)
with check (
  bucket_id in ('aquacrm-uploads', 'aquaoasis-web-uploads', 'milesymedia-uploads', 'zimante-group-uploads')
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_internal_user())
);

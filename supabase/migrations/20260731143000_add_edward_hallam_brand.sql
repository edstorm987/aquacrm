insert into public.brands (slug, name, public_url, portal_url)
values
  ('edward-hallam', 'Edward Hallam', 'https://edward-hallam.com', null)
on conflict (slug) do update
set name = excluded.name,
    public_url = excluded.public_url,
    portal_url = excluded.portal_url;

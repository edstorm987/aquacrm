insert into public.brands (slug, name, public_url, portal_url)
values
  ('aquacrm', 'AquaCRM', 'https://aqua-crm.com', 'https://aqua-crm.com/login?brand=aquacrm&next=/portal'),
  ('aquaoasis-web', 'AquaOasis-Web', 'https://aquaoasis-web.com', 'https://aquaoasis-web.com/sign-in'),
  ('milesymedia', 'Milesymedia', 'https://milesymedia.com', 'https://milesymedia.com/login'),
  ('zimante-group', 'Zimante Group', 'https://zimante-group.com', 'https://zimante-group.com/login'),
  ('edward-hallam', 'Edward Hallam', 'https://edward-hallam.com', null)
on conflict (slug) do update
set name = excluded.name,
    public_url = excluded.public_url,
    portal_url = excluded.portal_url;

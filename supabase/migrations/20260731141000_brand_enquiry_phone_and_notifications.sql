alter table public.brand_enquiries
alter column email drop not null;

drop policy if exists "Public can create consented brand enquiries" on public.brand_enquiries;
create policy "Public can create consented brand enquiries"
on public.brand_enquiries for insert
to anon, authenticated
with check (
  consent = true
  and length(trim(name)) > 1
  and (
    position('@' in coalesce(email, '')) > 1
    or length(trim(coalesce(phone, ''))) >= 7
  )
);

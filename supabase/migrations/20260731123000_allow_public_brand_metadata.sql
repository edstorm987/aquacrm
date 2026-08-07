drop policy if exists "Public brand metadata is readable" on public.brands;
create policy "Public brand metadata is readable"
  on public.brands
  for select
  using (true);

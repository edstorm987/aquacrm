create table if not exists public.shoots (
  id text primary key,
  brand_id uuid references public.brands(id) on delete set null,
  title text not null,
  shoot_type text not null,
  shoot_date_label text not null,
  location text not null,
  status text not null default 'Editing' check (status in ('Ready', 'Editing', 'Archived')),
  cover text not null,
  summary text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shoot_photos (
  id text not null,
  shoot_id text not null references public.shoots(id) on delete cascade,
  src text not null,
  title text not null,
  dimensions text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (shoot_id, id)
);

drop trigger if exists touch_shoots_updated_at on public.shoots;
create trigger touch_shoots_updated_at
before update on public.shoots
for each row execute function public.touch_updated_at();

alter table public.shoots enable row level security;
alter table public.shoot_photos enable row level security;

drop policy if exists "Public shoot library is readable" on public.shoots;
create policy "Public shoot library is readable"
on public.shoots for select
using (true);

drop policy if exists "Public shoot photos are readable" on public.shoot_photos;
create policy "Public shoot photos are readable"
on public.shoot_photos for select
using (true);

drop policy if exists "Internal users manage shoots" on public.shoots;
create policy "Internal users manage shoots"
on public.shoots for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "Internal users manage shoot photos" on public.shoot_photos;
create policy "Internal users manage shoot photos"
on public.shoot_photos for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    case
      when lower(coalesce(new.email, '')) = 'edwardhallam07@gmail.com' then 'owner'
      else 'client'
    end
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(excluded.full_name, profiles.full_name),
      role = case
        when excluded.email = 'edwardhallam07@gmail.com' then 'owner'
        else profiles.role
      end,
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

with milesymedia_brand as (
  select id from public.brands where slug = 'milesymedia'
)
insert into public.shoots (id, brand_id, title, shoot_type, shoot_date_label, location, status, cover, summary, sort_order)
select *
from (
  values
    ('portside-riders', (select id from milesymedia_brand), 'Portside Riders', 'Automotive', '18 July 2026', 'Felixstowe', 'Ready', '/shoots/portside-riders/rider-front.jpg', 'A quiet industrial portrait series built around movement, machines and late-day light.', 10),
    ('pool-hall-stories', (select id from milesymedia_brand), 'Pool Hall Stories', 'Editorial', '9 June 2026', 'Suffolk', 'Ready', '/shoots/pool-hall-stories/pool-setup.jpg', 'Low light, patient frames and the small rituals that happen before the first break.', 20),
    ('night-stories', (select id from milesymedia_brand), 'Night Stories', 'Creative', '28 May 2026', 'Ipswich', 'Editing', '/shoots/night-stories/night-story.png', 'An experimental frame exploring distance, friendship and the colour of a late night.', 30)
) as seeded(id, brand_id, title, shoot_type, shoot_date_label, location, status, cover, summary, sort_order)
on conflict (id) do update
set brand_id = excluded.brand_id,
    title = excluded.title,
    shoot_type = excluded.shoot_type,
    shoot_date_label = excluded.shoot_date_label,
    location = excluded.location,
    status = excluded.status,
    cover = excluded.cover,
    summary = excluded.summary,
    sort_order = excluded.sort_order,
    updated_at = now();

insert into public.shoot_photos (shoot_id, id, src, title, dimensions, sort_order)
values
  ('portside-riders', 'rider-front', '/shoots/portside-riders/rider-front.jpg', 'Arrival', '3456 x 5184', 10),
  ('portside-riders', 'rider-white', '/shoots/portside-riders/rider-white.jpg', 'White fairing', '3456 x 5184', 20),
  ('portside-riders', 'rider-rear', '/shoots/portside-riders/rider-rear.jpg', 'Ready to ride', '3456 x 5184', 30),
  ('pool-hall-stories', 'pool-setup', '/shoots/pool-hall-stories/pool-setup.jpg', 'The setup', '3456 x 5184', 10),
  ('pool-hall-stories', 'pool-shot', '/shoots/pool-hall-stories/pool-shot.jpg', 'On the line', '3456 x 5184', 20),
  ('pool-hall-stories', 'pool-detail', '/shoots/pool-hall-stories/pool-detail.jpg', 'After the shot', '3456 x 5184', 30),
  ('night-stories', 'night-story', '/shoots/night-stories/night-story.png', 'Through the glass', '2048 x 1536', 10)
on conflict (shoot_id, id) do update
set src = excluded.src,
    title = excluded.title,
    dimensions = excluded.dimensions,
    sort_order = excluded.sort_order;

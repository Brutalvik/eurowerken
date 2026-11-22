-- EuroWerken: each workshop's public customer website and its branding.
-- Safe to re-run.
--
--   public.workshop_sites   One row per workshop: URL name (slug), display
--                           name, colours, logo, hero text, contact details.
--                           Created automatically with the workshop.
--   Visitors (signed out) can read a site only while it is published.
--   Members of the workshop can always read their own site.
--   Only users with full Settings access in that workshop can edit it.

create table if not exists public.workshop_sites (
  workshop_id     uuid primary key references public.workshops (id) on delete cascade,
  slug            text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,46}[a-z0-9])?$'),
  display_name    text not null check (length(trim(display_name)) between 2 and 60),
  tagline         text check (length(tagline) <= 120),
  hero_title      text check (length(hero_title) <= 120),
  hero_highlight  text check (length(hero_highlight) <= 60),
  hero_subtitle   text check (length(hero_subtitle) <= 300),
  logo_url        text check (logo_url is null or logo_url ~ '^https://'),
  accent_color    text not null default '#1d6ff0' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  phone           text check (length(phone) <= 40),
  email           text check (length(email) <= 120),
  address         text check (length(address) <= 200),
  hours           text check (length(hours) <= 300),
  instagram_url   text check (instagram_url is null or instagram_url ~ '^https://'),
  facebook_url    text check (facebook_url is null or facebook_url ~ '^https://'),
  youtube_url     text check (youtube_url is null or youtube_url ~ '^https://'),
  published       boolean not null default false,
  updated_at      timestamptz not null default now()
);

-- Words the customer app uses as its own paths, so no workshop can claim them.
create or replace function public.is_reserved_slug(p_slug text)
returns boolean
language sql immutable
as $$
  select p_slug = any (array[
    'admin', 'api', 'app', 'assets', 'auth', 'erp', 'help', 'images', 'login',
    'logout', 'register', 'signup', 'signin', 'static', 'support', 'www', 'workshops'
  ])
$$;

-- A free URL name from a workshop name: "Bravo Motors" -> bravo-motors, then bravo-motors-2, ...
create or replace function public.unique_site_slug(p_name text, p_exclude uuid default null)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  base text := trim(both '-' from regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'));
  candidate text;
  n int := 1;
begin
  base := left(base, 40);
  base := trim(both '-' from base);
  if length(base) < 3 or public.is_reserved_slug(base) then
    base := 'workshop-' || coalesce(nullif(base, ''), 'site');
  end if;
  candidate := base;
  while exists (
    select 1 from public.workshop_sites
    where slug = candidate and (p_exclude is null or workshop_id <> p_exclude)
  ) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end;
$$;
revoke all on function public.unique_site_slug(text, uuid) from public, anon, authenticated;

-- Every new workshop gets a site, unpublished, named after the workshop.
create or replace function public.workshops_after_insert_site()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.workshop_sites (workshop_id, slug, display_name, hero_title, hero_highlight, hero_subtitle)
  values (
    new.id,
    public.unique_site_slug(new.name, new.id),
    left(new.name, 60),
    'Precision Service for Elite Vehicles.',
    'Service',
    'Master technicians, genuine parts, and transparent tracking for your Audi, BMW, Mercedes, Porsche, and more.'
  )
  on conflict (workshop_id) do nothing;
  return new;
end;
$$;

drop trigger if exists workshops_after_insert_site on public.workshops;
create trigger workshops_after_insert_site
  after insert on public.workshops
  for each row execute function public.workshops_after_insert_site();

-- Existing workshops get their site now.
insert into public.workshop_sites (workshop_id, slug, display_name, hero_title, hero_highlight, hero_subtitle)
select w.id, public.unique_site_slug(w.name, w.id), left(w.name, 60),
       'Precision Service for Elite Vehicles.', 'Service',
       'Master technicians, genuine parts, and transparent tracking for your Audi, BMW, Mercedes, Porsche, and more.'
from public.workshops w
where not exists (select 1 from public.workshop_sites s where s.workshop_id = w.id)
order by w.created_at;

create or replace function public.workshop_sites_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.workshop_id is distinct from old.workshop_id then
    raise exception 'A site cannot move to another workshop';
  end if;
  new.slug := lower(trim(new.slug));
  if public.is_reserved_slug(new.slug) then
    raise exception 'The web address "%" is reserved. Choose another', new.slug;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists workshop_sites_before_update on public.workshop_sites;
create trigger workshop_sites_before_update
  before update on public.workshop_sites
  for each row execute function public.workshop_sites_before_update();

-- Row level security ---------------------------------------------------------

alter table public.workshop_sites enable row level security;

drop policy if exists "workshop_sites: public reads published" on public.workshop_sites;
create policy "workshop_sites: public reads published" on public.workshop_sites
  for select to anon, authenticated
  using (published);

drop policy if exists "workshop_sites: members read own" on public.workshop_sites;
create policy "workshop_sites: members read own" on public.workshop_sites
  for select to authenticated
  using (workshop_id = public.my_workshop());

drop policy if exists "workshop_sites: settings admins update" on public.workshop_sites;
create policy "workshop_sites: settings admins update" on public.workshop_sites
  for update to authenticated
  using (workshop_id = public.my_workshop() and public.has_access('settings', 'full'))
  with check (workshop_id = public.my_workshop() and public.has_access('settings', 'full'));

grant select on public.workshop_sites to anon, authenticated;
grant update on public.workshop_sites to authenticated;

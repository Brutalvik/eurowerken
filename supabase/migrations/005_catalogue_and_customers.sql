-- EuroWerken: customer identity, and each workshop's services, team, parts and
-- photos. Phase 1 of docs/backend-plan.md. Safe to re-run.
--
-- Customers
--   customer_accounts    one per auth user who uses a workshop site (global)
--   workshop_customers   which workshops a customer deals with
--   customer_vehicles    the customer's cars
--   A customer sees only their own rows. Staff see the customers linked to
--   their own workshop, when their role can see repair orders, sales or invoices.
--
-- Catalogue (per workshop, public on the workshop's site once published)
--   services, team_members, parts (+ part_costs, staff only)
--   Edited by staff of that workshop: services and team with full Settings
--   access, parts with full Inventory access.
--
-- Photos
--   Storage bucket workshop-public, paths <workshop_id>/<area>/<file>.

-- 0. Helpers ------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- True when the workshop's customer site is published (public data may be shown).
create or replace function public.site_is_published(p_workshop uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select published from public.workshop_sites where workshop_id = p_workshop), false)
$$;
grant execute on function public.site_is_published(uuid) to anon, authenticated;

-- 1. Customers ----------------------------------------------------------------

create table if not exists public.customer_accounts (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text check (length(full_name) <= 120),
  phone       text check (length(phone) <= 40),
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.workshop_customers (
  workshop_id  uuid not null references public.workshops (id) on delete cascade,
  customer_id  uuid not null references public.customer_accounts (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (workshop_id, customer_id)
);
create index if not exists workshop_customers_customer_idx on public.workshop_customers (customer_id);

create table if not exists public.customer_vehicles (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customer_accounts (id) on delete cascade,
  make         text not null check (length(make) between 1 and 40),
  model        text not null check (length(model) between 1 and 60),
  year         int check (year between 1950 and 2100),
  vin          text check (vin is null or vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  plate        text check (length(plate) <= 15),
  nickname     text check (length(nickname) <= 40),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists customer_vehicles_customer_idx on public.customer_vehicles (customer_id);

-- Staff of my workshop whose role deals with customers.
create or replace function public.staff_can_see_customers()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_access('repair-orders', 'view')
      or public.has_access('sales', 'view')
      or public.has_access('invoices', 'view')
$$;
grant execute on function public.staff_can_see_customers() to authenticated;

create or replace function public.is_my_workshop_customer(p_customer uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.workshop_customers
    where customer_id = p_customer and workshop_id = public.my_workshop()
  ) and public.staff_can_see_customers()
$$;
grant execute on function public.is_my_workshop_customer(uuid) to authenticated;

-- The signed-in user's customer account, created on first use (Google sign-ups
-- cannot carry metadata, so the customer site calls this after every sign-in).
create or replace function public.ensure_customer_account()
returns public.customer_accounts
language plpgsql security definer set search_path = public
as $$
declare
  acc public.customer_accounts;
  u auth.users;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into u from auth.users where id = auth.uid();
  insert into public.customer_accounts (id, email, full_name, avatar_url)
  values (
    u.id,
    u.email,
    nullif(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'), ''),
    nullif(coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'), '')
  )
  on conflict (id) do nothing;
  select * into acc from public.customer_accounts where id = auth.uid();
  return acc;
end;
$$;

-- Link the signed-in customer to the workshop whose (published) site they are on.
create or replace function public.link_customer_to_workshop(p_slug text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  wid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select workshop_id into wid from public.workshop_sites where slug = lower(trim(p_slug)) and published;
  if wid is null then raise exception 'Workshop not found'; end if;
  perform public.ensure_customer_account();
  insert into public.workshop_customers (workshop_id, customer_id) values (wid, auth.uid())
  on conflict do nothing;
end;
$$;

revoke all on function public.ensure_customer_account() from public, anon;
revoke all on function public.link_customer_to_workshop(text) from public, anon;
grant execute on function public.ensure_customer_account() to authenticated;
grant execute on function public.link_customer_to_workshop(text) to authenticated;

-- New accounts: customers (account_type = customer in the sign-up metadata) get
-- a customer account and no staff profile. Everyone else keeps the staff flow
-- from migration 003 (create or join a workshop).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  action text := meta ->> 'workshop_action';
  wid uuid := null;
  new_role public.staff_role := null;
begin
  if meta ->> 'account_type' = 'customer' then
    insert into public.customer_accounts (id, email, full_name, phone)
    values (
      new.id,
      new.email,
      nullif(coalesce(meta ->> 'full_name', meta ->> 'name'), ''),
      nullif(meta ->> 'phone', '')
    )
    on conflict (id) do nothing;
    return new;
  end if;

  if action = 'create' and length(trim(coalesce(meta ->> 'workshop_name', ''))) >= 2 then
    insert into public.workshops (number, name, created_by)
    values (public.new_workshop_number(), trim(meta ->> 'workshop_name'), new.id)
    returning id into wid;
    perform public.seed_workshop_permissions(wid);
    new_role := 'Manager';
  elsif action = 'join' then
    select id into wid from public.workshops where number = trim(coalesce(meta ->> 'workshop_number', ''));
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, workshop_id, role)
  values (
    new.id,
    new.email,
    nullif(coalesce(meta ->> 'full_name', meta ->> 'name'), ''),
    nullif(coalesce(meta ->> 'avatar_url', meta ->> 'picture'), ''),
    wid,
    new_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 2. Services -------------------------------------------------------------------

create table if not exists public.services (
  id            uuid primary key default gen_random_uuid(),
  workshop_id   uuid not null references public.workshops (id) on delete cascade,
  category      text not null check (category in ('maintenance', 'diagnostics', 'performance', 'brakes', 'climate', 'electrical')),
  name          text not null check (length(name) between 2 and 80),
  description   text check (length(description) <= 400),
  duration_text text check (length(duration_text) <= 40),
  price_from    numeric(10, 2) not null default 0 check (price_from >= 0),
  badge         text check (badge in ('Popular', 'Recommended')),
  icon          text not null default 'wrench' check (icon in ('oil', 'filter', 'battery', 'scan', 'gauge', 'brake', 'snow', 'bolt', 'wrench')),
  image_path    text,
  active        boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists services_workshop_idx on public.services (workshop_id, sort_order);

-- Starting catalogue for a workshop; it edits or removes these in the ERP.
create or replace function public.seed_workshop_services(p_workshop uuid)
returns void
language sql security definer set search_path = public
as $$
  insert into public.services (workshop_id, category, name, description, duration_text, price_from, badge, icon, sort_order)
  select p_workshop, d.category, d.name, d.description, d.duration, d.price, d.badge, d.icon, d.sort
  from (values
    ('maintenance', 'Synthetic Oil Service', 'Premium synthetic oil change, OEM filter replacement and a multi-point inspection.', '45 to 60 mins', 129.99, 'Popular', 'oil', 10),
    ('maintenance', 'Filter Replacement Package', 'Engine air filter and cabin microfilter with OEM parts.', '30 mins', 89.99, null, 'filter', 20),
    ('maintenance', 'Battery Service & Coding', 'Battery health test, replacement if needed, and ECU registration and coding.', '45 mins', 249.99, null, 'battery', 30),
    ('diagnostics', 'Computer Diagnostic Scan', 'Full module scan with dealer-level tools and a written report.', '60 mins', 120, 'Popular', 'scan', 40),
    ('brakes', 'Brake Pad & Rotor Service', 'Pads, rotors, sensors and a brake fluid flush with OEM parts.', '2 hours', 420, 'Popular', 'brake', 50),
    ('brakes', 'Four-Wheel Alignment', 'Laser alignment to factory specification.', '60 mins', 149, null, 'gauge', 60),
    ('climate', 'AC Regas & Leak Test', 'Recover, vacuum and recharge with UV leak detection.', '60 mins', 179, null, 'snow', 70),
    ('electrical', 'Module Coding & Retrofits', 'Coding for retrofitted options, lights and comfort features.', '1 to 2 hours', 150, null, 'bolt', 80)
  ) as d(category, name, description, duration, price, badge, icon, sort)
  where not exists (select 1 from public.services s where s.workshop_id = p_workshop)
$$;
revoke all on function public.seed_workshop_services(uuid) from public, anon, authenticated;

create or replace function public.workshops_after_insert_services()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.seed_workshop_services(new.id);
  return new;
end;
$$;
drop trigger if exists workshops_after_insert_services on public.workshops;
create trigger workshops_after_insert_services
  after insert on public.workshops
  for each row execute function public.workshops_after_insert_services();

select public.seed_workshop_services(id) from public.workshops;

-- 3. Team (public technician profiles) -----------------------------------------

create table if not exists public.team_members (
  id              uuid primary key default gen_random_uuid(),
  workshop_id     uuid not null references public.workshops (id) on delete cascade,
  profile_id      uuid references public.profiles (id) on delete set null,
  name            text not null check (length(name) between 2 and 80),
  role_title      text check (length(role_title) <= 60),
  bio             text check (length(bio) <= 600),
  specialties     text[] not null default '{}',
  makes           text[] not null default '{}',
  languages       text[] not null default '{}',
  years           int check (years between 0 and 70),
  certifications  text[] not null default '{}',
  photo_path      text,
  is_public       boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists team_members_workshop_idx on public.team_members (workshop_id, sort_order);

-- 4. Parts ------------------------------------------------------------------------

create table if not exists public.parts (
  id            uuid primary key default gen_random_uuid(),
  workshop_id   uuid not null references public.workshops (id) on delete cascade,
  slug          text not null check (slug ~ '^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$'),
  sku           text check (length(sku) <= 40),
  name          text not null check (length(name) between 2 and 120),
  brand         text check (length(brand) <= 60),
  category      text not null check (length(category) between 2 and 60),
  quality       text not null default 'OEM' check (quality in ('OEM', 'Genuine', 'Aftermarket')),
  fitment       text not null default 'guaranteed' check (fitment in ('guaranteed', 'universal')),
  part_number   text check (length(part_number) <= 60),
  price         numeric(10, 2) not null check (price >= 0),
  compare_at    numeric(10, 2) check (compare_at is null or compare_at >= 0),
  stock         int not null default 0 check (stock >= 0),
  min_stock     int not null default 0 check (min_stock >= 0),
  summary       text check (length(summary) <= 200),
  description   text check (length(description) <= 4000),
  features      text[] not null default '{}',
  specs         jsonb not null default '[]'::jsonb,
  oem_refs      text[] not null default '{}',
  warranty      text check (length(warranty) <= 200),
  image_paths   text[] not null default '{}',
  published     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workshop_id, slug)
);
create unique index if not exists parts_workshop_sku_idx on public.parts (workshop_id, sku) where sku is not null;
create index if not exists parts_workshop_category_idx on public.parts (workshop_id, category);

-- Unit cost lives apart so the public catalogue can never expose it.
create table if not exists public.part_costs (
  part_id      uuid primary key references public.parts (id) on delete cascade,
  workshop_id  uuid not null references public.workshops (id) on delete cascade,
  unit_cost    numeric(10, 2) not null default 0 check (unit_cost >= 0),
  updated_at   timestamptz not null default now()
);

create or replace function public.part_costs_set_workshop()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  select workshop_id into new.workshop_id from public.parts where id = new.part_id;
  if new.workshop_id is null then raise exception 'Unknown part'; end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists part_costs_set_workshop on public.part_costs;
create trigger part_costs_set_workshop
  before insert or update on public.part_costs
  for each row execute function public.part_costs_set_workshop();

-- Rows never move between workshops.
create or replace function public.keep_workshop_id()
returns trigger
language plpgsql
as $$
begin
  if new.workshop_id is distinct from old.workshop_id then
    raise exception 'Rows cannot move to another workshop';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['services', 'team_members', 'parts'] loop
    execute format('drop trigger if exists %I_keep_workshop on public.%I', t, t);
    execute format('create trigger %I_keep_workshop before update on public.%I for each row execute function public.keep_workshop_id()', t, t);
  end loop;
  foreach t in array array['customer_accounts', 'customer_vehicles'] loop
    execute format('drop trigger if exists %I_updated_at on public.%I', t, t);
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- 5. Row level security --------------------------------------------------------------

alter table public.customer_accounts enable row level security;
alter table public.workshop_customers enable row level security;
alter table public.customer_vehicles enable row level security;
alter table public.services enable row level security;
alter table public.team_members enable row level security;
alter table public.parts enable row level security;
alter table public.part_costs enable row level security;

-- Customers: themselves; staff of a workshop they are linked to.
drop policy if exists "customer_accounts: self" on public.customer_accounts;
create policy "customer_accounts: self" on public.customer_accounts
  for select to authenticated using (id = auth.uid());
drop policy if exists "customer_accounts: self update" on public.customer_accounts;
create policy "customer_accounts: self update" on public.customer_accounts
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "customer_accounts: workshop staff read" on public.customer_accounts;
create policy "customer_accounts: workshop staff read" on public.customer_accounts
  for select to authenticated using (public.is_my_workshop_customer(id));

drop policy if exists "workshop_customers: self" on public.workshop_customers;
create policy "workshop_customers: self" on public.workshop_customers
  for select to authenticated using (customer_id = auth.uid());
drop policy if exists "workshop_customers: staff" on public.workshop_customers;
create policy "workshop_customers: staff" on public.workshop_customers
  for select to authenticated using (workshop_id = public.my_workshop() and public.staff_can_see_customers());

drop policy if exists "customer_vehicles: owner" on public.customer_vehicles;
create policy "customer_vehicles: owner" on public.customer_vehicles
  for all to authenticated using (customer_id = auth.uid()) with check (customer_id = auth.uid());
drop policy if exists "customer_vehicles: workshop staff read" on public.customer_vehicles;
create policy "customer_vehicles: workshop staff read" on public.customer_vehicles
  for select to authenticated using (public.is_my_workshop_customer(customer_id));

-- Catalogue tables: public when the site is published (and the row is live);
-- staff of the workshop read everything of theirs and edit with the right access.
drop policy if exists "services: public" on public.services;
create policy "services: public" on public.services
  for select to anon, authenticated using (active and public.site_is_published(workshop_id));
drop policy if exists "services: staff read" on public.services;
create policy "services: staff read" on public.services
  for select to authenticated using (workshop_id = public.my_workshop() and public.my_role() is not null);
drop policy if exists "services: staff write" on public.services;
create policy "services: staff write" on public.services
  for all to authenticated
  using (workshop_id = public.my_workshop() and public.has_access('settings', 'full'))
  with check (workshop_id = public.my_workshop() and public.has_access('settings', 'full'));

drop policy if exists "team_members: public" on public.team_members;
create policy "team_members: public" on public.team_members
  for select to anon, authenticated using (is_public and public.site_is_published(workshop_id));
drop policy if exists "team_members: staff read" on public.team_members;
create policy "team_members: staff read" on public.team_members
  for select to authenticated using (workshop_id = public.my_workshop() and public.my_role() is not null);
drop policy if exists "team_members: staff write" on public.team_members;
create policy "team_members: staff write" on public.team_members
  for all to authenticated
  using (workshop_id = public.my_workshop() and (public.has_access('settings', 'full') or public.has_access('users', 'full')))
  with check (workshop_id = public.my_workshop() and (public.has_access('settings', 'full') or public.has_access('users', 'full')));

drop policy if exists "parts: public" on public.parts;
create policy "parts: public" on public.parts
  for select to anon, authenticated using (published and public.site_is_published(workshop_id));
drop policy if exists "parts: staff read" on public.parts;
create policy "parts: staff read" on public.parts
  for select to authenticated using (workshop_id = public.my_workshop() and public.has_access('inventory', 'view'));
drop policy if exists "parts: staff write" on public.parts;
create policy "parts: staff write" on public.parts
  for all to authenticated
  using (workshop_id = public.my_workshop() and public.has_access('inventory', 'full'))
  with check (workshop_id = public.my_workshop() and public.has_access('inventory', 'full'));

drop policy if exists "part_costs: staff read" on public.part_costs;
create policy "part_costs: staff read" on public.part_costs
  for select to authenticated using (workshop_id = public.my_workshop() and public.has_access('inventory', 'view'));
drop policy if exists "part_costs: staff write" on public.part_costs;
create policy "part_costs: staff write" on public.part_costs
  for all to authenticated
  using (workshop_id = public.my_workshop() and public.has_access('inventory', 'full'))
  with check (public.has_access('inventory', 'full'));

grant select, update on public.customer_accounts to authenticated;
grant select on public.workshop_customers to authenticated;
grant select, insert, update, delete on public.customer_vehicles to authenticated;
grant select on public.services, public.team_members, public.parts to anon, authenticated;
grant insert, update, delete on public.services, public.team_members, public.parts to authenticated;
grant select, insert, update, delete on public.part_costs to authenticated;

-- 6. Photo storage ------------------------------------------------------------------
-- Public bucket: anyone can view a file by URL. Only staff of the workshop
-- whose id is the first folder can add, replace or delete files.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workshop-public', 'workshop-public', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "workshop-public: staff upload" on storage.objects;
create policy "workshop-public: staff upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'workshop-public'
    and (storage.foldername(name))[1] = public.my_workshop()::text
    and (public.has_access('settings', 'full') or public.has_access('inventory', 'full') or public.has_access('users', 'full'))
  );

drop policy if exists "workshop-public: staff change" on storage.objects;
create policy "workshop-public: staff change" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'workshop-public'
    and (storage.foldername(name))[1] = public.my_workshop()::text
    and (public.has_access('settings', 'full') or public.has_access('inventory', 'full') or public.has_access('users', 'full'))
  );

drop policy if exists "workshop-public: staff delete" on storage.objects;
create policy "workshop-public: staff delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'workshop-public'
    and (storage.foldername(name))[1] = public.my_workshop()::text
    and (public.has_access('settings', 'full') or public.has_access('inventory', 'full') or public.has_access('users', 'full'))
  );

drop policy if exists "workshop-public: staff list" on storage.objects;
create policy "workshop-public: staff list" on storage.objects
  for select to authenticated
  using (bucket_id = 'workshop-public' and (storage.foldername(name))[1] = public.my_workshop()::text);

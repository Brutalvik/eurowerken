-- EuroWerken: platform super admin (2607521 Alberta Inc.). Safe to re-run.
--
--   platform_admins     accounts with platform access (added by hand, see the end of this file)
--   admin_sessions      "Open as Manager": while a row exists, the admin acts as Manager of that workshop
--   admin_audit         every admin action (sessions, suspensions, settings changes)
--   workshops.status    active or suspended. Suspending takes the customer site offline and locks staff out.
--   platform_settings   one row: platform fee percent (Stripe Connect), support email
--
-- my_workshop() and my_role() now honour an admin session, so every existing RLS rule and function applies
-- to an acting admin exactly as to that workshop's Manager. A suspended workshop's staff get no role.

-- 1. Tables -------------------------------------------------------------------------------------------

create table if not exists public.platform_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.admin_sessions (
  admin_id     uuid primary key references auth.users (id) on delete cascade,
  workshop_id  uuid not null references public.workshops (id) on delete cascade,
  started_at   timestamptz not null default now()
);

create table if not exists public.admin_audit (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid references auth.users (id) on delete set null,
  workshop_id  uuid references public.workshops (id) on delete set null,
  action       text not null,
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists admin_audit_created_idx on public.admin_audit (created_at desc);

create table if not exists public.platform_settings (
  id                    boolean primary key default true check (id),
  platform_fee_percent  numeric(5, 2) not null default 0 check (platform_fee_percent between 0 and 30),
  support_email         text check (support_email is null or support_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references auth.users (id) on delete set null
);
insert into public.platform_settings (id) values (true) on conflict do nothing;

alter table public.workshops add column if not exists status text not null default 'active';
alter table public.workshops add column if not exists suspended_at timestamptz;
alter table public.workshops add column if not exists suspended_reason text;
alter table public.workshops add column if not exists published_before_suspend boolean;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.workshops'::regclass and conname = 'workshops_status_check') then
    alter table public.workshops add constraint workshops_status_check check (status in ('active', 'suspended'));
  end if;
end $$;

-- 2. Who am I, with admin sessions ---------------------------------------------------------------------

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;
grant execute on function public.is_platform_admin() to authenticated;

create or replace function public.my_workshop()
returns uuid
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select s.workshop_id from public.admin_sessions s
     join public.platform_admins a on a.user_id = s.admin_id
     where s.admin_id = auth.uid()),
    (select workshop_id from public.profiles where id = auth.uid())
  )
$$;

create or replace function public.my_role()
returns public.staff_role
language sql stable security definer set search_path = public
as $$
  select case
    when exists (select 1 from public.admin_sessions s join public.platform_admins a on a.user_id = s.admin_id
                 where s.admin_id = auth.uid()) then 'Manager'::public.staff_role
    else (select p.role from public.profiles p join public.workshops w on w.id = p.workshop_id
          where p.id = auth.uid() and p.active and w.status = 'active')
  end
$$;

-- What the ERP needs to start: the effective workshop and role, and whether this is an admin acting.
create or replace function public.my_context()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'is_platform_admin', public.is_platform_admin(),
    'acting', exists (select 1 from public.admin_sessions s join public.platform_admins a on a.user_id = s.admin_id where s.admin_id = auth.uid()),
    'role', public.my_role(),
    'workshop', (select jsonb_build_object('id', w.id, 'name', w.name, 'number', w.number, 'status', w.status)
                 from public.workshops w where w.id = public.my_workshop())
  )
$$;
grant execute on function public.my_context() to authenticated;

-- 3. Admin functions ---------------------------------------------------------------------------------------

create or replace function public.assert_platform_admin()
returns void
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'Platform admin access required'; end if;
end;
$$;

create or replace function public.admin_list_workshops()
returns table (
  id uuid, name text, number text, status text, created_at timestamptz, suspended_reason text,
  owner_email text, staff_count bigint, customer_count bigint, appointment_count bigint, open_repairs bigint,
  site_slug text, site_published boolean)
language plpgsql stable security definer set search_path = public
as $$
begin
  perform public.assert_platform_admin();
  return query
  select w.id, w.name, w.number, w.status, w.created_at, w.suspended_reason,
         (select p.email from public.profiles p where p.workshop_id = w.id and p.role = 'Manager' order by p.created_at limit 1),
         (select count(*) from public.profiles p where p.workshop_id = w.id),
         (select count(*) from public.workshop_customers c where c.workshop_id = w.id),
         (select count(*) from public.appointments a where a.workshop_id = w.id),
         (select count(*) from public.repair_orders r where r.workshop_id = w.id and r.status not in ('completed', 'cancelled')),
         s.slug, s.published
  from public.workshops w
  left join public.workshop_sites s on s.workshop_id = w.id
  order by w.created_at;
end;
$$;

create or replace function public.admin_set_workshop_status(p_workshop uuid, p_status text, p_reason text default null)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  w public.workshops;
begin
  perform public.assert_platform_admin();
  if p_status not in ('active', 'suspended') then raise exception 'Unknown status'; end if;
  select * into w from public.workshops where id = p_workshop for update;
  if w.id is null then raise exception 'Workshop not found'; end if;
  if w.status = p_status then return; end if;

  if p_status = 'suspended' then
    update public.workshops set status = 'suspended', suspended_at = now(), suspended_reason = left(nullif(trim(p_reason), ''), 300),
      published_before_suspend = (select published from public.workshop_sites where workshop_id = w.id)
    where id = w.id;
    update public.workshop_sites set published = false where workshop_id = w.id;
  else
    update public.workshop_sites set published = coalesce(w.published_before_suspend, published) where workshop_id = w.id;
    update public.workshops set status = 'active', suspended_at = null, suspended_reason = null, published_before_suspend = null
    where id = w.id;
  end if;

  insert into public.admin_audit (admin_id, workshop_id, action, detail)
  values (auth.uid(), w.id, 'workshop_' || p_status, jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.admin_start_session(p_workshop uuid)
returns void
language plpgsql volatile security definer set search_path = public
as $$
begin
  perform public.assert_platform_admin();
  if not exists (select 1 from public.workshops where id = p_workshop) then raise exception 'Workshop not found'; end if;
  insert into public.admin_sessions (admin_id, workshop_id) values (auth.uid(), p_workshop)
  on conflict (admin_id) do update set workshop_id = excluded.workshop_id, started_at = now();
  insert into public.admin_audit (admin_id, workshop_id, action) values (auth.uid(), p_workshop, 'session_start');
end;
$$;

create or replace function public.admin_end_session()
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  wid uuid;
begin
  delete from public.admin_sessions where admin_id = auth.uid() returning workshop_id into wid;
  if wid is not null then
    insert into public.admin_audit (admin_id, workshop_id, action) values (auth.uid(), wid, 'session_end');
  end if;
end;
$$;

create or replace function public.admin_update_platform_settings(p_fee numeric, p_support_email text)
returns public.platform_settings
language plpgsql volatile security definer set search_path = public
as $$
declare
  r public.platform_settings;
begin
  perform public.assert_platform_admin();
  update public.platform_settings
  set platform_fee_percent = p_fee, support_email = nullif(trim(p_support_email), ''), updated_at = now(), updated_by = auth.uid()
  where id
  returning * into r;
  insert into public.admin_audit (admin_id, action, detail)
  values (auth.uid(), 'platform_settings', jsonb_build_object('platform_fee_percent', p_fee, 'support_email', p_support_email));
  return r;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'assert_platform_admin()', 'admin_list_workshops()', 'admin_set_workshop_status(uuid, text, text)',
    'admin_start_session(uuid)', 'admin_end_session()', 'admin_update_platform_settings(numeric, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- 4. Row level security --------------------------------------------------------------------------------------

alter table public.platform_admins enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.admin_audit enable row level security;
alter table public.platform_settings enable row level security;

drop policy if exists "platform_admins: admins read" on public.platform_admins;
create policy "platform_admins: admins read" on public.platform_admins
  for select to authenticated using (public.is_platform_admin());
drop policy if exists "admin_sessions: own" on public.admin_sessions;
create policy "admin_sessions: own" on public.admin_sessions
  for select to authenticated using (admin_id = auth.uid());
drop policy if exists "admin_audit: admins read" on public.admin_audit;
create policy "admin_audit: admins read" on public.admin_audit
  for select to authenticated using (public.is_platform_admin());
drop policy if exists "platform_settings: admins read" on public.platform_settings;
create policy "platform_settings: admins read" on public.platform_settings
  for select to authenticated using (public.is_platform_admin());

grant select on public.platform_admins, public.admin_sessions, public.admin_audit, public.platform_settings to authenticated;

-- An acting admin can also read the workshop row (status, name) through the existing "members read" policy,
-- because that policy uses my_workshop().

-- 5. Make yourself platform admin (run once, by hand, with your sign-in email) ----------------------------------
--
--   insert into public.platform_admins (user_id)
--   select id from auth.users where email = 'you@example.com'
--   on conflict do nothing;

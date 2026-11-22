-- EuroWerken ERP: multiple workshops in one database. Safe to re-run.
--
-- Model
--   public.workshops          One row per workshop, with a public 6-digit number.
--   profiles.workshop_id      The one workshop an account belongs to (null until
--                             they create or join one).
--   role_permissions          Now per workshop: each workshop edits its own matrix.
--   public.workshop_invites   Single-use invite links: one email, one preset role,
--                             valid for 7 days.
--
-- Isolation
--   Every workshop-owned table carries workshop_id and its RLS policies check
--   workshop_id = public.my_workshop(). Workshop membership only changes through
--   the functions below (create_workshop, request_join, accept_invite,
--   cancel_join_request), never by a plain update from the app.
--
-- Joining
--   Create a workshop:   you become its Manager.
--   Join by number:      you are added with no role (waiting for approval).
--   Invite link:         you are added with the role the Manager chose.

-- 1. Workshops --------------------------------------------------------------

create table if not exists public.workshops (
  id          uuid primary key default gen_random_uuid(),
  number      text not null unique check (number ~ '^[0-9]{6}$'),
  name        text not null check (length(trim(name)) between 2 and 80),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create or replace function public.new_workshop_number()
returns text
language plpgsql volatile security definer set search_path = public
as $$
declare
  candidate text;
begin
  loop
    candidate := (100000 + floor(random() * 900000))::int::text;
    exit when not exists (select 1 from public.workshops where number = candidate);
  end loop;
  return candidate;
end;
$$;
revoke all on function public.new_workshop_number() from public, anon, authenticated;

alter table public.profiles
  add column if not exists workshop_id uuid references public.workshops (id) on delete set null;
create index if not exists profiles_workshop_idx on public.profiles (workshop_id);

-- 2. Existing accounts move into a first workshop ---------------------------
-- Accounts created before this migration all worked in one workshop. Put them
-- in a workshop called EuroWerken, keeping their roles.

do $$
declare
  wid uuid;
begin
  if exists (select 1 from public.profiles where workshop_id is null and role is not null) then
    insert into public.workshops (number, name, created_by)
    values (
      public.new_workshop_number(),
      'EuroWerken',
      (select id from public.profiles where role = 'Manager' order by created_at limit 1)
    )
    returning id into wid;
    update public.profiles set workshop_id = wid where workshop_id is null;
  end if;
end $$;

-- 3. Permissions per workshop ----------------------------------------------

alter table public.role_permissions
  add column if not exists workshop_id uuid references public.workshops (id) on delete cascade;

-- Default matrix, matching src/auth/rbac.ts. Used for every new workshop.
create or replace function public.seed_workshop_permissions(p_workshop uuid)
returns void
language sql security definer set search_path = public
as $$
  insert into public.role_permissions (workshop_id, role, module, access)
  select p_workshop, d.role::public.staff_role, d.module, d.access
  from (values
    ('Manager', 'dashboard', 'full'), ('Manager', 'inventory', 'full'),
    ('Manager', 'repair-orders', 'full'), ('Manager', 'sales', 'full'),
    ('Manager', 'invoices', 'full'), ('Manager', 'reports', 'full'),
    ('Manager', 'users', 'full'), ('Manager', 'settings', 'full'),
    ('Service Advisor', 'dashboard', 'view'), ('Service Advisor', 'inventory', 'none'),
    ('Service Advisor', 'repair-orders', 'full'), ('Service Advisor', 'sales', 'view'),
    ('Service Advisor', 'invoices', 'full'), ('Service Advisor', 'reports', 'none'),
    ('Service Advisor', 'users', 'none'), ('Service Advisor', 'settings', 'none'),
    ('Parts Staff', 'dashboard', 'view'), ('Parts Staff', 'inventory', 'full'),
    ('Parts Staff', 'repair-orders', 'view'), ('Parts Staff', 'sales', 'view'),
    ('Parts Staff', 'invoices', 'none'), ('Parts Staff', 'reports', 'none'),
    ('Parts Staff', 'users', 'none'), ('Parts Staff', 'settings', 'none'),
    ('Accountant', 'dashboard', 'view'), ('Accountant', 'inventory', 'view'),
    ('Accountant', 'repair-orders', 'view'), ('Accountant', 'sales', 'full'),
    ('Accountant', 'invoices', 'full'), ('Accountant', 'reports', 'full'),
    ('Accountant', 'users', 'none'), ('Accountant', 'settings', 'none')
  ) as d(role, module, access)
  on conflict do nothing
$$;
revoke all on function public.seed_workshop_permissions(uuid) from public, anon, authenticated;

do $$
begin
  -- Old primary key was (role, module); a matrix per workshop needs workshop_id in it.
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.role_permissions'::regclass and contype = 'p'
      and array_length(conkey, 1) = 2
  ) then
    alter table public.role_permissions drop constraint role_permissions_pkey;
  end if;

  -- Copy the old global matrix (with any edits) into every workshop, then drop it.
  if exists (select 1 from public.role_permissions where workshop_id is null) then
    insert into public.role_permissions (workshop_id, role, module, access)
    select w.id, rp.role, rp.module, rp.access
    from public.workshops w cross join public.role_permissions rp
    where rp.workshop_id is null;
    delete from public.role_permissions where workshop_id is null;
  end if;

  alter table public.role_permissions alter column workshop_id set not null;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.role_permissions'::regclass and contype = 'p'
  ) then
    alter table public.role_permissions add primary key (workshop_id, role, module);
  end if;
end $$;

-- Any workshop missing rows (including ones created above) gets the defaults.
select public.seed_workshop_permissions(id) from public.workshops;

-- 4. Who am I -----------------------------------------------------------------

create or replace function public.my_workshop()
returns uuid
language sql stable security definer set search_path = public
as $$
  select workshop_id from public.profiles where id = auth.uid()
$$;

-- A role only counts inside a workshop, and only while the account is active.
create or replace function public.my_role()
returns public.staff_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles
  where id = auth.uid() and active and workshop_id is not null
$$;

create or replace function public.has_access(p_module text, p_level text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select case p_level
             when 'full' then rp.access = 'full'
             else rp.access in ('view', 'full')
           end
    from public.role_permissions rp
    where rp.workshop_id = public.my_workshop()
      and rp.role = public.my_role()
      and rp.module = p_module
  ), false)
$$;

revoke all on function public.my_workshop() from public, anon;
grant execute on function public.my_workshop() to authenticated;

-- 5. Membership changes go through functions only ---------------------------
-- The functions below set this flag for the length of their transaction; the
-- profile trigger refuses workshop_id changes without it.

create or replace function public.allow_membership_change()
returns void
language sql security definer set search_path = public
as $$
  select set_config('eurowerken.membership_change', 'on', true)
$$;
revoke all on function public.allow_membership_change() from public, anon, authenticated;

create or replace function public.profiles_before_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  via_function boolean := coalesce(current_setting('eurowerken.membership_change', true), '') = 'on';
begin
  if auth.uid() is not null and not via_function then
    if new.workshop_id is distinct from old.workshop_id then
      raise exception 'Workshop membership can only change by creating, joining or being invited to a workshop';
    end if;

    if not public.has_access('users', 'full') then
      if new.role is distinct from old.role
         or new.active is distinct from old.active
         or new.email is distinct from old.email
         or new.department is distinct from old.department then
        raise exception 'You do not have permission to change role, status, email or department';
      end if;
    end if;

    if old.id = auth.uid() and (new.role is distinct from old.role or new.active is distinct from old.active) then
      raise exception 'You cannot change your own role or status';
    end if;

    if (new.role = 'Manager' or old.role = 'Manager')
       and new.role is distinct from old.role
       and not public.is_manager() then
      raise exception 'Only a Manager can grant or remove the Manager role';
    end if;
    if old.role = 'Manager' and new.active is distinct from old.active and not public.is_manager() then
      raise exception 'Only a Manager can deactivate a Manager';
    end if;
  end if;

  -- Nobody holds a role outside a workshop.
  if new.workshop_id is null then
    new.role := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Create a workshop and become its Manager.
create or replace function public.create_workshop(p_name text)
returns public.workshops
language plpgsql security definer set search_path = public
as $$
declare
  w public.workshops;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if (select workshop_id from public.profiles where id = auth.uid()) is not null then
    raise exception 'You already belong to a workshop';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Enter a workshop name of at least 2 characters';
  end if;

  insert into public.workshops (number, name, created_by)
  values (public.new_workshop_number(), trim(p_name), auth.uid())
  returning * into w;
  perform public.seed_workshop_permissions(w.id);

  perform public.allow_membership_change();
  update public.profiles set workshop_id = w.id, role = 'Manager', active = true where id = auth.uid();
  return w;
end;
$$;

-- Ask to join a workshop by its number. Joins with no role; a Manager approves.
create or replace function public.request_join(p_number text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  wid uuid;
  wname text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if (select workshop_id from public.profiles where id = auth.uid()) is not null then
    raise exception 'You already belong to a workshop';
  end if;
  select id, name into wid, wname from public.workshops where number = trim(p_number);
  if wid is null then raise exception 'No workshop has that number'; end if;

  perform public.allow_membership_change();
  update public.profiles set workshop_id = wid, role = null where id = auth.uid();
  return wname;
end;
$$;

-- Withdraw a join request that has not been approved yet (wrong number, for example).
create or replace function public.cancel_join_request()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.profiles where id = auth.uid() and workshop_id is not null and role is null) then
    perform public.allow_membership_change();
    update public.profiles set workshop_id = null where id = auth.uid();
  else
    raise exception 'There is no pending request to cancel';
  end if;
end;
$$;

-- For the sign-up form: does this number exist? Answers yes or no only.
create or replace function public.workshop_number_exists(p_number text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.workshops where number = trim(p_number))
$$;

-- 6. New accounts: apply the choice made on the sign-up form ----------------
-- Email sign-up stores workshop_action ('create' or 'join') and its value in
-- the account metadata. Google sign-ups have none and choose after signing in.

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
  if action = 'create' and length(trim(coalesce(meta ->> 'workshop_name', ''))) >= 2 then
    insert into public.workshops (number, name, created_by)
    values (public.new_workshop_number(), trim(meta ->> 'workshop_name'), new.id)
    returning id into wid;
    perform public.seed_workshop_permissions(wid);
    new_role := 'Manager';
  elsif action = 'join' then
    -- An unknown number is ignored; the person picks again after signing in.
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

-- 7. Invites -----------------------------------------------------------------

create table if not exists public.workshop_invites (
  id           uuid primary key default gen_random_uuid(),
  workshop_id  uuid not null references public.workshops (id) on delete cascade,
  email        text not null,
  role         public.staff_role not null,
  token        text not null unique,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users (id) on delete set null
);
create index if not exists workshop_invites_workshop_idx on public.workshop_invites (workshop_id);

-- Manager (or anyone with full Users & Roles access) invites one email with a role.
create or replace function public.create_invite(p_email text, p_role public.staff_role)
returns public.workshop_invites
language plpgsql security definer set search_path = public
as $$
declare
  inv public.workshop_invites;
  clean_email text := lower(trim(coalesce(p_email, '')));
begin
  if not public.has_access('users', 'full') then
    raise exception 'You do not have permission to invite people';
  end if;
  if p_role = 'Manager' and not public.is_manager() then
    raise exception 'Only a Manager can invite a Manager';
  end if;
  if clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if exists (select 1 from public.profiles where lower(email) = clean_email and workshop_id = public.my_workshop()) then
    raise exception 'That person is already in this workshop';
  end if;

  -- One open invite per email per workshop: replace any earlier one.
  delete from public.workshop_invites
  where workshop_id = public.my_workshop() and lower(email) = clean_email and accepted_at is null;

  insert into public.workshop_invites (workshop_id, email, role, token, created_by)
  values (
    public.my_workshop(),
    clean_email,
    p_role,
    replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    auth.uid()
  )
  returning * into inv;
  return inv;
end;
$$;

-- What the invite page shows before sign-in. The token is the secret.
create or replace function public.invite_preview(p_token text)
returns table (workshop_name text, email text, role public.staff_role, status text)
language sql stable security definer set search_path = public
as $$
  select w.name, i.email, i.role,
         case
           when i.accepted_at is not null then 'used'
           when i.expires_at < now() then 'expired'
           else 'valid'
         end
  from public.workshop_invites i
  join public.workshops w on w.id = i.workshop_id
  where i.token = p_token
$$;

-- Accept an invite: signed-in account, email must match, account not already in a workshop.
create or replace function public.accept_invite(p_token text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  inv public.workshop_invites;
  my_email text;
  wname text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into inv from public.workshop_invites where token = p_token for update;
  if inv.id is null then raise exception 'This invite link is not valid'; end if;
  if inv.accepted_at is not null then raise exception 'This invite has already been used'; end if;
  if inv.expires_at < now() then raise exception 'This invite has expired. Ask your manager for a new one'; end if;

  select lower(email) into my_email from auth.users where id = auth.uid();
  if my_email is distinct from lower(inv.email) then
    raise exception 'This invite is for %. Sign in with that email address', inv.email;
  end if;

  if (select workshop_id from public.profiles where id = auth.uid()) is not null then
    if (select workshop_id from public.profiles where id = auth.uid()) = inv.workshop_id
       and (select role from public.profiles where id = auth.uid()) is null then
      null; -- Pending join request at the same workshop: the invite approves it.
    else
      raise exception 'You already belong to a workshop';
    end if;
  end if;

  perform public.allow_membership_change();
  update public.profiles set workshop_id = inv.workshop_id, role = inv.role, active = true where id = auth.uid();
  update public.workshop_invites set accepted_at = now(), accepted_by = auth.uid() where id = inv.id;

  select name into wname from public.workshops where id = inv.workshop_id;
  return wname;
end;
$$;

-- 8. Row level security ------------------------------------------------------

alter table public.workshops enable row level security;
alter table public.workshop_invites enable row level security;

drop policy if exists "workshops: members read" on public.workshops;
create policy "workshops: members read" on public.workshops
  for select to authenticated
  using (id = public.my_workshop());

drop policy if exists "workshops: managers rename" on public.workshops;
create policy "workshops: managers rename" on public.workshops
  for update to authenticated
  using (id = public.my_workshop() and public.is_manager())
  with check (id = public.my_workshop() and public.is_manager());

create or replace function public.workshops_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.number is distinct from old.number or new.id is distinct from old.id
     or new.created_by is distinct from old.created_by then
    raise exception 'Only the workshop name can be changed';
  end if;
  return new;
end;
$$;
drop trigger if exists workshops_before_update on public.workshops;
create trigger workshops_before_update
  before update on public.workshops
  for each row execute function public.workshops_before_update();

-- Profiles: you, plus your own workshop's team if you have Users & Roles access.
drop policy if exists "profiles: user admins read all" on public.profiles;
create policy "profiles: user admins read all" on public.profiles
  for select to authenticated
  using (workshop_id = public.my_workshop() and public.has_access('users', 'view'));

drop policy if exists "profiles: user admins update all" on public.profiles;
create policy "profiles: user admins update all" on public.profiles
  for update to authenticated
  using (workshop_id = public.my_workshop() and public.has_access('users', 'full'))
  with check (workshop_id = public.my_workshop() and public.has_access('users', 'full'));

-- Permissions: your workshop's matrix only.
drop policy if exists "role_permissions: read" on public.role_permissions;
create policy "role_permissions: read" on public.role_permissions
  for select to authenticated
  using (workshop_id = public.my_workshop());

drop policy if exists "role_permissions: managers update" on public.role_permissions;
create policy "role_permissions: managers update" on public.role_permissions
  for update to authenticated
  using (workshop_id = public.my_workshop() and public.is_manager())
  with check (workshop_id = public.my_workshop() and public.is_manager());

create or replace function public.role_permissions_before_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.role = 'Manager' or new.role = 'Manager' then
    raise exception 'The Manager role always has full access and cannot be edited';
  end if;
  if new.role is distinct from old.role or new.module is distinct from old.module
     or new.workshop_id is distinct from old.workshop_id then
    raise exception 'Only the access level can be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Invites: user admins of the workshop can list and revoke. Creating goes through create_invite.
drop policy if exists "invites: user admins read" on public.workshop_invites;
create policy "invites: user admins read" on public.workshop_invites
  for select to authenticated
  using (workshop_id = public.my_workshop() and public.has_access('users', 'full'));

drop policy if exists "invites: user admins revoke" on public.workshop_invites;
create policy "invites: user admins revoke" on public.workshop_invites
  for delete to authenticated
  using (workshop_id = public.my_workshop() and public.has_access('users', 'full') and accepted_at is null);

-- 9. Grants ------------------------------------------------------------------

grant select, update on public.workshops to authenticated;
grant select, delete on public.workshop_invites to authenticated;

revoke all on function public.create_workshop(text) from public, anon;
revoke all on function public.request_join(text) from public, anon;
revoke all on function public.cancel_join_request() from public, anon;
revoke all on function public.create_invite(text, public.staff_role) from public, anon;
revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.create_workshop(text) to authenticated;
grant execute on function public.request_join(text) to authenticated;
grant execute on function public.cancel_join_request() to authenticated;
grant execute on function public.create_invite(text, public.staff_role) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;

revoke all on function public.invite_preview(text) from public;
revoke all on function public.workshop_number_exists(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;
grant execute on function public.workshop_number_exists(text) to anon, authenticated;

-- EuroWerken ERP: open registration (email or Google) and a role permission
-- matrix stored in the database. Safe to re-run.
--
-- Registration
--   Anyone can create an account. A new account has no role, so it can sign
--   in but sees nothing until someone with full Users & Roles access assigns
--   a role. Exception: while the workshop has no Manager at all, the next
--   account to be created becomes Manager, so the owner can bootstrap.
--
-- RBAC
--   public.role_permissions holds the access level (none, view, full) each
--   role has on each module. The app reads it to build navigation, and
--   public.has_access(module, level) lets RLS policies on future tables
--   (parts, invoices, ...) enforce the same rules in the database.

-- 1. Profile picture from Google -------------------------------------------

alter table public.profiles add column if not exists avatar_url text;

-- 2. Permission matrix ------------------------------------------------------

create table if not exists public.role_permissions (
  role        public.staff_role not null,
  module      text not null check (module in (
                'dashboard', 'inventory', 'repair-orders', 'sales',
                'invoices', 'reports', 'users', 'settings')),
  access      text not null check (access in ('none', 'view', 'full')),
  updated_at  timestamptz not null default now(),
  primary key (role, module)
);

-- Defaults, matching src/auth/rbac.ts. Existing rows are left alone so
-- changes made in the app survive a re-run.
insert into public.role_permissions (role, module, access) values
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
on conflict (role, module) do nothing;

-- 3. Access check for RLS -------------------------------------------------
-- has_access('invoices', 'view') is true for view or full; 'full' needs full.
-- Signed-out users, users without a role and deactivated users get false.

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
    where rp.role = public.my_role() and rp.module = p_module
  ), false)
$$;

revoke all on function public.has_access(text, text) from public, anon;
grant execute on function public.has_access(text, text) to authenticated;

-- 4. New accounts: name and picture from email sign-up or Google ------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  first_role public.staff_role := null;
begin
  -- Serialise sign-ups so two accounts cannot both claim the bootstrap Manager slot.
  perform pg_advisory_xact_lock(hashtext('eurowerken.bootstrap_manager'));
  if not exists (select 1 from public.profiles where role = 'Manager' and active) then
    first_role := 'Manager';
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    nullif(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), ''),
    nullif(coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'), ''),
    first_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 5. Profile changes: governed by the matrix, not a hard-coded Manager -----

create or replace function public.profiles_before_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null then
    if not public.has_access('users', 'full') then
      if new.role is distinct from old.role
         or new.active is distinct from old.active
         or new.email is distinct from old.email
         or new.department is distinct from old.department then
        raise exception 'You do not have permission to change role, status, email or department';
      end if;
    end if;

    -- Nobody changes their own role or status, so an admin cannot lock themselves out.
    if old.id = auth.uid() and (new.role is distinct from old.role or new.active is distinct from old.active) then
      raise exception 'You cannot change your own role or status';
    end if;

    -- Only a Manager can make someone a Manager or remove a Manager.
    if (new.role = 'Manager' or old.role = 'Manager')
       and new.role is distinct from old.role
       and not public.is_manager() then
      raise exception 'Only a Manager can grant or remove the Manager role';
    end if;
    if old.role = 'Manager' and new.active is distinct from old.active and not public.is_manager() then
      raise exception 'Only a Manager can deactivate a Manager';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop policy if exists "profiles: managers read all" on public.profiles;
drop policy if exists "profiles: user admins read all" on public.profiles;
create policy "profiles: user admins read all" on public.profiles
  for select to authenticated
  using (public.has_access('users', 'view'));

drop policy if exists "profiles: managers update all" on public.profiles;
drop policy if exists "profiles: user admins update all" on public.profiles;
create policy "profiles: user admins update all" on public.profiles
  for update to authenticated
  using (public.has_access('users', 'full'))
  with check (public.has_access('users', 'full'));

-- 6. Matrix security -------------------------------------------------------
-- Every signed-in user may read it (the app needs it for navigation).
-- Only a Manager may change it, and the Manager role itself is fixed at full
-- so the workshop can never lose access to Users & Roles or Settings.

alter table public.role_permissions enable row level security;

drop policy if exists "role_permissions: read" on public.role_permissions;
create policy "role_permissions: read" on public.role_permissions
  for select to authenticated
  using (true);

drop policy if exists "role_permissions: managers update" on public.role_permissions;
create policy "role_permissions: managers update" on public.role_permissions
  for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());

create or replace function public.role_permissions_before_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.role = 'Manager' or new.role = 'Manager' then
    raise exception 'The Manager role always has full access and cannot be edited';
  end if;
  if new.role is distinct from old.role or new.module is distinct from old.module then
    raise exception 'Only the access level can be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists role_permissions_before_update on public.role_permissions;
create trigger role_permissions_before_update
  before update on public.role_permissions
  for each row execute function public.role_permissions_before_update();

grant select, update on public.role_permissions to authenticated;
grant select, update on public.profiles to authenticated;

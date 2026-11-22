-- EuroWerken ERP: staff profiles and roles on top of Supabase Auth.
-- Safe to re-run. Apply all migrations with: npm run db:migrate
--
-- Model
--   auth.users          Supabase-managed accounts (email + password).
--   public.profiles     One row per account: name, role, department, active.
--                       Created automatically when an account is created.
--   New accounts get NO role. A Manager assigns one in the app (Users & Roles).
--   Only Managers can change roles or deactivate accounts; this is enforced
--   here by row level security, not by the frontend.

-- 1. Roles ------------------------------------------------------------------

do $$ begin
  create type public.staff_role as enum ('Manager', 'Service Advisor', 'Parts Staff', 'Accountant');
exception when duplicate_object then null;
end $$;

-- 2. Profiles ---------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  role        public.staff_role,
  department  text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);

-- 3. Helpers ----------------------------------------------------------------
-- security definer so policies can read profiles without recursing into RLS.

create or replace function public.my_role()
returns public.staff_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_manager()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.my_role() = 'Manager', false)
$$;

revoke all on function public.my_role() from public, anon;
revoke all on function public.is_manager() from public, anon;
grant execute on function public.my_role() to authenticated;
grant execute on function public.is_manager() to authenticated;

-- 4. Create a profile for every new account --------------------------------
-- full_name and department may come from the invite metadata. Role never does:
-- it is always null until a manager sets it, so nobody can sign themselves up as Manager.

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, department)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'department', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at current, and stop non-managers changing protected columns.

create or replace function public.profiles_before_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_manager() and auth.uid() is not null then
    if new.role is distinct from old.role
       or new.active is distinct from old.active
       or new.email is distinct from old.email
       or new.department is distinct from old.department then
      raise exception 'Only a manager can change role, status, email or department';
    end if;
  end if;
  -- A manager cannot remove their own Manager role or deactivate themselves,
  -- so the workshop is never left without a manager by accident.
  if old.id = auth.uid() and (new.role is distinct from old.role or new.active is distinct from old.active) then
    raise exception 'You cannot change your own role or status';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_before_update on public.profiles;
create trigger profiles_before_update
  before update on public.profiles
  for each row execute function public.profiles_before_update();

-- 5. Row level security ----------------------------------------------------

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "profiles: managers read all" on public.profiles;
create policy "profiles: managers read all" on public.profiles
  for select to authenticated
  using (public.is_manager());

-- Staff may edit their own name; the trigger above blocks every other column.
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "profiles: managers update all" on public.profiles;
create policy "profiles: managers update all" on public.profiles
  for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- No insert or delete policies: rows are created by the trigger and removed
-- with the auth account (on delete cascade). Deactivate instead of deleting.

-- 6. Backfill profiles for accounts that existed before this script ---------

insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- 7. First manager ---------------------------------------------------------
-- After creating your own account (Authentication > Users > Add user), run:
--
--   update public.profiles
--   set role = 'Manager', full_name = 'Your Name'
--   where email = 'you@example.com';
--
-- (Run it here in the SQL editor: it bypasses the manager check because
-- auth.uid() is null for the SQL editor.)

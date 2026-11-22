-- EuroWerken: Phase 2, customer accounts. Safe to re-run.
--
--   A "customers" module in the permission matrix (ERP Customers page):
--     Manager full, Service Advisor full, Parts Staff view, Accountant view.
--   Customer notification preferences on customer_accounts.
--   Customers can edit their name, phone and preferences, never their email
--   (that comes from sign-in) or id.

-- 1. Customers module ------------------------------------------------------------

do $$
declare
  c record;
begin
  -- Drop the old module check (it lists the allowed modules) and add one that includes customers.
  for c in
    select conname from pg_constraint
    where conrelid = 'public.role_permissions'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%module%'
  loop
    execute format('alter table public.role_permissions drop constraint %I', c.conname);
  end loop;
  alter table public.role_permissions add constraint role_permissions_module_check check (module in (
    'dashboard', 'inventory', 'repair-orders', 'sales', 'invoices', 'reports', 'users', 'settings', 'customers'));
end $$;

-- Defaults for new workshops now include customers.
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
    ('Manager', 'customers', 'full'),
    ('Service Advisor', 'dashboard', 'view'), ('Service Advisor', 'inventory', 'none'),
    ('Service Advisor', 'repair-orders', 'full'), ('Service Advisor', 'sales', 'view'),
    ('Service Advisor', 'invoices', 'full'), ('Service Advisor', 'reports', 'none'),
    ('Service Advisor', 'users', 'none'), ('Service Advisor', 'settings', 'none'),
    ('Service Advisor', 'customers', 'full'),
    ('Parts Staff', 'dashboard', 'view'), ('Parts Staff', 'inventory', 'full'),
    ('Parts Staff', 'repair-orders', 'view'), ('Parts Staff', 'sales', 'view'),
    ('Parts Staff', 'invoices', 'none'), ('Parts Staff', 'reports', 'none'),
    ('Parts Staff', 'users', 'none'), ('Parts Staff', 'settings', 'none'),
    ('Parts Staff', 'customers', 'view'),
    ('Accountant', 'dashboard', 'view'), ('Accountant', 'inventory', 'view'),
    ('Accountant', 'repair-orders', 'view'), ('Accountant', 'sales', 'full'),
    ('Accountant', 'invoices', 'full'), ('Accountant', 'reports', 'full'),
    ('Accountant', 'users', 'none'), ('Accountant', 'settings', 'none'),
    ('Accountant', 'customers', 'view')
  ) as d(role, module, access)
  on conflict do nothing
$$;
revoke all on function public.seed_workshop_permissions(uuid) from public, anon, authenticated;

-- Existing workshops get the customers rows (existing edits elsewhere are kept).
select public.seed_workshop_permissions(id) from public.workshops;

-- Customer records follow the customers module (plus the roles that already saw them).
create or replace function public.staff_can_see_customers()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_access('customers', 'view')
      or public.has_access('repair-orders', 'view')
      or public.has_access('invoices', 'view')
$$;

-- 2. Notification preferences ------------------------------------------------------

alter table public.customer_accounts add column if not exists notify_email boolean not null default true;
alter table public.customer_accounts add column if not exists notify_sms boolean not null default false;

-- 3. Guard customer self-edits ------------------------------------------------------

create or replace function public.customer_accounts_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'Account id cannot change';
  end if;
  if auth.uid() is not null and new.email is distinct from old.email then
    raise exception 'Email is managed by sign-in and cannot be changed here';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists customer_accounts_updated_at on public.customer_accounts;
drop trigger if exists customer_accounts_before_update on public.customer_accounts;
create trigger customer_accounts_before_update
  before update on public.customer_accounts
  for each row execute function public.customer_accounts_before_update();

-- Staff may never write customer accounts (they only read them).
revoke update on public.customer_accounts from authenticated;
grant update (full_name, phone, avatar_url, notify_email, notify_sms) on public.customer_accounts to authenticated;

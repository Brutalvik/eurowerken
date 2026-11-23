-- EuroWerken: default permissions for the Technician role, and "Reset to defaults" for any role. Safe to re-run.
--
--   default_role_permissions()          the default matrix (one place, used for new workshops and resets)
--   reset_role_permissions(role|null)   Manager only: set one role (or every role) back to the defaults
--                                       in the caller's workshop. The Manager role is always full.

create or replace function public.default_role_permissions()
returns table (role public.staff_role, module text, access text)
language sql immutable
as $$
  select d.role::public.staff_role, d.module, d.access
  from (values
    ('Manager', 'dashboard', 'full'), ('Manager', 'inventory', 'full'), ('Manager', 'repair-orders', 'full'),
    ('Manager', 'sales', 'full'), ('Manager', 'invoices', 'full'), ('Manager', 'reports', 'full'),
    ('Manager', 'users', 'full'), ('Manager', 'settings', 'full'), ('Manager', 'customers', 'full'),

    ('Service Advisor', 'dashboard', 'view'), ('Service Advisor', 'inventory', 'none'), ('Service Advisor', 'repair-orders', 'full'),
    ('Service Advisor', 'sales', 'view'), ('Service Advisor', 'invoices', 'full'), ('Service Advisor', 'reports', 'none'),
    ('Service Advisor', 'users', 'none'), ('Service Advisor', 'settings', 'none'), ('Service Advisor', 'customers', 'full'),

    ('Technician', 'dashboard', 'view'), ('Technician', 'inventory', 'view'), ('Technician', 'repair-orders', 'full'),
    ('Technician', 'sales', 'none'), ('Technician', 'invoices', 'none'), ('Technician', 'reports', 'none'),
    ('Technician', 'users', 'none'), ('Technician', 'settings', 'none'), ('Technician', 'customers', 'view'),

    ('Parts Staff', 'dashboard', 'view'), ('Parts Staff', 'inventory', 'full'), ('Parts Staff', 'repair-orders', 'view'),
    ('Parts Staff', 'sales', 'view'), ('Parts Staff', 'invoices', 'none'), ('Parts Staff', 'reports', 'none'),
    ('Parts Staff', 'users', 'none'), ('Parts Staff', 'settings', 'none'), ('Parts Staff', 'customers', 'view'),

    ('Accountant', 'dashboard', 'view'), ('Accountant', 'inventory', 'view'), ('Accountant', 'repair-orders', 'view'),
    ('Accountant', 'sales', 'full'), ('Accountant', 'invoices', 'full'), ('Accountant', 'reports', 'full'),
    ('Accountant', 'users', 'none'), ('Accountant', 'settings', 'none'), ('Accountant', 'customers', 'view')
  ) as d(role, module, access)
$$;

-- New workshops get the defaults (existing rows are left alone).
create or replace function public.seed_workshop_permissions(p_workshop uuid)
returns void
language sql security definer set search_path = public
as $$
  insert into public.role_permissions (workshop_id, role, module, access)
  select p_workshop, d.role, d.module, d.access from public.default_role_permissions() d
  on conflict do nothing
$$;
revoke all on function public.seed_workshop_permissions(uuid) from public, anon, authenticated;

-- Existing workshops get the Technician rows.
select public.seed_workshop_permissions(id) from public.workshops;

create or replace function public.reset_role_permissions(p_role public.staff_role default null)
returns void
language plpgsql volatile security definer set search_path = public
as $$
begin
  if not public.is_manager() then raise exception 'Only a Manager can reset permissions'; end if;
  if p_role = 'Manager' then return; end if;
  update public.role_permissions rp
  set access = d.access
  from public.default_role_permissions() d
  where rp.workshop_id = public.my_workshop()
    and rp.role = d.role and rp.module = d.module
    and rp.role <> 'Manager'
    and (p_role is null or rp.role = p_role)
    and rp.access is distinct from d.access;
  -- Any default row missing in this workshop is added.
  insert into public.role_permissions (workshop_id, role, module, access)
  select public.my_workshop(), d.role, d.module, d.access from public.default_role_permissions() d
  where p_role is null or d.role = p_role
  on conflict do nothing;
end;
$$;
revoke all on function public.reset_role_permissions(public.staff_role) from public, anon;
grant execute on function public.reset_role_permissions(public.staff_role) to authenticated;

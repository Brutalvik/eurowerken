-- EuroWerken: mute staff notifications for customer messages. Safe to re-run.
--
--   workshop_notification_settings.mute_customer_messages   the shop hears about no customer messages
--   muted_customers                                          the shop hears nothing from these customers (by email,
--                                                            so it covers guests and customers with an account)
--
-- Muting only stops the bell (staff notifications of kind repair_message). The messages themselves still arrive
-- in the repair order. Approvals and bookings are never muted.
-- Changing the shop-wide switch needs Settings (full); muting one customer needs Repair Orders or Customers (full).

create table if not exists public.workshop_notification_settings (
  workshop_id             uuid primary key references public.workshops (id) on delete cascade,
  mute_customer_messages  boolean not null default false,
  updated_by              uuid references auth.users (id) on delete set null,
  updated_at              timestamptz not null default now()
);

create table if not exists public.muted_customers (
  workshop_id  uuid not null references public.workshops (id) on delete cascade,
  email        text not null check (email = lower(trim(email)) and email ~ '^[^@\s]+@[^@\s]+$' and length(email) <= 254),
  muted_by     uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (workshop_id, email)
);

alter table public.workshop_notification_settings enable row level security;
alter table public.muted_customers enable row level security;

drop policy if exists "workshop_notification_settings: staff read" on public.workshop_notification_settings;
create policy "workshop_notification_settings: staff read" on public.workshop_notification_settings
  for select to authenticated
  using (workshop_id = public.my_workshop() and (public.has_access('repair-orders', 'view') or public.has_access('settings', 'view')));
drop policy if exists "muted_customers: staff read" on public.muted_customers;
create policy "muted_customers: staff read" on public.muted_customers
  for select to authenticated
  using (workshop_id = public.my_workshop() and (public.has_access('repair-orders', 'view') or public.has_access('customers', 'view')));

revoke all on public.workshop_notification_settings, public.muted_customers from anon, authenticated;
grant select on public.workshop_notification_settings, public.muted_customers to authenticated;

-- Changes go through these functions only.
create or replace function public.set_customer_messages_muted(p_muted boolean)
returns void
language plpgsql volatile security definer set search_path = public
as $$
begin
  if public.my_workshop() is null or not public.has_access('settings', 'full') then
    raise exception 'You need full access to Settings to change this.';
  end if;
  insert into public.workshop_notification_settings (workshop_id, mute_customer_messages, updated_by, updated_at)
  values (public.my_workshop(), coalesce(p_muted, false), auth.uid(), now())
  on conflict (workshop_id) do update
    set mute_customer_messages = excluded.mute_customer_messages, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end;
$$;

create or replace function public.set_customer_muted(p_email text, p_muted boolean)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
begin
  if public.my_workshop() is null or not (public.has_access('repair-orders', 'full') or public.has_access('customers', 'full')) then
    raise exception 'You need full access to Repair Orders or Customers to change this.';
  end if;
  if e !~ '^[^@\s]+@[^@\s]+$' then raise exception 'This customer has no email to mute by.'; end if;
  if p_muted then
    insert into public.muted_customers (workshop_id, email, muted_by) values (public.my_workshop(), e, auth.uid())
    on conflict do nothing;
  else
    delete from public.muted_customers where workshop_id = public.my_workshop() and email = e;
  end if;
end;
$$;

revoke all on function public.set_customer_messages_muted(boolean) from public, anon;
revoke all on function public.set_customer_muted(text, boolean) from public, anon;
grant execute on function public.set_customer_messages_muted(boolean) to authenticated;
grant execute on function public.set_customer_muted(text, boolean) to authenticated;

-- A customer message whose sender is muted (or all are) makes no staff notification.
create or replace function public.notifications_skip_muted()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  r public.repair_orders;
begin
  if new.kind <> 'repair_message' or new.repair_order_id is null then return new; end if;
  if exists (select 1 from public.workshop_notification_settings where workshop_id = new.workshop_id and mute_customer_messages) then
    return null;
  end if;
  select * into r from public.repair_orders where id = new.repair_order_id;
  if exists (
    select 1 from public.muted_customers m
    where m.workshop_id = new.workshop_id
      and m.email in (lower(trim(r.contact_email)), (select lower(trim(a.email)) from public.customer_accounts a where a.id = r.customer_id))
  ) then
    return null;
  end if;
  return new;
end;
$$;
drop trigger if exists notifications_skip_muted on public.notifications;
create trigger notifications_skip_muted
  before insert on public.notifications
  for each row execute function public.notifications_skip_muted();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'muted_customers') then
      alter publication supabase_realtime add table public.muted_customers;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'workshop_notification_settings') then
      alter publication supabase_realtime add table public.workshop_notification_settings;
    end if;
  end if;
end $$;

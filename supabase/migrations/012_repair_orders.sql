-- EuroWerken: Phase 4 foundation, repair orders created at check-in. Safe to re-run.
--
--   repair_orders         one per job; number RO-0001... per workshop; customer-facing tracking code
--   repair_order_items    line items (service, labour, part, fee) with an approval state
--   repair_order_events   the timeline (check-in, status changes, notes); some visible to the customer
--
--   check_in_appointment(id, technician)   staff: marks the booking checked in and creates its repair
--                                          order with the booking's details (or returns the existing one)
--
-- Staff access follows the repair-orders module (view to read, full to change). Customers can read their
-- own repair orders, their items, and the timeline entries marked visible to them.

-- 1. Numbering --------------------------------------------------------------------------------

create table if not exists public.workshop_counters (
  workshop_id  uuid primary key references public.workshops (id) on delete cascade,
  last_ro      int not null default 0
);

create or replace function public.next_repair_order_number(p_workshop uuid)
returns text
language plpgsql volatile security definer set search_path = public
as $$
declare
  n int;
begin
  insert into public.workshop_counters (workshop_id, last_ro) values (p_workshop, 1)
  on conflict (workshop_id) do update set last_ro = public.workshop_counters.last_ro + 1
  returning last_ro into n;
  return 'RO-' || lpad(n::text, 4, '0');
end;
$$;
revoke all on function public.next_repair_order_number(uuid) from public, anon, authenticated;

-- 2. Tables -------------------------------------------------------------------------------------

do $$ begin
  create type public.repair_order_status as enum
    ('checked_in', 'diagnosing', 'awaiting_approval', 'in_progress', 'quality_check', 'ready', 'completed', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists public.repair_orders (
  id              uuid primary key default gen_random_uuid(),
  workshop_id     uuid not null references public.workshops (id) on delete cascade,
  number          text not null,
  tracking_code   text not null unique,
  appointment_id  uuid unique references public.appointments (id) on delete set null,
  status          public.repair_order_status not null default 'checked_in',
  customer_id     uuid references public.customer_accounts (id) on delete set null,
  vehicle_id      uuid references public.customer_vehicles (id) on delete set null,
  vehicle         jsonb not null default '{}'::jsonb,
  contact_name    text not null,
  contact_email   text,
  contact_phone   text,
  urgency         text not null default 'routine' check (urgency in ('routine', 'soon', 'urgent')),
  technician_id   uuid references public.team_members (id) on delete set null,
  customer_notes  text,
  staff_notes     text check (length(staff_notes) <= 4000),
  labour_rate     numeric(10, 2) not null default 0,
  promised_at     timestamptz,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz,
  unique (workshop_id, number)
);
create index if not exists repair_orders_workshop_idx on public.repair_orders (workshop_id, created_at desc);
create index if not exists repair_orders_customer_idx on public.repair_orders (customer_id);

create table if not exists public.repair_order_items (
  id               uuid primary key default gen_random_uuid(),
  repair_order_id  uuid not null references public.repair_orders (id) on delete cascade,
  workshop_id      uuid not null references public.workshops (id) on delete cascade,
  kind             text not null check (kind in ('service', 'labour', 'part', 'fee')),
  description      text not null check (length(description) between 1 and 300),
  quantity         numeric(10, 2) not null default 1 check (quantity > 0),
  unit_price       numeric(10, 2) not null default 0 check (unit_price >= 0),
  service_id       uuid references public.services (id) on delete set null,
  part_id          uuid references public.parts (id) on delete set null,
  approval         text not null default 'approved' check (approval in ('approved', 'pending', 'declined')),
  sort_order       int not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists repair_order_items_ro_idx on public.repair_order_items (repair_order_id, sort_order);

create table if not exists public.repair_order_events (
  id                   uuid primary key default gen_random_uuid(),
  repair_order_id      uuid not null references public.repair_orders (id) on delete cascade,
  workshop_id          uuid not null references public.workshops (id) on delete cascade,
  kind                 text not null default 'note' check (kind in ('status', 'note', 'check_in', 'approval')),
  title                text not null,
  body                 text,
  visible_to_customer  boolean not null default true,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now()
);
create index if not exists repair_order_events_ro_idx on public.repair_order_events (repair_order_id, created_at);

create or replace function public.repair_orders_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.workshop_id is distinct from old.workshop_id or new.number is distinct from old.number
     or new.tracking_code is distinct from old.tracking_code then
    raise exception 'Workshop, number and tracking code cannot change';
  end if;
  if new.status = 'completed' and old.status is distinct from 'completed' then new.completed_at := now(); end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists repair_orders_before_update on public.repair_orders;
create trigger repair_orders_before_update
  before update on public.repair_orders
  for each row execute function public.repair_orders_before_update();

-- Status changes are written to the timeline automatically.
create or replace function public.repair_orders_status_event()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.repair_order_events (repair_order_id, workshop_id, kind, title, created_by)
    values (new.id, new.workshop_id, 'status',
      case new.status
        when 'checked_in' then 'Vehicle checked in'
        when 'diagnosing' then 'Diagnosis started'
        when 'awaiting_approval' then 'Estimate sent for approval'
        when 'in_progress' then 'Repair in progress'
        when 'quality_check' then 'Quality check'
        when 'ready' then 'Ready for pickup'
        when 'completed' then 'Completed'
        when 'cancelled' then 'Repair order cancelled'
      end,
      auth.uid());
  end if;
  return new;
end;
$$;
drop trigger if exists repair_orders_status_event on public.repair_orders;
create trigger repair_orders_status_event
  after update of status on public.repair_orders
  for each row execute function public.repair_orders_status_event();

-- 3. Check-in ---------------------------------------------------------------------------------------

create or replace function public.check_in_appointment(p_id uuid, p_technician_id uuid default null)
returns table (appointment_id uuid, repair_order_id uuid, repair_order_number text)
language plpgsql volatile security definer set search_path = public
as $$
declare
  a public.appointments;
  ro public.repair_orders;
  tech uuid;
  rate numeric;
  code text;
begin
  if not public.has_access('repair-orders', 'full') then
    raise exception 'You do not have permission to check in vehicles';
  end if;
  select * into a from public.appointments where id = p_id and workshop_id = public.my_workshop() for update;
  if a.id is null then raise exception 'Booking not found'; end if;

  -- Already checked in: return its repair order (safe to press twice).
  select * into ro from public.repair_orders where repair_orders.appointment_id = a.id;
  if ro.id is not null then
    return query select a.id, ro.id, ro.number;
    return;
  end if;

  if a.status not in ('requested', 'confirmed', 'checked_in') then
    raise exception 'Only requested or confirmed bookings can be checked in (this one is %)', a.status;
  end if;

  select tm.id into tech from public.team_members tm
  where tm.id = coalesce(p_technician_id, a.technician_id) and tm.workshop_id = a.workshop_id;
  select coalesce(labour_rate, 0) into rate from public.booking_settings where workshop_id = a.workshop_id;

  loop
    code := 'EW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5)) || '-' || lpad((floor(random() * 1000))::int::text, 3, '0');
    exit when not exists (select 1 from public.repair_orders r where r.tracking_code = code);
  end loop;

  insert into public.repair_orders (
    workshop_id, number, tracking_code, appointment_id, status, customer_id, vehicle_id, vehicle,
    contact_name, contact_email, contact_phone, urgency, technician_id, customer_notes, labour_rate, created_by)
  values (
    a.workshop_id, public.next_repair_order_number(a.workshop_id), code, a.id, 'checked_in', a.customer_id,
    a.vehicle_id, a.vehicle, a.contact_name, a.contact_email, a.contact_phone, a.urgency, tech, a.notes,
    coalesce(rate, 0), auth.uid())
  returning * into ro;

  insert into public.repair_order_items (repair_order_id, workshop_id, kind, description, quantity, unit_price, service_id, approval, sort_order)
  select ro.id, ro.workshop_id, 'service', s ->> 'name', 1, coalesce((s ->> 'price_from')::numeric, 0),
         nullif(s ->> 'id', '')::uuid, 'approved', (row_number() over ())::int * 10
  from jsonb_array_elements(a.services) s;

  insert into public.repair_order_events (repair_order_id, workshop_id, kind, title, body, created_by)
  values (ro.id, ro.workshop_id, 'check_in', 'Vehicle checked in',
          'Booked online as ' || a.reference || coalesce('. Customer notes: ' || a.notes, ''), auth.uid());

  update public.appointments set status = 'checked_in', technician_id = coalesce(tech, technician_id) where id = a.id;

  return query select a.id, ro.id, ro.number;
end;
$$;
revoke all on function public.check_in_appointment(uuid, uuid) from public, anon;
grant execute on function public.check_in_appointment(uuid, uuid) to authenticated;

-- 4. Row level security ----------------------------------------------------------------------------

alter table public.workshop_counters enable row level security;
alter table public.repair_orders enable row level security;
alter table public.repair_order_items enable row level security;
alter table public.repair_order_events enable row level security;

drop policy if exists "repair_orders: staff read" on public.repair_orders;
create policy "repair_orders: staff read" on public.repair_orders
  for select to authenticated using (workshop_id = public.my_workshop() and public.has_access('repair-orders', 'view'));
drop policy if exists "repair_orders: staff write" on public.repair_orders;
create policy "repair_orders: staff write" on public.repair_orders
  for update to authenticated
  using (workshop_id = public.my_workshop() and public.has_access('repair-orders', 'full'))
  with check (workshop_id = public.my_workshop() and public.has_access('repair-orders', 'full'));
drop policy if exists "repair_orders: customer reads own" on public.repair_orders;
create policy "repair_orders: customer reads own" on public.repair_orders
  for select to authenticated using (customer_id = auth.uid());

drop policy if exists "repair_order_items: staff read" on public.repair_order_items;
create policy "repair_order_items: staff read" on public.repair_order_items
  for select to authenticated using (workshop_id = public.my_workshop() and public.has_access('repair-orders', 'view'));
drop policy if exists "repair_order_items: staff write" on public.repair_order_items;
create policy "repair_order_items: staff write" on public.repair_order_items
  for all to authenticated
  using (workshop_id = public.my_workshop() and public.has_access('repair-orders', 'full'))
  with check (workshop_id = public.my_workshop() and public.has_access('repair-orders', 'full')
              and exists (select 1 from public.repair_orders r where r.id = repair_order_id and r.workshop_id = public.my_workshop()));
drop policy if exists "repair_order_items: customer reads own" on public.repair_order_items;
create policy "repair_order_items: customer reads own" on public.repair_order_items
  for select to authenticated
  using (exists (select 1 from public.repair_orders r where r.id = repair_order_id and r.customer_id = auth.uid()));

drop policy if exists "repair_order_events: staff read" on public.repair_order_events;
create policy "repair_order_events: staff read" on public.repair_order_events
  for select to authenticated using (workshop_id = public.my_workshop() and public.has_access('repair-orders', 'view'));
drop policy if exists "repair_order_events: staff write" on public.repair_order_events;
create policy "repair_order_events: staff write" on public.repair_order_events
  for insert to authenticated
  with check (workshop_id = public.my_workshop() and public.has_access('repair-orders', 'full')
              and exists (select 1 from public.repair_orders r where r.id = repair_order_id and r.workshop_id = public.my_workshop()));
drop policy if exists "repair_order_events: customer reads visible" on public.repair_order_events;
create policy "repair_order_events: customer reads visible" on public.repair_order_events
  for select to authenticated
  using (visible_to_customer and exists (select 1 from public.repair_orders r where r.id = repair_order_id and r.customer_id = auth.uid()));

grant select, update on public.repair_orders to authenticated;
grant select, insert, update, delete on public.repair_order_items to authenticated;
grant select, insert on public.repair_order_events to authenticated;

-- Live updates for the ERP and the customer's tracking page.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'repair_orders') then
      alter publication supabase_realtime add table public.repair_orders;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'repair_order_events') then
      alter publication supabase_realtime add table public.repair_order_events;
    end if;
  end if;
end $$;

-- EuroWerken: Phase 3, real bookings. Safe to re-run.
--
--   booking_settings    per workshop: time zone, slot length, bays (cars per slot), minimum notice,
--                       how far ahead, auto-confirm
--   workshop_hours      opening hours per weekday (0 = Sunday ... 6 = Saturday)
--   workshop_closures   closed dates (holidays)
--   appointments        bookings, with a snapshot of the car, services and contact details
--
--   available_slots(slug, from, to)   public: free start times for a published site
--   book_appointment(slug, booking)   public: checks the slot again, creates the booking
--   cancel_my_appointment(id)         customer: cancels their own upcoming booking
--
-- Staff access follows the repair-orders module: view to see, full to create and change.

-- 1. Settings, hours, closures ---------------------------------------------------------

create table if not exists public.booking_settings (
  workshop_id       uuid primary key references public.workshops (id) on delete cascade,
  time_zone         text not null default 'America/Edmonton',
  slot_minutes      int not null default 30 check (slot_minutes in (15, 20, 30, 45, 60)),
  bays              int not null default 2 check (bays between 1 and 50),
  min_notice_hours  int not null default 2 check (min_notice_hours between 0 and 168),
  max_days_ahead    int not null default 90 check (max_days_ahead between 1 and 365),
  auto_confirm      boolean not null default false,
  updated_at        timestamptz not null default now()
);

create table if not exists public.workshop_hours (
  workshop_id  uuid not null references public.workshops (id) on delete cascade,
  weekday      int not null check (weekday between 0 and 6),
  closed       boolean not null default false,
  opens        time,
  closes       time,
  primary key (workshop_id, weekday),
  check (closed or (opens is not null and closes is not null and opens < closes))
);

create table if not exists public.workshop_closures (
  id           uuid primary key default gen_random_uuid(),
  workshop_id  uuid not null references public.workshops (id) on delete cascade,
  day          date not null,
  reason       text check (length(reason) <= 80),
  unique (workshop_id, day)
);

create or replace function public.seed_booking_defaults(p_workshop uuid)
returns void
language sql security definer set search_path = public
as $$
  insert into public.booking_settings (workshop_id) values (p_workshop) on conflict do nothing;
  insert into public.workshop_hours (workshop_id, weekday, closed, opens, closes)
  select p_workshop, d.wd, d.closed, d.opens::time, d.closes::time
  from (values
    (0, true, null, null),
    (1, false, '08:00', '18:00'), (2, false, '08:00', '18:00'), (3, false, '08:00', '18:00'),
    (4, false, '08:00', '18:00'), (5, false, '08:00', '18:00'),
    (6, false, '09:00', '14:00')
  ) as d(wd, closed, opens, closes)
  on conflict do nothing;
$$;
revoke all on function public.seed_booking_defaults(uuid) from public, anon, authenticated;

create or replace function public.workshops_after_insert_booking()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.seed_booking_defaults(new.id);
  return new;
end;
$$;
drop trigger if exists workshops_after_insert_booking on public.workshops;
create trigger workshops_after_insert_booking
  after insert on public.workshops
  for each row execute function public.workshops_after_insert_booking();

select public.seed_booking_defaults(id) from public.workshops;

-- 2. Appointments ------------------------------------------------------------------------

do $$ begin
  create type public.appointment_status as enum ('requested', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show');
exception when duplicate_object then null;
end $$;

create table if not exists public.appointments (
  id                 uuid primary key default gen_random_uuid(),
  workshop_id        uuid not null references public.workshops (id) on delete cascade,
  reference          text not null unique,
  status             public.appointment_status not null default 'requested',
  starts_at          timestamptz not null,
  duration_minutes   int not null default 60 check (duration_minutes between 15 and 600),
  customer_id        uuid references public.customer_accounts (id) on delete set null,
  vehicle_id         uuid references public.customer_vehicles (id) on delete set null,
  vehicle            jsonb not null default '{}'::jsonb,   -- {make, model, year, vin, plate}
  services           jsonb not null default '[]'::jsonb,   -- [{id, name, price_from}]
  urgency            text not null default 'routine' check (urgency in ('routine', 'soon', 'urgent')),
  notes              text check (length(notes) <= 2000),
  technician_id      uuid references public.team_members (id) on delete set null,
  contact_name       text not null check (length(contact_name) between 1 and 120),
  contact_email      text not null check (contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone      text check (length(contact_phone) <= 40),
  remind_email       boolean not null default true,
  remind_sms         boolean not null default false,
  estimate_low       numeric(10, 2),
  estimate_high      numeric(10, 2),
  deposit_requested  boolean not null default false,
  source             text not null default 'online' check (source in ('online', 'staff')),
  staff_notes        text check (length(staff_notes) <= 2000),
  cancel_reason      text check (length(cancel_reason) <= 300),
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  confirmed_at       timestamptz,
  cancelled_at       timestamptz
);
create index if not exists appointments_workshop_time_idx on public.appointments (workshop_id, starts_at);
create index if not exists appointments_customer_idx on public.appointments (customer_id);

create or replace function public.appointments_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.workshop_id is distinct from old.workshop_id or new.reference is distinct from old.reference then
      raise exception 'Workshop and reference cannot change';
    end if;
    if new.status = 'confirmed' and old.status is distinct from 'confirmed' then new.confirmed_at := now(); end if;
    if new.status = 'cancelled' and old.status is distinct from 'cancelled' then new.cancelled_at := now(); end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists appointments_before_write on public.appointments;
create trigger appointments_before_write
  before insert or update on public.appointments
  for each row execute function public.appointments_before_write();

-- 3. Availability -------------------------------------------------------------------------
-- Free start times between two dates (inclusive), in the workshop's time zone. A start time is
-- free while fewer than `bays` active appointments overlap it, it is inside opening hours,
-- not on a closed date, at least min_notice_hours away and within max_days_ahead.

create or replace function public.available_slots_for(p_workshop uuid, p_from date, p_to date)
returns table (starts_at timestamptz, remaining int)
language plpgsql stable security definer set search_path = public
as $$
declare
  s public.booking_settings;
  d date;
  h public.workshop_hours;
  t timestamptz;
  day_end timestamptz;
  used int;
  last_day date;
begin
  select * into s from public.booking_settings where workshop_id = p_workshop;
  if s.workshop_id is null then return; end if;
  last_day := least(p_to, (now() at time zone s.time_zone)::date + s.max_days_ahead, p_from + 62);
  d := greatest(p_from, (now() at time zone s.time_zone)::date);
  while d <= last_day loop
    select * into h from public.workshop_hours where workshop_id = p_workshop and weekday = extract(dow from d)::int;
    if h.workshop_id is not null and not h.closed
       and not exists (select 1 from public.workshop_closures c where c.workshop_id = p_workshop and c.day = d) then
      t := (d + h.opens) at time zone s.time_zone;
      day_end := (d + h.closes) at time zone s.time_zone;
      while t + make_interval(mins => s.slot_minutes) <= day_end loop
        if t >= now() + make_interval(hours => s.min_notice_hours) then
          select count(*) into used from public.appointments a
          where a.workshop_id = p_workshop
            and a.status in ('requested', 'confirmed', 'checked_in')
            and a.starts_at < t + make_interval(mins => s.slot_minutes)
            and a.starts_at + make_interval(mins => a.duration_minutes) > t;
          if used < s.bays then
            starts_at := t;
            remaining := s.bays - used;
            return next;
          end if;
        end if;
        t := t + make_interval(mins => s.slot_minutes);
      end loop;
    end if;
    d := d + 1;
  end loop;
end;
$$;
revoke all on function public.available_slots_for(uuid, date, date) from public, anon, authenticated;

create or replace function public.available_slots(p_slug text, p_from date, p_to date)
returns table (starts_at timestamptz, remaining int)
language sql stable security definer set search_path = public
as $$
  select a.starts_at, a.remaining
  from public.workshop_sites ws
  cross join lateral public.available_slots_for(ws.workshop_id, p_from, p_to) a
  where ws.slug = lower(trim(p_slug)) and ws.published
$$;
grant execute on function public.available_slots(text, date, date) to anon, authenticated;

-- 4. Booking -----------------------------------------------------------------------------------
-- p jsonb: starts_at, vehicle {make, model, year, vin, plate}, vehicle_id, service_ids [uuid],
-- urgency, notes, technician_id, contact_name, contact_email, contact_phone, remind_email,
-- remind_sms, deposit_requested. Prices and service names are read from the database, not trusted
-- from the browser.

create or replace function public.book_appointment(p_slug text, p jsonb)
returns table (id uuid, reference text, status public.appointment_status, starts_at timestamptz)
language plpgsql volatile security definer set search_path = public
as $$
declare
  wid uuid;
  s public.booking_settings;
  t timestamptz := (p ->> 'starts_at')::timestamptz;
  svc jsonb;
  low numeric;
  high numeric;
  ref text;
  new_id uuid;
  st public.appointment_status;
  cust uuid := null;
  veh uuid := null;
  tech uuid := null;
begin
  select workshop_id into wid from public.workshop_sites where slug = lower(trim(p_slug)) and published;
  if wid is null then raise exception 'Workshop not found'; end if;
  select * into s from public.booking_settings where workshop_id = wid;

  -- Serialise bookings per workshop so two people cannot take the last bay at once.
  perform pg_advisory_xact_lock(hashtext('eurowerken.booking.' || wid::text));
  if not exists (
    select 1 from public.available_slots_for(wid, (t at time zone s.time_zone)::date, (t at time zone s.time_zone)::date) a
    where a.starts_at = t
  ) then
    raise exception 'That time is no longer available. Please choose another.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'price_from', x.price_from) order by x.sort_order), '[]'::jsonb),
         coalesce(sum(x.price_from), 0), coalesce(sum(x.price_from), 0) * 1.5
    into svc, low, high
  from public.services x
  where x.workshop_id = wid and x.active
    and x.id in (select jsonb_array_elements_text(coalesce(p -> 'service_ids', '[]'::jsonb))::uuid);
  if jsonb_array_length(svc) = 0 and length(trim(coalesce(p ->> 'notes', ''))) < 3 then
    raise exception 'Choose a service or describe the problem';
  end if;

  if auth.uid() is not null and exists (select 1 from public.customer_accounts where customer_accounts.id = auth.uid()) then
    cust := auth.uid();
    insert into public.workshop_customers (workshop_id, customer_id) values (wid, cust) on conflict do nothing;
    select v.id into veh from public.customer_vehicles v where v.id = nullif(p ->> 'vehicle_id', '')::uuid and v.customer_id = cust;
  end if;
  select tm.id into tech from public.team_members tm
  where tm.id = nullif(p ->> 'technician_id', '')::uuid and tm.workshop_id = wid and tm.is_public;

  loop
    ref := 'EW-BK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.appointments a where a.reference = ref);
  end loop;
  st := case when s.auto_confirm then 'confirmed'::public.appointment_status else 'requested'::public.appointment_status end;

  insert into public.appointments (
    workshop_id, reference, status, starts_at, duration_minutes, customer_id, vehicle_id, vehicle, services,
    urgency, notes, technician_id, contact_name, contact_email, contact_phone, remind_email, remind_sms,
    estimate_low, estimate_high, deposit_requested, source, created_by, confirmed_at)
  values (
    wid, ref, st, t, s.slot_minutes * greatest(1, least(8, jsonb_array_length(svc))), cust, veh,
    jsonb_build_object(
      'make', left(coalesce(p -> 'vehicle' ->> 'make', ''), 40),
      'model', left(coalesce(p -> 'vehicle' ->> 'model', ''), 60),
      'year', nullif(p -> 'vehicle' ->> 'year', ''),
      'vin', nullif(upper(p -> 'vehicle' ->> 'vin'), ''),
      'plate', nullif(p -> 'vehicle' ->> 'plate', '')),
    svc,
    coalesce(nullif(p ->> 'urgency', ''), 'routine'),
    nullif(trim(p ->> 'notes'), ''),
    tech,
    trim(p ->> 'contact_name'),
    lower(trim(p ->> 'contact_email')),
    nullif(trim(p ->> 'contact_phone'), ''),
    coalesce((p ->> 'remind_email')::boolean, true),
    coalesce((p ->> 'remind_sms')::boolean, false),
    nullif(low, 0), nullif(high, 0),
    coalesce((p ->> 'deposit_requested')::boolean, false),
    'online', auth.uid(),
    case when st = 'confirmed' then now() end)
  returning appointments.id into new_id;

  return query select new_id, ref, st, t;
end;
$$;
grant execute on function public.book_appointment(text, jsonb) to anon, authenticated;

-- Customers cancel their own upcoming booking (not within 2 hours of the start).
create or replace function public.cancel_my_appointment(p_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.appointments
  set status = 'cancelled', cancel_reason = left(nullif(trim(p_reason), ''), 300)
  where id = p_id and customer_id = auth.uid()
    and status in ('requested', 'confirmed')
    and starts_at > now() + interval '2 hours';
  if not found then raise exception 'This booking cannot be cancelled online. Please call the workshop.'; end if;
end;
$$;
revoke all on function public.cancel_my_appointment(uuid, text) from public, anon;
grant execute on function public.cancel_my_appointment(uuid, text) to authenticated;

-- 5. Row level security ---------------------------------------------------------------------------

alter table public.booking_settings enable row level security;
alter table public.workshop_hours enable row level security;
alter table public.workshop_closures enable row level security;
alter table public.appointments enable row level security;

-- Hours, closures and settings: public for published sites; staff read; Settings-full staff edit.
do $$
declare
  t text;
begin
  foreach t in array array['booking_settings', 'workshop_hours', 'workshop_closures'] loop
    execute format('drop policy if exists "%s: public" on public.%I', t, t);
    execute format('create policy "%s: public" on public.%I for select to anon, authenticated using (public.site_is_published(workshop_id))', t, t);
    execute format('drop policy if exists "%s: staff read" on public.%I', t, t);
    execute format('create policy "%s: staff read" on public.%I for select to authenticated using (workshop_id = public.my_workshop() and public.my_role() is not null)', t, t);
    execute format('drop policy if exists "%s: staff write" on public.%I', t, t);
    execute format('create policy "%s: staff write" on public.%I for all to authenticated using (workshop_id = public.my_workshop() and public.has_access(''settings'', ''full'')) with check (workshop_id = public.my_workshop() and public.has_access(''settings'', ''full''))', t, t);
  end loop;
end $$;

grant select on public.booking_settings, public.workshop_hours, public.workshop_closures to anon, authenticated;
grant insert, update, delete on public.booking_settings, public.workshop_hours, public.workshop_closures to authenticated;

-- Appointments: customers read their own; staff read with repair-orders view, write with full.
drop policy if exists "appointments: customer reads own" on public.appointments;
create policy "appointments: customer reads own" on public.appointments
  for select to authenticated using (customer_id = auth.uid());

drop policy if exists "appointments: staff read" on public.appointments;
create policy "appointments: staff read" on public.appointments
  for select to authenticated using (workshop_id = public.my_workshop() and public.has_access('repair-orders', 'view'));

drop policy if exists "appointments: staff write" on public.appointments;
create policy "appointments: staff write" on public.appointments
  for all to authenticated
  using (workshop_id = public.my_workshop() and public.has_access('repair-orders', 'full'))
  with check (workshop_id = public.my_workshop() and public.has_access('repair-orders', 'full'));

grant select on public.appointments to authenticated;
grant insert, update, delete on public.appointments to authenticated;

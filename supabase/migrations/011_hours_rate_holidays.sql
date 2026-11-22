-- EuroWerken: labour rate, holiday region, and bookings always inside shop hours. Safe to re-run.
--
--   booking_settings.labour_rate     standard hourly labour rate (CAD), used for estimates and repair orders
--   booking_settings.holiday_region  province (or CA for federal) used to suggest Canadian holidays in the ERP
--   Holidays themselves are rows in workshop_closures (added from the ERP).
--
--   Every appointment that is created, or whose start time changes, must start inside that day's opening
--   hours, on the slot grid (slot_minutes from opening), not on a closed weekday or closure, and early enough
--   for one slot before closing. This applies to online and staff bookings alike.

alter table public.booking_settings add column if not exists labour_rate numeric(10, 2) not null default 0;
alter table public.booking_settings add column if not exists holiday_region text not null default 'AB';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.booking_settings'::regclass and conname = 'booking_settings_labour_rate_check') then
    alter table public.booking_settings add constraint booking_settings_labour_rate_check check (labour_rate between 0 and 1000);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.booking_settings'::regclass and conname = 'booking_settings_holiday_region_check') then
    alter table public.booking_settings add constraint booking_settings_holiday_region_check
      check (holiday_region in ('CA', 'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'));
  end if;
end $$;

-- Opening and closing times on the hour or half hour only.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.workshop_hours'::regclass and conname = 'workshop_hours_half_hour_check') then
    alter table public.workshop_hours add constraint workshop_hours_half_hour_check
      check (closed or (extract(minute from opens)::int % 30 = 0 and extract(minute from closes)::int % 30 = 0)) not valid;
  end if;
end $$;

-- Why a start time is not bookable, or null when it is.
create or replace function public.appointment_time_problem(p_workshop uuid, p_starts_at timestamptz)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  s public.booking_settings;
  h public.workshop_hours;
  local_ts timestamp;
  d date;
  t time;
  c public.workshop_closures;
begin
  select * into s from public.booking_settings where workshop_id = p_workshop;
  if s.workshop_id is null then return null; end if;
  local_ts := p_starts_at at time zone s.time_zone;
  d := local_ts::date;
  t := local_ts::time;

  select * into c from public.workshop_closures where workshop_id = p_workshop and day = d;
  if c.id is not null then
    return 'The workshop is closed on ' || to_char(d, 'FMDay DD Mon') || coalesce(' (' || c.reason || ')', '') || '.';
  end if;

  select * into h from public.workshop_hours where workshop_id = p_workshop and weekday = extract(dow from d)::int;
  if h.workshop_id is null or h.closed then
    return 'The workshop is closed on ' || to_char(d, 'FMDay') || 's.';
  end if;
  if t < h.opens or t + make_interval(mins => s.slot_minutes) > h.closes then
    return 'That time is outside opening hours (' || to_char(h.opens, 'HH24:MI') || ' to ' || to_char(h.closes, 'HH24:MI') || ').';
  end if;
  if (extract(epoch from (t - h.opens))::int / 60) % s.slot_minutes <> 0 then
    return 'Start times must be on the ' || s.slot_minutes || '-minute grid from opening (' || to_char(h.opens, 'HH24:MI') || ').';
  end if;
  return null;
end;
$$;
grant execute on function public.appointment_time_problem(uuid, timestamptz) to authenticated;

create or replace function public.appointments_check_hours()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  problem text;
begin
  if new.status in ('cancelled', 'no_show') then return new; end if;
  if tg_op = 'UPDATE' and new.starts_at is not distinct from old.starts_at then return new; end if;
  problem := public.appointment_time_problem(new.workshop_id, new.starts_at);
  if problem is not null then raise exception '%', problem; end if;
  return new;
end;
$$;

drop trigger if exists appointments_check_hours on public.appointments;
create trigger appointments_check_hours
  before insert or update of starts_at on public.appointments
  for each row execute function public.appointments_check_hours();

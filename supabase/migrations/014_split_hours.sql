-- EuroWerken: a second opening period per day ("Add hours", for example closed over lunch). Safe to re-run.
--
--   workshop_hours.opens2 / closes2   optional second period, after the first (opens < closes <= opens2 < closes2)
--   Free slots and the booking rule use both periods; nothing can be booked in the gap.

alter table public.workshop_hours add column if not exists opens2 time;
alter table public.workshop_hours add column if not exists closes2 time;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.workshop_hours'::regclass and conname = 'workshop_hours_second_period_check') then
    alter table public.workshop_hours add constraint workshop_hours_second_period_check check (
      (opens2 is null and closes2 is null)
      or (opens2 is not null and closes2 is not null and closes is not null and closes <= opens2 and opens2 < closes2
          and extract(minute from opens2)::int % 30 = 0 and extract(minute from closes2)::int % 30 = 0)
    );
  end if;
end $$;

-- Free start times, now over one or two periods per day.
create or replace function public.available_slots_for(p_workshop uuid, p_from date, p_to date)
returns table (starts_at timestamptz, remaining int)
language plpgsql stable security definer set search_path = public
as $$
declare
  s public.booking_settings;
  d date;
  h public.workshop_hours;
  t timestamptz;
  period_end timestamptz;
  used int;
  last_day date;
  p int;
  p_open time;
  p_close time;
begin
  select * into s from public.booking_settings where workshop_id = p_workshop;
  if s.workshop_id is null then return; end if;
  last_day := least(p_to, (now() at time zone s.time_zone)::date + s.max_days_ahead, p_from + 62);
  d := greatest(p_from, (now() at time zone s.time_zone)::date);
  while d <= last_day loop
    select * into h from public.workshop_hours where workshop_id = p_workshop and weekday = extract(dow from d)::int;
    if h.workshop_id is not null and not h.closed
       and not exists (select 1 from public.workshop_closures c where c.workshop_id = p_workshop and c.day = d) then
      for p in 1..2 loop
        p_open := case p when 1 then h.opens else h.opens2 end;
        p_close := case p when 1 then h.closes else h.closes2 end;
        continue when p_open is null or p_close is null;
        t := (d + p_open) at time zone s.time_zone;
        period_end := (d + p_close) at time zone s.time_zone;
        while t + make_interval(mins => s.slot_minutes) <= period_end loop
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
      end loop;
    end if;
    d := d + 1;
  end loop;
end;
$$;
revoke all on function public.available_slots_for(uuid, date, date) from public, anon, authenticated;

-- The booking rule, now over one or two periods.
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
  in1 boolean;
  in2 boolean;
  hours_text text;
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

  hours_text := to_char(h.opens, 'HH24:MI') || ' to ' || to_char(h.closes, 'HH24:MI')
    || coalesce(' and ' || to_char(h.opens2, 'HH24:MI') || ' to ' || to_char(h.closes2, 'HH24:MI'), '');
  in1 := t >= h.opens and t + make_interval(mins => s.slot_minutes) <= h.closes
         and (extract(epoch from (t - h.opens))::int / 60) % s.slot_minutes = 0;
  in2 := h.opens2 is not null and t >= h.opens2 and t + make_interval(mins => s.slot_minutes) <= h.closes2
         and (extract(epoch from (t - h.opens2))::int / 60) % s.slot_minutes = 0;
  if in1 or in2 then return null; end if;
  if (t >= h.opens and t < h.closes) or (h.opens2 is not null and t >= h.opens2 and t < h.closes2) then
    return 'Start times must be on the ' || s.slot_minutes || '-minute grid within opening hours (' || hours_text || ').';
  end if;
  return 'That time is outside opening hours (' || hours_text || ').';
end;
$$;
grant execute on function public.appointment_time_problem(uuid, timestamptz) to authenticated;

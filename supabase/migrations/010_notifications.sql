-- EuroWerken: staff notifications for bookings, delivered in real time. Safe to re-run.
--
--   notifications        one row per event in a workshop (new booking, customer cancelled)
--   notification_reads   which staff member has read which notification (per-user unread counts)
--   appointments.staff_opened_at   set when any staff member first opens a booking
--                                  (drives the "unopened bookings" count next to Appointments)
--
-- Notifications are created by triggers, never by the browser. Staff of the workshop with
-- repair-orders view can read them. Realtime is enabled for notifications and appointments;
-- Supabase Realtime applies the same RLS, so each workshop only hears its own events.

alter table public.appointments add column if not exists staff_opened_at timestamptz;

create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  workshop_id     uuid not null references public.workshops (id) on delete cascade,
  kind            text not null check (kind in ('booking_created', 'booking_cancelled')),
  appointment_id  uuid references public.appointments (id) on delete cascade,
  title           text not null,
  body            text,
  created_at      timestamptz not null default now()
);
create index if not exists notifications_workshop_idx on public.notifications (workshop_id, created_at desc);

create table if not exists public.notification_reads (
  notification_id  uuid not null references public.notifications (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  read_at          timestamptz not null default now(),
  primary key (notification_id, user_id)
);

-- Booking events become notifications.
create or replace function public.appointments_notify()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  tz text;
  when_text text;
begin
  select coalesce(time_zone, 'UTC') into tz from public.booking_settings where workshop_id = new.workshop_id;
  when_text := to_char(new.starts_at at time zone coalesce(tz, 'UTC'), 'Dy DD Mon, HH24:MI');

  if tg_op = 'INSERT' and new.source = 'online' then
    insert into public.notifications (workshop_id, kind, appointment_id, title, body)
    values (
      new.workshop_id, 'booking_created', new.id,
      'New booking: ' || new.contact_name,
      when_text || coalesce(' · ' || nullif(trim(concat_ws(' ', new.vehicle ->> 'year', new.vehicle ->> 'make', new.vehicle ->> 'model')), ''), '')
        || ' · ' || new.reference
    );
  elsif tg_op = 'UPDATE' and new.status = 'cancelled' and old.status is distinct from 'cancelled'
        and auth.uid() is not null and auth.uid() = new.customer_id then
    insert into public.notifications (workshop_id, kind, appointment_id, title, body)
    values (new.workshop_id, 'booking_cancelled', new.id,
            'Booking cancelled by ' || new.contact_name,
            when_text || ' · ' || new.reference || coalesce(' · "' || new.cancel_reason || '"', ''));
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_notify on public.appointments;
create trigger appointments_notify
  after insert or update on public.appointments
  for each row execute function public.appointments_notify();

-- Staff mark a booking as opened (first opener wins; later opens change nothing).
create or replace function public.mark_appointment_opened(p_id uuid)
returns void
language sql security definer set search_path = public
as $$
  update public.appointments set staff_opened_at = now()
  where id = p_id and staff_opened_at is null
    and workshop_id = public.my_workshop() and public.has_access('repair-orders', 'view')
$$;

-- Mark notifications read for the signed-in staff member (all of them when p_ids is null).
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language sql security definer set search_path = public
as $$
  insert into public.notification_reads (notification_id, user_id)
  select n.id, auth.uid() from public.notifications n
  where n.workshop_id = public.my_workshop() and public.has_access('repair-orders', 'view')
    and (p_ids is null or n.id = any (p_ids))
  on conflict do nothing
$$;

revoke all on function public.mark_appointment_opened(uuid) from public, anon;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_appointment_opened(uuid) to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;

drop policy if exists "notifications: staff read" on public.notifications;
create policy "notifications: staff read" on public.notifications
  for select to authenticated
  using (workshop_id = public.my_workshop() and public.has_access('repair-orders', 'view'));

drop policy if exists "notification_reads: own" on public.notification_reads;
create policy "notification_reads: own" on public.notification_reads
  for select to authenticated using (user_id = auth.uid());

grant select on public.notifications, public.notification_reads to authenticated;

-- Realtime: broadcast inserts and changes on these tables (RLS still decides who receives them).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications') then
      alter publication supabase_realtime add table public.notifications;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'appointments') then
      alter publication supabase_realtime add table public.appointments;
    end if;
  end if;
end $$;

-- Bookings made before this migration count as already opened, so the badge starts clean.
update public.appointments set staff_opened_at = coalesce(staff_opened_at, created_at)
where staff_opened_at is null and created_at < now() - interval '1 minute';

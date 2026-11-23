-- EuroWerken: customer photos and customer alerts. Safe to re-run.
--
--   customer-photos bucket        a customer's profile photo and one photo per car, under <customer id>/<uuid>.jpg.
--                                 Public URLs (unguessable paths), like repair-media; only the customer can add,
--                                 replace or delete files in their own folder.
--   customer_vehicles.photo_path  the car's photo in that bucket (one per car for now).
--   customer_notifications        alerts for a signed-in customer about their repairs:
--                                   approval  the workshop is waiting for the customer's approval (one open alert per
--                                             repair, refreshed when more items are sent; cleared once nothing is pending)
--                                   message   the workshop sent a message
--                                 Written only by the triggers below; customers read their own and mark them read.

-- 1. Photos ------------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('customer-photos', 'customer-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "customer-photos: own read" on storage.objects;
create policy "customer-photos: own read" on storage.objects
  for select to authenticated
  using (bucket_id = 'customer-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "customer-photos: own upload" on storage.objects;
create policy "customer-photos: own upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'customer-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "customer-photos: own change" on storage.objects;
create policy "customer-photos: own change" on storage.objects
  for update to authenticated
  using (bucket_id = 'customer-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "customer-photos: own delete" on storage.objects;
create policy "customer-photos: own delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'customer-photos' and (storage.foldername(name))[1] = auth.uid()::text);

alter table public.customer_vehicles add column if not exists photo_path text;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.customer_vehicles'::regclass and conname = 'customer_vehicles_photo_path_check') then
    -- Only a file in the owner's own folder.
    alter table public.customer_vehicles add constraint customer_vehicles_photo_path_check
      check (photo_path is null or (length(photo_path) <= 200 and photo_path like customer_id::text || '/%'));
  end if;
end $$;

-- 2. Customer alerts -----------------------------------------------------------------------------------------

create table if not exists public.customer_notifications (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.customer_accounts (id) on delete cascade,
  workshop_id      uuid not null references public.workshops (id) on delete cascade,
  repair_order_id  uuid not null references public.repair_orders (id) on delete cascade,
  kind             text not null check (kind in ('approval', 'message')),
  title            text not null,
  body             text not null,
  created_at       timestamptz not null default now(),
  read_at          timestamptz
);
create index if not exists customer_notifications_customer_idx
  on public.customer_notifications (customer_id, workshop_id, created_at desc) where read_at is null;
create index if not exists customer_notifications_ro_idx on public.customer_notifications (repair_order_id);

alter table public.customer_notifications enable row level security;
drop policy if exists "customer_notifications: own" on public.customer_notifications;
create policy "customer_notifications: own" on public.customer_notifications
  for select to authenticated using (customer_id = auth.uid());
revoke all on public.customer_notifications from anon, authenticated;
grant select on public.customer_notifications to authenticated;

create or replace function public.repair_vehicle_label(p_vehicle jsonb, p_fallback text)
returns text
language sql immutable
as $$
  select coalesce(nullif(trim(concat_ws(' ', p_vehicle->>'year', p_vehicle->>'make', p_vehicle->>'model')), ''), p_fallback)
$$;

-- Open (or refresh) the approval alert of a repair that is waiting for the customer.
create or replace function public.customer_approval_alert(p_repair_order uuid)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  r public.repair_orders;
  n int;
  t text;
  b text;
begin
  select * into r from public.repair_orders where id = p_repair_order;
  if r.id is null or r.customer_id is null or r.status <> 'awaiting_approval' then return; end if;
  select count(*) into n from public.repair_order_items where repair_order_id = r.id and approval = 'pending';
  if n = 0 then return; end if;
  t := 'Approval needed: ' || public.repair_vehicle_label(r.vehicle, r.number);
  b := case when n = 1 then '1 item needs your approval. Review the estimate and approve or decline it.'
            else n || ' items need your approval. Review the estimate and approve or decline them.' end;
  update public.customer_notifications set title = t, body = b, created_at = now()
  where repair_order_id = r.id and kind = 'approval' and read_at is null;
  if not found then
    insert into public.customer_notifications (customer_id, workshop_id, repair_order_id, kind, title, body)
    values (r.customer_id, r.workshop_id, r.id, 'approval', t, b);
  end if;
end;
$$;
revoke all on function public.customer_approval_alert(uuid) from public, anon, authenticated;

-- The repair is sent for approval.
create or replace function public.repair_orders_alert_customer()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'awaiting_approval' and old.status is distinct from new.status then
    perform public.customer_approval_alert(new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists repair_orders_alert_customer on public.repair_orders;
create trigger repair_orders_alert_customer
  after update of status on public.repair_orders
  for each row execute function public.repair_orders_alert_customer();

-- More items sent while the repair is already waiting; and once nothing is pending, the alert is closed.
create or replace function public.repair_items_alert_customer()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.approval = 'pending' and (tg_op = 'INSERT' or old.approval is distinct from 'pending') then
    perform public.customer_approval_alert(new.repair_order_id);
  elsif tg_op = 'UPDATE' and old.approval = 'pending' and new.approval <> 'pending'
        and not exists (select 1 from public.repair_order_items where repair_order_id = new.repair_order_id and approval = 'pending') then
    update public.customer_notifications set read_at = now()
    where repair_order_id = new.repair_order_id and kind = 'approval' and read_at is null;
  end if;
  return new;
end;
$$;
drop trigger if exists repair_items_alert_customer on public.repair_order_items;
create trigger repair_items_alert_customer
  after insert or update of approval on public.repair_order_items
  for each row execute function public.repair_items_alert_customer();

-- A message from the workshop.
create or replace function public.repair_messages_alert_customer()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  r public.repair_orders;
begin
  if new.sender <> 'staff' then return new; end if;
  select * into r from public.repair_orders where id = new.repair_order_id;
  if r.customer_id is null then return new; end if;
  insert into public.customer_notifications (customer_id, workshop_id, repair_order_id, kind, title, body)
  values (r.customer_id, r.workshop_id, r.id, 'message',
          'New message: ' || public.repair_vehicle_label(r.vehicle, r.number),
          left(regexp_replace(trim(new.body), '\s+', ' ', 'g'), 300));
  return new;
end;
$$;
drop trigger if exists repair_messages_alert_customer on public.repair_order_messages;
create trigger repair_messages_alert_customer
  after insert on public.repair_order_messages
  for each row execute function public.repair_messages_alert_customer();

-- The customer has seen them (one repair, or all at this workshop).
create or replace function public.mark_customer_notifications_read(p_repair_order uuid default null, p_workshop uuid default null)
returns integer
language plpgsql volatile security definer set search_path = public
as $$
declare
  n int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  update public.customer_notifications set read_at = now()
  where customer_id = auth.uid() and read_at is null
    and (p_repair_order is null or repair_order_id = p_repair_order)
    and (p_workshop is null or workshop_id = p_workshop);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.mark_customer_notifications_read(uuid, uuid) from public, anon;
grant execute on function public.mark_customer_notifications_read(uuid, uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'customer_notifications') then
      alter publication supabase_realtime add table public.customer_notifications;
    end if;
  end if;
end $$;

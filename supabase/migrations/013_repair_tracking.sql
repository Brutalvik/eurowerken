-- EuroWerken: Phase 4, repair photos, messages, customer tracking and approvals. Safe to re-run.
--
--   repair_order_media      photos and videos of a repair (files in the repair-media bucket)
--   repair_order_messages   the thread between the workshop and the customer
--
--   Customer-side functions (guests or signed in), all verified by tracking code + email or phone:
--     track_repair(slug, code, contact)                     everything the customer may see, as JSON
--     respond_to_repair_items(slug, code, contact, ids, d)  approve or decline items waiting for approval
--     post_repair_message(slug, code, contact, body)        send a message to the workshop
--   Messages and approvals from customers also create staff notifications (bell).
--
-- Media files are in a public bucket under unguessable paths (<workshop>/<repair order>/<uuid>.<ext>),
-- so the tracking page can show them to guests; only staff of the workshop can upload or delete.

-- 1. Media ------------------------------------------------------------------------------------------

create table if not exists public.repair_order_media (
  id                   uuid primary key default gen_random_uuid(),
  repair_order_id      uuid not null references public.repair_orders (id) on delete cascade,
  workshop_id          uuid not null references public.workshops (id) on delete cascade,
  path                 text not null,
  kind                 text not null check (kind in ('photo', 'video')),
  caption              text check (length(caption) <= 200),
  visible_to_customer  boolean not null default true,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now()
);
create index if not exists repair_order_media_ro_idx on public.repair_order_media (repair_order_id, created_at);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('repair-media', 'repair-media', true, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

drop policy if exists "repair-media: staff upload" on storage.objects;
create policy "repair-media: staff upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'repair-media' and (storage.foldername(name))[1] = public.my_workshop()::text
              and public.has_access('repair-orders', 'full'));
drop policy if exists "repair-media: staff delete" on storage.objects;
create policy "repair-media: staff delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'repair-media' and (storage.foldername(name))[1] = public.my_workshop()::text
         and public.has_access('repair-orders', 'full'));

-- 2. Messages -----------------------------------------------------------------------------------------

create table if not exists public.repair_order_messages (
  id               uuid primary key default gen_random_uuid(),
  repair_order_id  uuid not null references public.repair_orders (id) on delete cascade,
  workshop_id      uuid not null references public.workshops (id) on delete cascade,
  sender           text not null check (sender in ('staff', 'customer')),
  author_name      text,
  body             text not null check (length(trim(body)) between 1 and 2000),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists repair_order_messages_ro_idx on public.repair_order_messages (repair_order_id, created_at);

-- Staff messages: the sender and author are set from the signed-in staff member, never trusted from the browser.
create or replace function public.repair_messages_before_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and new.sender = 'staff' then
    new.created_by := auth.uid();
    select coalesce(full_name, split_part(email, '@', 1)) into new.author_name from public.profiles where id = auth.uid();
  end if;
  return new;
end;
$$;
drop trigger if exists repair_messages_before_insert on public.repair_order_messages;
create trigger repair_messages_before_insert
  before insert on public.repair_order_messages
  for each row execute function public.repair_messages_before_insert();

-- 3. More notification kinds -----------------------------------------------------------------------------

do $$
declare
  c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.notifications'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%'
  loop
    execute format('alter table public.notifications drop constraint %I', c.conname);
  end loop;
  alter table public.notifications add constraint notifications_kind_check
    check (kind in ('booking_created', 'booking_cancelled', 'repair_message', 'repair_approval'));
end $$;
alter table public.notifications add column if not exists repair_order_id uuid references public.repair_orders (id) on delete cascade;

-- 4. Customer access by tracking code ---------------------------------------------------------------------

-- The repair order for a code on a published site, if the contact matches its email or phone (last 10 digits).
create or replace function public.repair_for_contact(p_slug text, p_code text, p_contact text)
returns public.repair_orders
language plpgsql stable security definer set search_path = public
as $$
declare
  r public.repair_orders;
  wid uuid;
  digits text := right(regexp_replace(coalesce(p_contact, ''), '\D', '', 'g'), 10);
begin
  select workshop_id into wid from public.workshop_sites where slug = lower(trim(p_slug)) and published;
  if wid is null then return null; end if;
  select * into r from public.repair_orders
  where workshop_id = wid and tracking_code = upper(trim(p_code)) and status <> 'cancelled';
  if r.id is null then return null; end if;
  if lower(trim(p_contact)) = lower(coalesce(r.contact_email, '#'))
     or (length(digits) >= 7 and digits = right(regexp_replace(coalesce(r.contact_phone, ''), '\D', '', 'g'), 10))
     or (auth.uid() is not null and r.customer_id = auth.uid()) then
    return r;
  end if;
  return null;
end;
$$;
revoke all on function public.repair_for_contact(text, text, text) from public, anon, authenticated;

create or replace function public.track_repair(p_slug text, p_code text, p_contact text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  r public.repair_orders;
  tz text;
begin
  r := public.repair_for_contact(p_slug, p_code, p_contact);
  -- One message for every failure, so codes cannot be probed.
  if r.id is null then raise exception 'We could not find a repair with those details. Check the tracking code and the email or phone you booked with.'; end if;
  select time_zone into tz from public.booking_settings where workshop_id = r.workshop_id;

  return jsonb_build_object(
    'repair', jsonb_build_object(
      'id', r.id, 'number', r.number, 'tracking_code', r.tracking_code, 'status', r.status,
      'vehicle', r.vehicle, 'contact_name', r.contact_name, 'urgency', r.urgency,
      'customer_notes', r.customer_notes, 'labour_rate', r.labour_rate, 'promised_at', r.promised_at,
      'created_at', r.created_at, 'updated_at', r.updated_at, 'completed_at', r.completed_at, 'time_zone', tz,
      'technician', (select jsonb_build_object('name', t.name, 'role', t.role_title, 'photo_path', t.photo_path)
                     from public.team_members t where t.id = r.technician_id)),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'kind', i.kind, 'description', i.description, 'quantity', i.quantity,
        'unit_price', i.unit_price, 'approval', i.approval) order by i.sort_order, i.created_at)
      from public.repair_order_items i where i.repair_order_id = r.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'kind', e.kind, 'title', e.title, 'body', e.body, 'created_at', e.created_at) order by e.created_at)
      from public.repair_order_events e where e.repair_order_id = r.id and e.visible_to_customer), '[]'::jsonb),
    'media', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'kind', m.kind, 'path', m.path, 'caption', m.caption, 'created_at', m.created_at) order by m.created_at)
      from public.repair_order_media m where m.repair_order_id = r.id and m.visible_to_customer), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'sender', g.sender, 'author_name', g.author_name, 'body', g.body, 'created_at', g.created_at) order by g.created_at)
      from public.repair_order_messages g where g.repair_order_id = r.id), '[]'::jsonb)
  );
end;
$$;
grant execute on function public.track_repair(text, text, text) to anon, authenticated;

create or replace function public.respond_to_repair_items(p_slug text, p_code text, p_contact text, p_item_ids uuid[], p_decision text)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  r public.repair_orders;
  n int;
  names text;
begin
  if p_decision not in ('approved', 'declined') then raise exception 'Choose approve or decline'; end if;
  r := public.repair_for_contact(p_slug, p_code, p_contact);
  if r.id is null then raise exception 'We could not find a repair with those details.'; end if;

  update public.repair_order_items set approval = p_decision
  where repair_order_id = r.id and approval = 'pending' and id = any (p_item_ids);
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Nothing is waiting for your approval.'; end if;

  select string_agg(description, ', ') into names from public.repair_order_items where repair_order_id = r.id and id = any (p_item_ids);
  insert into public.repair_order_events (repair_order_id, workshop_id, kind, title, body, visible_to_customer)
  values (r.id, r.workshop_id, 'approval',
          case p_decision when 'approved' then 'Customer approved work' else 'Customer declined work' end, names, true);
  insert into public.notifications (workshop_id, kind, repair_order_id, title, body)
  values (r.workshop_id, 'repair_approval', r.id,
          r.contact_name || case p_decision when 'approved' then ' approved ' else ' declined ' end || n || ' item' || case when n > 1 then 's' else '' end,
          r.number || ' · ' || names);

  -- When nothing is pending any more, a repair that was waiting moves on.
  if r.status = 'awaiting_approval' and not exists (
    select 1 from public.repair_order_items where repair_order_id = r.id and approval = 'pending') then
    update public.repair_orders set status = 'in_progress' where id = r.id;
  end if;

  return public.track_repair(p_slug, p_code, p_contact);
end;
$$;
grant execute on function public.respond_to_repair_items(text, text, text, uuid[], text) to anon, authenticated;

create or replace function public.post_repair_message(p_slug text, p_code text, p_contact text, p_body text)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  r public.repair_orders;
begin
  r := public.repair_for_contact(p_slug, p_code, p_contact);
  if r.id is null then raise exception 'We could not find a repair with those details.'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception 'Write a message first.'; end if;
  insert into public.repair_order_messages (repair_order_id, workshop_id, sender, author_name, body, created_by)
  values (r.id, r.workshop_id, 'customer', r.contact_name, left(trim(p_body), 2000), auth.uid());
  insert into public.notifications (workshop_id, kind, repair_order_id, title, body)
  values (r.workshop_id, 'repair_message', r.id, 'Message from ' || r.contact_name, r.number || ' · ' || left(trim(p_body), 120));
  return public.track_repair(p_slug, p_code, p_contact);
end;
$$;
grant execute on function public.post_repair_message(text, text, text, text) to anon, authenticated;

-- 5. Row level security ----------------------------------------------------------------------------------

alter table public.repair_order_media enable row level security;
alter table public.repair_order_messages enable row level security;

drop policy if exists "repair_order_media: staff read" on public.repair_order_media;
create policy "repair_order_media: staff read" on public.repair_order_media
  for select to authenticated using (workshop_id = public.my_workshop() and public.has_access('repair-orders', 'view'));
drop policy if exists "repair_order_media: staff write" on public.repair_order_media;
create policy "repair_order_media: staff write" on public.repair_order_media
  for all to authenticated
  using (workshop_id = public.my_workshop() and public.has_access('repair-orders', 'full'))
  with check (workshop_id = public.my_workshop() and public.has_access('repair-orders', 'full')
              and exists (select 1 from public.repair_orders r where r.id = repair_order_id and r.workshop_id = public.my_workshop()));

drop policy if exists "repair_order_messages: staff read" on public.repair_order_messages;
create policy "repair_order_messages: staff read" on public.repair_order_messages
  for select to authenticated using (workshop_id = public.my_workshop() and public.has_access('repair-orders', 'view'));
drop policy if exists "repair_order_messages: staff send" on public.repair_order_messages;
create policy "repair_order_messages: staff send" on public.repair_order_messages
  for insert to authenticated
  with check (sender = 'staff' and workshop_id = public.my_workshop() and public.has_access('repair-orders', 'full')
              and exists (select 1 from public.repair_orders r where r.id = repair_order_id and r.workshop_id = public.my_workshop()));
drop policy if exists "repair_order_messages: customer reads own" on public.repair_order_messages;
create policy "repair_order_messages: customer reads own" on public.repair_order_messages
  for select to authenticated
  using (exists (select 1 from public.repair_orders r where r.id = repair_order_id and r.customer_id = auth.uid()));

grant select, insert, update, delete on public.repair_order_media to authenticated;
grant select, insert on public.repair_order_messages to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'repair_order_messages') then
      alter publication supabase_realtime add table public.repair_order_messages;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'repair_order_items') then
      alter publication supabase_realtime add table public.repair_order_items;
    end if;
  end if;
end $$;

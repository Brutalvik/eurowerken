-- EuroWerken: recorded customer approvals. Safe to re-run.
--
--   Customers must be signed in to approve or decline work. Each decision is recorded once and never
--   edited: decision, amount (with GST) at that moment, time, customer account and email, IP address
--   and browser (from the request headers on the server), and whether it was online (signed in) or a
--   phone approval recorded by staff.
--
--   A repair booked as a guest is linked to a signed-in customer when their sign-in email matches the
--   repair's contact email.

create table if not exists public.repair_item_approvals (
  id               uuid primary key default gen_random_uuid(),
  repair_order_id  uuid not null references public.repair_orders (id) on delete cascade,
  item_id          uuid references public.repair_order_items (id) on delete set null,
  workshop_id      uuid not null references public.workshops (id) on delete cascade,
  item_description text not null,
  amount           numeric(10, 2) not null,           -- quantity x unit price, before tax
  amount_with_tax  numeric(10, 2) not null,           -- with GST 5%
  decision         text not null check (decision in ('approved', 'declined')),
  method           text not null check (method in ('online', 'phone')),
  customer_id      uuid references public.customer_accounts (id) on delete set null,
  customer_email   text,
  signed_in        boolean not null,
  ip_address       text,
  user_agent       text,
  recorded_by      uuid references auth.users (id) on delete set null,   -- staff member for phone approvals
  note             text check (length(note) <= 500),
  decided_at       timestamptz not null default now()
);
create index if not exists repair_item_approvals_ro_idx on public.repair_item_approvals (repair_order_id, decided_at);

-- Approval records can never be changed or removed by anyone using the app.
create or replace function public.repair_item_approvals_immutable()
returns trigger
language plpgsql
as $$
begin
  if current_setting('eurowerken.allow_approval_delete', true) = 'on' then
    return case tg_op when 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    -- Removed together with its repair order or workshop (a cascade): allowed.
    if not exists (select 1 from public.repair_orders where id = old.repair_order_id) then return old; end if;
  else
    -- A linked item, customer account or staff account was deleted (set null): allowed, nothing else changes.
    if (new.item_id is null or new.item_id = old.item_id)
       and (new.customer_id is null or new.customer_id = old.customer_id)
       and (new.recorded_by is null or new.recorded_by = old.recorded_by)
       and (new.id, new.repair_order_id, new.workshop_id, new.item_description, new.amount, new.amount_with_tax,
            new.decision, new.method, new.customer_email, new.signed_in, new.ip_address, new.user_agent, new.note, new.decided_at)
           is not distinct from
           (old.id, old.repair_order_id, old.workshop_id, old.item_description, old.amount, old.amount_with_tax,
            old.decision, old.method, old.customer_email, old.signed_in, old.ip_address, old.user_agent, old.note, old.decided_at)
    then return new; end if;
  end if;
  raise exception 'Approval records cannot be changed';
end;
$$;
drop trigger if exists repair_item_approvals_immutable on public.repair_item_approvals;
create trigger repair_item_approvals_immutable
  before update or delete on public.repair_item_approvals
  for each row execute function public.repair_item_approvals_immutable();

-- A repair order with recorded approvals cannot be deleted from the app (cancel it instead).
create or replace function public.repair_orders_keep_approved()
returns trigger
language plpgsql
as $$
begin
  if current_setting('eurowerken.allow_approval_delete', true) is distinct from 'on'
     and exists (select 1 from public.repair_item_approvals where repair_order_id = old.id) then
    raise exception 'This repair order has recorded customer approvals and cannot be deleted. Cancel it instead.';
  end if;
  return old;
end;
$$;
drop trigger if exists repair_orders_keep_approved on public.repair_orders;
create trigger repair_orders_keep_approved
  before delete on public.repair_orders
  for each row execute function public.repair_orders_keep_approved();

-- The caller's IP address and browser, from the request headers PostgREST passes to the database.
create or replace function public.request_ip()
returns text
language sql stable
as $$
  select nullif(trim(split_part(coalesce(
    (current_setting('request.headers', true)::json ->> 'cf-connecting-ip'),
    (current_setting('request.headers', true)::json ->> 'x-real-ip'),
    (current_setting('request.headers', true)::json ->> 'x-forwarded-for'),
    ''), ',', 1)), '')
$$;

create or replace function public.request_user_agent()
returns text
language sql stable
as $$
  select left(current_setting('request.headers', true)::json ->> 'user-agent', 400)
$$;

-- Approve or decline: signed-in customers only. Replaces the version from migration 013.
create or replace function public.respond_to_repair_items(p_slug text, p_code text, p_contact text, p_item_ids uuid[], p_decision text)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  r public.repair_orders;
  me_email text;
  n int;
  names text;
begin
  if p_decision not in ('approved', 'declined') then raise exception 'Choose approve or decline'; end if;
  if auth.uid() is null then raise exception 'Please sign in to approve or decline work.'; end if;

  r := public.repair_for_contact(p_slug, p_code, p_contact);
  if r.id is null then raise exception 'We could not find a repair with those details.'; end if;

  select lower(email) into me_email from auth.users where id = auth.uid();
  perform public.ensure_customer_account();

  -- Link a guest booking to this account when the sign-in email is the booking's email.
  if r.customer_id is null then
    if me_email is distinct from lower(r.contact_email) then
      raise exception 'Sign in with the email this repair was booked with (%) to approve it.', r.contact_email;
    end if;
    update public.repair_orders set customer_id = auth.uid() where id = r.id;
    insert into public.workshop_customers (workshop_id, customer_id) values (r.workshop_id, auth.uid()) on conflict do nothing;
    r.customer_id := auth.uid();
  elsif r.customer_id <> auth.uid() then
    raise exception 'This repair belongs to another account.';
  end if;

  -- Record each decision first (with the amount at this moment), then apply it.
  insert into public.repair_item_approvals (
    repair_order_id, item_id, workshop_id, item_description, amount, amount_with_tax, decision, method,
    customer_id, customer_email, signed_in, ip_address, user_agent)
  select r.id, i.id, r.workshop_id, i.description, round(i.quantity * i.unit_price, 2),
         round(i.quantity * i.unit_price * 1.05, 2), p_decision, 'online',
         auth.uid(), me_email, true, public.request_ip(), public.request_user_agent()
  from public.repair_order_items i
  where i.repair_order_id = r.id and i.approval = 'pending' and i.id = any (p_item_ids);
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Nothing is waiting for your approval.'; end if;

  perform public.allow_approval_change();
  update public.repair_order_items set approval = p_decision
  where repair_order_id = r.id and approval = 'pending' and id = any (p_item_ids);

  select string_agg(description, ', ') into names from public.repair_order_items where repair_order_id = r.id and id = any (p_item_ids);
  insert into public.repair_order_events (repair_order_id, workshop_id, kind, title, body, visible_to_customer)
  values (r.id, r.workshop_id, 'approval',
          case p_decision when 'approved' then 'Customer approved work' else 'Customer declined work' end, names, true);
  insert into public.notifications (workshop_id, kind, repair_order_id, title, body)
  values (r.workshop_id, 'repair_approval', r.id,
          r.contact_name || case p_decision when 'approved' then ' approved ' else ' declined ' end || n || ' item' || case when n > 1 then 's' else '' end,
          r.number || ' · ' || names);

  if r.status = 'awaiting_approval' and not exists (
    select 1 from public.repair_order_items where repair_order_id = r.id and approval = 'pending') then
    update public.repair_orders set status = 'in_progress' where id = r.id;
  end if;

  return public.track_repair(p_slug, p_code, p_contact);
end;
$$;
grant execute on function public.respond_to_repair_items(text, text, text, uuid[], text) to authenticated;
revoke execute on function public.respond_to_repair_items(text, text, text, uuid[], text) from anon;

-- Staff record an approval the customer gave by phone (marked as such, with who recorded it).
create or replace function public.record_phone_approval(p_repair_order uuid, p_item_ids uuid[], p_decision text, p_note text default null)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  r public.repair_orders;
  n int;
begin
  if p_decision not in ('approved', 'declined') then raise exception 'Choose approve or decline'; end if;
  if not public.has_access('repair-orders', 'full') then raise exception 'You do not have permission to record approvals'; end if;
  select * into r from public.repair_orders where id = p_repair_order and workshop_id = public.my_workshop();
  if r.id is null then raise exception 'Repair order not found'; end if;
  if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Add a short note, for example who you spoke to and when.'; end if;

  insert into public.repair_item_approvals (
    repair_order_id, item_id, workshop_id, item_description, amount, amount_with_tax, decision, method,
    customer_id, customer_email, signed_in, ip_address, user_agent, recorded_by, note)
  select r.id, i.id, r.workshop_id, i.description, round(i.quantity * i.unit_price, 2),
         round(i.quantity * i.unit_price * 1.05, 2), p_decision, 'phone',
         r.customer_id, r.contact_email, false, null, null, auth.uid(), left(trim(p_note), 500)
  from public.repair_order_items i
  where i.repair_order_id = r.id and i.approval = 'pending' and i.id = any (p_item_ids);
  get diagnostics n = row_count;
  if n = 0 then raise exception 'None of these items are waiting for approval.'; end if;

  perform public.allow_approval_change();
  update public.repair_order_items set approval = p_decision
  where repair_order_id = r.id and approval = 'pending' and id = any (p_item_ids);
  insert into public.repair_order_events (repair_order_id, workshop_id, kind, title, body, visible_to_customer, created_by)
  values (r.id, r.workshop_id, 'approval',
          case p_decision when 'approved' then 'Approved by phone' else 'Declined by phone' end, left(trim(p_note), 500), true, auth.uid());

  if r.status = 'awaiting_approval' and not exists (
    select 1 from public.repair_order_items where repair_order_id = r.id and approval = 'pending') then
    update public.repair_orders set status = 'in_progress' where id = r.id;
  end if;
end;
$$;
revoke all on function public.record_phone_approval(uuid, uuid[], text, text) from public, anon;
grant execute on function public.record_phone_approval(uuid, uuid[], text, text) to authenticated;

-- Staff may no longer flip an item from pending to approved/declined directly: decisions go through
-- the two functions above, so every decision has a record.
create or replace function public.repair_items_guard_approval()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and old.approval = 'pending' and new.approval in ('approved', 'declined')
     and coalesce(current_setting('eurowerken.approval_via_function', true), '') <> 'on' then
    raise exception 'Record the customer''s decision with "Record phone approval", or let the customer approve online.';
  end if;
  return new;
end;
$$;
drop trigger if exists repair_items_guard_approval on public.repair_order_items;
create trigger repair_items_guard_approval
  before update of approval on public.repair_order_items
  for each row execute function public.repair_items_guard_approval();

-- The two approval functions set the flag the guard checks.
create or replace function public.allow_approval_change()
returns void
language sql security definer set search_path = public
as $$
  select set_config('eurowerken.approval_via_function', 'on', true)
$$;
revoke all on function public.allow_approval_change() from public, anon, authenticated;

-- Row level security: staff of the workshop and the customer can read; nobody writes directly.
alter table public.repair_item_approvals enable row level security;
drop policy if exists "repair_item_approvals: staff read" on public.repair_item_approvals;
create policy "repair_item_approvals: staff read" on public.repair_item_approvals
  for select to authenticated using (workshop_id = public.my_workshop() and public.has_access('repair-orders', 'view'));
drop policy if exists "repair_item_approvals: customer reads own" on public.repair_item_approvals;
create policy "repair_item_approvals: customer reads own" on public.repair_item_approvals
  for select to authenticated
  using (exists (select 1 from public.repair_orders r where r.id = repair_order_id and r.customer_id = auth.uid()));
grant select on public.repair_item_approvals to authenticated;

-- The customer's tracking view includes each item's approval record (when, how; no IP for privacy).
-- track_repair is redefined to add it.
create or replace function public.track_repair(p_slug text, p_code text, p_contact text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  r public.repair_orders;
  tz text;
begin
  r := public.repair_for_contact(p_slug, p_code, p_contact);
  if r.id is null then raise exception 'We could not find a repair with those details. Check the tracking code and the email or phone you booked with.'; end if;
  select time_zone into tz from public.booking_settings where workshop_id = r.workshop_id;

  return jsonb_build_object(
    'repair', jsonb_build_object(
      'id', r.id, 'number', r.number, 'tracking_code', r.tracking_code, 'status', r.status,
      'vehicle', r.vehicle, 'contact_name', r.contact_name, 'urgency', r.urgency,
      'customer_notes', r.customer_notes, 'labour_rate', r.labour_rate, 'promised_at', r.promised_at,
      'created_at', r.created_at, 'updated_at', r.updated_at, 'completed_at', r.completed_at, 'time_zone', tz,
      'linked_to_account', r.customer_id is not null,
      'technician', (select jsonb_build_object('name', t.name, 'role', t.role_title, 'photo_path', t.photo_path)
                     from public.team_members t where t.id = r.technician_id)),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'kind', i.kind, 'description', i.description, 'quantity', i.quantity,
        'unit_price', i.unit_price, 'approval', i.approval,
        'decision', (select jsonb_build_object('decision', a.decision, 'method', a.method, 'decided_at', a.decided_at)
                     from public.repair_item_approvals a where a.item_id = i.id order by a.decided_at desc limit 1))
        order by i.sort_order, i.created_at)
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

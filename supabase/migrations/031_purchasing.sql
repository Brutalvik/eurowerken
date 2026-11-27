-- EuroWerken: parts suppliers, purchase orders, receiving into inventory, and supplier emails. Safe to re-run.
-- Run after 012 (repair orders), 023 and 024 (emails and PDFs).
--
--   suppliers                   the workshop's parts suppliers (name unique per workshop, case ignored)
--   purchase_orders             PO-0001... per workshop (workshop_counters.last_po), optionally for a repair order
--   purchase_order_lines        what is ordered: a part from inventory or free text, quantity, unit cost, received
--   purchase_order_receipts     every receipt (who, when, how many, at what cost): the history, never changed
--   supplier_outbox             purchase-order emails to suppliers, sent by the customer-mailer Edge Function
--
-- Status of a purchase order: draft -> sent -> partial -> received, or cancelled. Only a draft can be edited (its
-- lines, supplier). Everything else goes through the functions below, which check access and lock the order:
--   create_po_from_repair(repair, supplier, item ids)  draft from a repair order's part lines
--   mark_po_sent(po)                                   ordered by phone or at the counter
--   attach_po_pdf_and_send(po, path)                   the ERP stored the PDF; queue the email to the supplier
--   receive_po_lines(po, [{line_id, qty, unit_cost?}]) receive some or all; adds stock and records the cost
--   cancel_po(po)                                      nothing more will arrive (received stock stays)
--   part_on_order()                                    per part: ordered minus received on sent and partial orders
--
-- Access: Parts Inventory view to read, full to change. Repair Orders full may also create a draft from a repair
-- order (and add a supplier while doing so); Repair Orders view may read the orders linked to a repair.
-- Stock is the existing parts.stock (whole numbers), so lines linked to a part order whole quantities.
-- PDFs: private bucket "documents", <workshop_id>/po/<po_id>.pdf.

-- 1. Numbering --------------------------------------------------------------------------------------------------

alter table public.workshop_counters add column if not exists last_po int not null default 0;

create or replace function public.next_po_number(p_workshop uuid)
returns text
language plpgsql volatile security definer set search_path = public
as $$
declare
  n int;
begin
  insert into public.workshop_counters (workshop_id, last_po) values (p_workshop, 1)
  on conflict (workshop_id) do update set last_po = public.workshop_counters.last_po + 1
  returning last_po into n;
  return 'PO-' || lpad(n::text, 4, '0');
end;
$$;
revoke all on function public.next_po_number(uuid) from public, anon, authenticated;

-- True when the current statement comes straight from a signed-in user (PostgREST), not from one of the
-- security-definer functions below (which run as their owner) or the service role. Only meaningful in code that
-- runs as the caller: the update and line triggers are therefore not security definer.
create or replace function public.po_direct_write()
returns boolean
language sql stable
as $$
  select current_user in ('authenticated', 'anon')
$$;

-- 2. Suppliers ---------------------------------------------------------------------------------------------------

create table if not exists public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  workshop_id     uuid not null references public.workshops (id) on delete cascade,
  name            text not null check (length(trim(name)) between 2 and 120),
  contact_name    text check (length(contact_name) <= 120),
  email           text check (email is null or (length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  phone           text check (length(phone) <= 40),
  account_number  text check (length(account_number) <= 60),
  address         text check (length(address) <= 300),
  website         text check (length(website) <= 200),
  notes           text check (length(notes) <= 2000),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists suppliers_workshop_name_idx on public.suppliers (workshop_id, lower(trim(name)));

create or replace function public.suppliers_before_write()
returns trigger
language plpgsql
as $$
begin
  new.name := trim(new.name);
  new.email := nullif(lower(trim(coalesce(new.email, ''))), '');
  if tg_op = 'UPDATE' then
    if new.workshop_id is distinct from old.workshop_id then raise exception 'Rows cannot move to another workshop'; end if;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists suppliers_before_write on public.suppliers;
create trigger suppliers_before_write
  before insert or update on public.suppliers
  for each row execute function public.suppliers_before_write();

-- 3. Purchase orders -------------------------------------------------------------------------------------------------

create table if not exists public.purchase_orders (
  id               uuid primary key default gen_random_uuid(),
  workshop_id      uuid not null references public.workshops (id) on delete cascade,
  number           text not null,
  supplier_id      uuid not null references public.suppliers (id) on delete restrict,
  status           text not null default 'draft' check (status in ('draft', 'sent', 'partial', 'received', 'cancelled')),
  repair_order_id  uuid references public.repair_orders (id) on delete set null,
  notes            text check (length(notes) <= 2000),
  expected_at      date,
  sent_at          timestamptz,
  received_at      timestamptz,
  cancelled_at     timestamptz,
  pdf_path         text,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (workshop_id, number)
);
create index if not exists purchase_orders_workshop_idx on public.purchase_orders (workshop_id, created_at desc);
create index if not exists purchase_orders_repair_idx on public.purchase_orders (repair_order_id) where repair_order_id is not null;
create index if not exists purchase_orders_supplier_idx on public.purchase_orders (supplier_id);

create table if not exists public.purchase_order_lines (
  id                    uuid primary key default gen_random_uuid(),
  po_id                 uuid not null references public.purchase_orders (id) on delete cascade,
  workshop_id           uuid not null references public.workshops (id) on delete cascade,
  part_id               uuid references public.parts (id) on delete set null,
  description           text not null check (length(trim(description)) between 1 and 300),
  part_number           text check (length(part_number) <= 60),
  quantity              numeric(10, 2) not null check (quantity > 0 and quantity <= 100000),
  unit_cost             numeric(10, 2) not null default 0 check (unit_cost >= 0 and unit_cost <= 10000000),
  received_qty          numeric(10, 2) not null default 0,
  repair_order_item_id  uuid references public.repair_order_items (id) on delete set null,
  sort_order            int not null default 0,
  created_at            timestamptz not null default now(),
  constraint purchase_order_lines_received_range check (received_qty >= 0 and received_qty <= quantity)
);
create index if not exists purchase_order_lines_po_idx on public.purchase_order_lines (po_id, sort_order);
create index if not exists purchase_order_lines_part_idx on public.purchase_order_lines (part_id) where part_id is not null;
create index if not exists purchase_order_lines_item_idx on public.purchase_order_lines (repair_order_item_id) where repair_order_item_id is not null;

create table if not exists public.purchase_order_receipts (
  id           uuid primary key default gen_random_uuid(),
  workshop_id  uuid not null references public.workshops (id) on delete cascade,
  po_id        uuid not null references public.purchase_orders (id) on delete cascade,
  line_id      uuid not null references public.purchase_order_lines (id) on delete cascade,
  part_id      uuid references public.parts (id) on delete set null,
  quantity     numeric(10, 2) not null check (quantity > 0),
  unit_cost    numeric(10, 2) not null check (unit_cost >= 0),
  received_by  uuid references auth.users (id) on delete set null,
  received_at  timestamptz not null default now()
);
create index if not exists purchase_order_receipts_po_idx on public.purchase_order_receipts (po_id, received_at);

-- New orders: always a draft with a fresh number. The supplier and repair order must be the workshop's own.
create or replace function public.purchase_orders_before_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.suppliers s where s.id = new.supplier_id and s.workshop_id = new.workshop_id) then
    raise exception 'Supplier not found.';
  end if;
  if new.repair_order_id is not null
     and not exists (select 1 from public.repair_orders r where r.id = new.repair_order_id and r.workshop_id = new.workshop_id) then
    raise exception 'Repair order not found.';
  end if;
  new.number := public.next_po_number(new.workshop_id);
  new.status := 'draft';
  new.sent_at := null;
  new.received_at := null;
  new.cancelled_at := null;
  new.pdf_path := null;
  new.created_by := coalesce(auth.uid(), new.created_by);
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists purchase_orders_before_insert on public.purchase_orders;
create trigger purchase_orders_before_insert
  before insert on public.purchase_orders
  for each row execute function public.purchase_orders_before_insert();

-- Direct edits (from the ERP) may change only the supplier of a draft, and the notes and expected date of an open
-- order. Status, dates and the PDF change only through the functions of section 5.
-- Runs as the caller (not security definer), so po_direct_write() can tell a direct edit from a function's.
create or replace function public.purchase_orders_before_update()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.workshop_id is distinct from old.workshop_id or new.number is distinct from old.number
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'Workshop, number and creator of a purchase order cannot change.';
  end if;
  if new.supplier_id is distinct from old.supplier_id
     and not exists (select 1 from public.suppliers s where s.id = new.supplier_id and s.workshop_id = new.workshop_id) then
    raise exception 'Supplier not found.';
  end if;
  if public.po_direct_write() then
    if new.status is distinct from old.status or new.sent_at is distinct from old.sent_at
       or new.received_at is distinct from old.received_at or new.cancelled_at is distinct from old.cancelled_at
       or new.pdf_path is distinct from old.pdf_path or new.repair_order_id is distinct from old.repair_order_id then
      raise exception 'Use Mark as sent, Email to supplier, Receive or Cancel to change the status of a purchase order.';
    end if;
    if old.status in ('received', 'cancelled') then
      raise exception 'This purchase order is % and cannot be changed.', old.status;
    end if;
    if old.status <> 'draft' and new.supplier_id is distinct from old.supplier_id then
      raise exception 'The supplier can only be changed while the order is a draft.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists purchase_orders_before_update on public.purchase_orders;
create trigger purchase_orders_before_update
  before update on public.purchase_orders
  for each row execute function public.purchase_orders_before_update();

-- Only drafts are deleted, and only directly by staff (RLS also checks this).
create or replace function public.purchase_orders_before_delete()
returns trigger
language plpgsql
as $$
begin
  if public.po_direct_write() and old.status <> 'draft' then
    raise exception 'Only a draft can be deleted. Cancel the order instead.';
  end if;
  return old;
end;
$$;
drop trigger if exists purchase_orders_before_delete on public.purchase_orders;
create trigger purchase_orders_before_delete
  before delete on public.purchase_orders
  for each row execute function public.purchase_orders_before_delete();

-- Lines: direct changes only while the order is a draft (the order row is locked first, so a line cannot slip in
-- while the order is being sent or received). Received quantities change only through receive_po_lines.
-- Runs as the caller (not security definer), like purchase_orders_before_update.
create or replace function public.purchase_order_lines_before_write()
returns trigger
language plpgsql set search_path = public
as $$
declare
  po public.purchase_orders;
  target uuid := case when tg_op = 'DELETE' then old.po_id else new.po_id end;
begin
  select * into po from public.purchase_orders where id = target for share;
  if po.id is null then
    if tg_op = 'DELETE' then return old; end if; -- the order itself is being deleted
    raise exception 'Purchase order not found.';
  end if;

  if public.po_direct_write() and po.status <> 'draft' then
    raise exception 'Lines can only be changed while the order is a draft (% is %).', po.number, po.status;
  end if;
  if tg_op = 'DELETE' then return old; end if;

  if tg_op = 'UPDATE' and new.po_id is distinct from old.po_id then
    raise exception 'A line cannot move to another purchase order.';
  end if;
  new.workshop_id := po.workshop_id;
  new.description := trim(new.description);
  new.part_number := nullif(trim(coalesce(new.part_number, '')), '');
  if public.po_direct_write() then
    new.received_qty := case when tg_op = 'UPDATE' then old.received_qty else 0 end;
    if tg_op = 'UPDATE' and new.repair_order_item_id is distinct from old.repair_order_item_id then
      raise exception 'The repair order line of a purchase order line cannot change.';
    end if;
  end if;
  if new.part_id is not null then
    if not exists (select 1 from public.parts p where p.id = new.part_id and p.workshop_id = po.workshop_id) then
      raise exception 'Part not found.';
    end if;
    if new.quantity <> trunc(new.quantity) then
      raise exception 'Stock is counted in whole units: order a whole quantity of %.', new.description;
    end if;
  end if;
  if new.repair_order_item_id is not null
     and not exists (select 1 from public.repair_order_items i where i.id = new.repair_order_item_id and i.workshop_id = po.workshop_id) then
    raise exception 'Repair order line not found.';
  end if;
  return new;
end;
$$;
drop trigger if exists purchase_order_lines_before_write on public.purchase_order_lines;
create trigger purchase_order_lines_before_write
  before insert or update or delete on public.purchase_order_lines
  for each row execute function public.purchase_order_lines_before_write();

-- 4. Row level security ------------------------------------------------------------------------------------------

alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.purchase_order_receipts enable row level security;

-- Who may see a purchase order: Parts Inventory view, or Repair Orders view when it belongs to a repair order.
create or replace function public.can_read_po(p_workshop uuid, p_repair_order uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_workshop = public.my_workshop()
     and (public.has_access('inventory', 'view') or (p_repair_order is not null and public.has_access('repair-orders', 'view')))
$$;
revoke all on function public.can_read_po(uuid, uuid) from public, anon;
grant execute on function public.can_read_po(uuid, uuid) to authenticated;

drop policy if exists "suppliers: staff read" on public.suppliers;
create policy "suppliers: staff read" on public.suppliers
  for select to authenticated
  using (workshop_id = public.my_workshop() and (public.has_access('inventory', 'view') or public.has_access('repair-orders', 'view')));
drop policy if exists "suppliers: staff add" on public.suppliers;
create policy "suppliers: staff add" on public.suppliers
  for insert to authenticated
  with check (workshop_id = public.my_workshop() and (public.has_access('inventory', 'full') or public.has_access('repair-orders', 'full')));
drop policy if exists "suppliers: inventory edit" on public.suppliers;
create policy "suppliers: inventory edit" on public.suppliers
  for update to authenticated
  using (workshop_id = public.my_workshop() and public.has_access('inventory', 'full'))
  with check (workshop_id = public.my_workshop() and public.has_access('inventory', 'full'));

drop policy if exists "purchase_orders: staff read" on public.purchase_orders;
create policy "purchase_orders: staff read" on public.purchase_orders
  for select to authenticated using (public.can_read_po(workshop_id, repair_order_id));
drop policy if exists "purchase_orders: inventory add" on public.purchase_orders;
create policy "purchase_orders: inventory add" on public.purchase_orders
  for insert to authenticated
  with check (workshop_id = public.my_workshop() and public.has_access('inventory', 'full'));
drop policy if exists "purchase_orders: inventory edit" on public.purchase_orders;
create policy "purchase_orders: inventory edit" on public.purchase_orders
  for update to authenticated
  using (workshop_id = public.my_workshop() and public.has_access('inventory', 'full'))
  with check (workshop_id = public.my_workshop() and public.has_access('inventory', 'full'));
drop policy if exists "purchase_orders: inventory delete draft" on public.purchase_orders;
create policy "purchase_orders: inventory delete draft" on public.purchase_orders
  for delete to authenticated
  using (workshop_id = public.my_workshop() and public.has_access('inventory', 'full') and status = 'draft');

drop policy if exists "purchase_order_lines: staff read" on public.purchase_order_lines;
create policy "purchase_order_lines: staff read" on public.purchase_order_lines
  for select to authenticated
  using (workshop_id = public.my_workshop()
         and exists (select 1 from public.purchase_orders po where po.id = po_id and public.can_read_po(po.workshop_id, po.repair_order_id)));
drop policy if exists "purchase_order_lines: inventory write" on public.purchase_order_lines;
create policy "purchase_order_lines: inventory write" on public.purchase_order_lines
  for all to authenticated
  using (workshop_id = public.my_workshop() and public.has_access('inventory', 'full'))
  with check (public.has_access('inventory', 'full')
              and exists (select 1 from public.purchase_orders po where po.id = po_id and po.workshop_id = public.my_workshop()));

drop policy if exists "purchase_order_receipts: staff read" on public.purchase_order_receipts;
create policy "purchase_order_receipts: staff read" on public.purchase_order_receipts
  for select to authenticated using (workshop_id = public.my_workshop() and public.has_access('inventory', 'view'));

revoke all on public.suppliers, public.purchase_orders, public.purchase_order_lines, public.purchase_order_receipts from anon;
grant select, insert, update on public.suppliers to authenticated;
grant select, insert, update, delete on public.purchase_orders to authenticated;
grant select, insert, update, delete on public.purchase_order_lines to authenticated;
grant select on public.purchase_order_receipts to authenticated;
revoke all on function public.po_direct_write() from public, anon;
grant execute on function public.po_direct_write() to authenticated;

-- 5. Status changes ------------------------------------------------------------------------------------------------

-- Draft from a repair order's part lines. Each repair line can be on only one open purchase order.
create or replace function public.create_po_from_repair(p_repair_order uuid, p_supplier uuid, p_item_ids uuid[])
returns public.purchase_orders
language plpgsql volatile security definer set search_path = public
as $$
declare
  r public.repair_orders;
  sup public.suppliers;
  po public.purchase_orders;
  dup text;
  n int;
begin
  if public.my_workshop() is null or not (public.has_access('inventory', 'full') or public.has_access('repair-orders', 'full')) then
    raise exception 'You need full access to Parts Inventory or Repair Orders to order parts.';
  end if;
  select * into r from public.repair_orders where id = p_repair_order and workshop_id = public.my_workshop() for update;
  if r.id is null then raise exception 'Repair order not found.'; end if;
  if r.status in ('completed', 'cancelled') then raise exception 'Repair order % is %: parts can no longer be ordered for it.', r.number, r.status; end if;
  select * into sup from public.suppliers where id = p_supplier and workshop_id = r.workshop_id;
  if sup.id is null then raise exception 'Supplier not found.'; end if;
  if not sup.active then raise exception '% is no longer an active supplier.', sup.name; end if;

  if p_item_ids is null or cardinality(p_item_ids) = 0 then raise exception 'Choose at least one part line.'; end if;
  if cardinality(p_item_ids) <> (select count(distinct x) from unnest(p_item_ids) x) then
    raise exception 'A part line was chosen twice.';
  end if;
  select count(*) into n from public.repair_order_items i
  where i.id = any (p_item_ids) and i.repair_order_id = r.id and i.kind = 'part';
  if n <> cardinality(p_item_ids) then raise exception 'Only part lines of this repair order can be ordered.'; end if;
  select string_agg(i.description, ', ') into dup from public.repair_order_items i
  where i.id = any (p_item_ids) and i.approval = 'declined';
  if dup is not null then raise exception 'The customer declined %: it cannot be ordered.', dup; end if;
  select string_agg(i.description || ' (' || po2.number || ')', ', ') into dup
  from public.purchase_order_lines l
  join public.purchase_orders po2 on po2.id = l.po_id and po2.status <> 'cancelled'
  join public.repair_order_items i on i.id = l.repair_order_item_id
  where l.repair_order_item_id = any (p_item_ids);
  if dup is not null then raise exception 'Already on a purchase order: %.', dup; end if;

  insert into public.purchase_orders (workshop_id, supplier_id, repair_order_id, created_by)
  values (r.workshop_id, sup.id, r.id, auth.uid())
  returning * into po;

  insert into public.purchase_order_lines (po_id, workshop_id, part_id, description, part_number, quantity, unit_cost, repair_order_item_id, sort_order)
  select po.id, po.workshop_id, p.id, left(i.description, 300), left(p.part_number, 60),
         case when p.id is not null then ceil(i.quantity) else i.quantity end,
         coalesce(pc.unit_cost, 0), i.id, (row_number() over (order by i.sort_order, i.created_at))::int * 10
  from public.repair_order_items i
  left join public.parts p on p.id = i.part_id and p.workshop_id = i.workshop_id
  left join public.part_costs pc on pc.part_id = p.id
  where i.id = any (p_item_ids);

  insert into public.repair_order_events (repair_order_id, workshop_id, kind, title, body, visible_to_customer, created_by)
  values (r.id, r.workshop_id, 'note', 'Parts order ' || po.number || ' started', 'Draft purchase order to ' || sup.name || '.', false, auth.uid());
  return po;
end;
$$;
revoke all on function public.create_po_from_repair(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.create_po_from_repair(uuid, uuid, uuid[]) to authenticated;

-- The order with its row lock, after the access check every status change shares.
create or replace function public.lock_po_for_change(p_po uuid)
returns public.purchase_orders
language plpgsql volatile security definer set search_path = public
as $$
declare
  po public.purchase_orders;
begin
  if public.my_workshop() is null or not public.has_access('inventory', 'full') then
    raise exception 'You need full access to Parts Inventory to change purchase orders.';
  end if;
  select * into po from public.purchase_orders where id = p_po and workshop_id = public.my_workshop() for update;
  if po.id is null then raise exception 'Purchase order not found.'; end if;
  return po;
end;
$$;
revoke all on function public.lock_po_for_change(uuid) from public, anon, authenticated;

-- Ordered by phone, online or at the counter: the draft becomes Sent (its lines are then fixed).
create or replace function public.mark_po_sent(p_po uuid)
returns public.purchase_orders
language plpgsql volatile security definer set search_path = public
as $$
declare
  po public.purchase_orders := public.lock_po_for_change(p_po);
begin
  if po.status = 'sent' then return po; end if; -- pressed twice
  if po.status <> 'draft' then raise exception '% is % and cannot be marked as sent.', po.number, po.status; end if;
  if not exists (select 1 from public.purchase_order_lines where po_id = po.id) then
    raise exception 'Add at least one line before sending %.', po.number;
  end if;
  update public.purchase_orders set status = 'sent', sent_at = now() where id = po.id returning * into po;
  return po;
end;
$$;
revoke all on function public.mark_po_sent(uuid) from public, anon;
grant execute on function public.mark_po_sent(uuid) to authenticated;

-- Nothing more will arrive. Stock already received stays; emails still waiting are not sent.
create or replace function public.cancel_po(p_po uuid)
returns public.purchase_orders
language plpgsql volatile security definer set search_path = public
as $$
declare
  po public.purchase_orders := public.lock_po_for_change(p_po);
begin
  if po.status = 'cancelled' then return po; end if;
  if po.status = 'received' then raise exception '% has been fully received and cannot be cancelled.', po.number; end if;
  update public.purchase_orders set status = 'cancelled', cancelled_at = now() where id = po.id returning * into po;
  update public.supplier_outbox set state = 'skipped', last_error = 'The purchase order was cancelled'
  where purchase_order_id = po.id and state = 'pending';
  if po.repair_order_id is not null then
    insert into public.repair_order_events (repair_order_id, workshop_id, kind, title, visible_to_customer, created_by)
    values (po.repair_order_id, po.workshop_id, 'note', 'Parts order ' || po.number || ' cancelled', false, auth.uid());
  end if;
  return po;
end;
$$;
revoke all on function public.cancel_po(uuid) from public, anon;
grant execute on function public.cancel_po(uuid) to authenticated;

-- Receive some or all of an order: p_lines = [{"line_id": uuid, "qty": number, "unit_cost": number (optional)}].
-- All or nothing: one bad line refuses the whole receipt. Never receives more than was ordered.
create or replace function public.receive_po_lines(p_po uuid, p_lines jsonb)
returns public.purchase_orders
language plpgsql volatile security definer set search_path = public
as $$
declare
  po public.purchase_orders := public.lock_po_for_change(p_po);
  e jsonb;
  l public.purchase_order_lines;
  q numeric;
  c numeric;
  seen uuid[] := '{}';
  lid uuid;
  summary text[] := '{}';
begin
  if po.status not in ('draft', 'sent', 'partial') then
    raise exception '% is % and cannot be received.', po.number, po.status;
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Enter a quantity to receive for at least one line.';
  end if;

  for e in select * from jsonb_array_elements(p_lines) loop
    begin
      lid := (e ->> 'line_id')::uuid;
      q := (e ->> 'qty')::numeric;
      c := nullif(e ->> 'unit_cost', '')::numeric;
    exception when others then
      raise exception 'Each line needs a line_id, a qty and optionally a unit_cost as numbers.';
    end;
    if lid is null or q is null then raise exception 'Each line needs a line_id and a qty.'; end if;
    if lid = any (seen) then raise exception 'A line was listed twice.'; end if;
    seen := seen || lid;

    select * into l from public.purchase_order_lines where id = lid and po_id = po.id for update;
    if l.id is null then raise exception 'That line is not on %.', po.number; end if;
    if q <= 0 then raise exception '%: the quantity received must be more than 0.', l.description; end if;
    if q <> round(q, 2) then raise exception '%: use at most two decimals.', l.description; end if;
    if l.part_id is not null and q <> trunc(q) then
      raise exception '%: stock is counted in whole units.', l.description;
    end if;
    if l.received_qty + q > l.quantity then
      raise exception '%: only % left to receive (ordered %, received %).', l.description,
        trim_scale(l.quantity - l.received_qty), trim_scale(l.quantity), trim_scale(l.received_qty);
    end if;
    if c is not null and (c < 0 or c > 10000000 or c <> round(c, 2)) then
      raise exception '%: the unit cost must be 0 or more, with at most two decimals.', l.description;
    end if;

    update public.purchase_order_lines
    set received_qty = received_qty + q, unit_cost = coalesce(c, unit_cost)
    where id = l.id
    returning * into l;

    insert into public.purchase_order_receipts (workshop_id, po_id, line_id, part_id, quantity, unit_cost, received_by)
    values (po.workshop_id, po.id, l.id, l.part_id, q, l.unit_cost, auth.uid());

    if l.part_id is not null then
      update public.parts set stock = stock + q::int where id = l.part_id and workshop_id = po.workshop_id;
      -- The latest cost becomes the part's unit cost (a cost of 0 means "not known" and keeps the old one).
      if l.unit_cost > 0 then
        insert into public.part_costs (part_id, workshop_id, unit_cost) values (l.part_id, po.workshop_id, l.unit_cost)
        on conflict (part_id) do update set unit_cost = excluded.unit_cost;
      end if;
    end if;
    summary := summary || (trim_scale(q)::text || ' x ' || l.description);
  end loop;

  update public.purchase_orders
  set status = case when exists (select 1 from public.purchase_order_lines x where x.po_id = po.id and x.received_qty < x.quantity)
                    then 'partial' else 'received' end,
      sent_at = coalesce(sent_at, now()),
      received_at = case when exists (select 1 from public.purchase_order_lines x where x.po_id = po.id and x.received_qty < x.quantity)
                         then null else now() end
  where id = po.id
  returning * into po;

  if po.repair_order_id is not null then
    insert into public.repair_order_events (repair_order_id, workshop_id, kind, title, body, visible_to_customer, created_by)
    values (po.repair_order_id, po.workshop_id, 'note',
            case when po.status = 'received' then 'Parts order ' || po.number || ' received' else 'Parts order ' || po.number || ' partly received' end,
            array_to_string(summary, '; '), false, auth.uid());
  end if;
  return po;
end;
$$;
revoke all on function public.receive_po_lines(uuid, jsonb) from public, anon;
grant execute on function public.receive_po_lines(uuid, jsonb) to authenticated;

-- Per part: how many are on order (ordered minus received, on sent and partly received orders).
create or replace function public.part_on_order()
returns table (part_id uuid, on_order numeric, open_orders int)
language sql stable security definer set search_path = public
as $$
  select l.part_id, sum(l.quantity - l.received_qty), count(distinct l.po_id)::int
  from public.purchase_order_lines l
  join public.purchase_orders po on po.id = l.po_id
  where po.workshop_id = public.my_workshop() and public.has_access('inventory', 'view')
    and po.status in ('sent', 'partial') and l.part_id is not null and l.received_qty < l.quantity
  group by l.part_id
$$;
revoke all on function public.part_on_order() from public, anon;
grant execute on function public.part_on_order() to authenticated;

-- 6. PDFs and supplier emails ------------------------------------------------------------------------------------

-- Private bucket for documents the ERP makes (purchase orders): <workshop id>/po/<po id>.pdf.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "documents: staff read po pdf" on storage.objects;
create policy "documents: staff read po pdf" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = public.my_workshop()::text
         and (storage.foldername(name))[2] = 'po' and public.has_access('inventory', 'view'));
drop policy if exists "documents: staff upload po pdf" on storage.objects;
create policy "documents: staff upload po pdf" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = public.my_workshop()::text
              and (storage.foldername(name))[2] = 'po' and public.has_access('inventory', 'full'));
drop policy if exists "documents: staff replace po pdf" on storage.objects;
create policy "documents: staff replace po pdf" on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = public.my_workshop()::text
         and (storage.foldername(name))[2] = 'po' and public.has_access('inventory', 'full'));

-- One row per purchase-order email. Written only by attach_po_pdf_and_send; sent by the customer-mailer Edge
-- Function (a Database Webhook on INSERT calls it), retried up to 5 times. Kept apart from customer_outbox so
-- customer emails and their permissions stay exactly as in 023 and 024.
create table if not exists public.supplier_outbox (
  id                 uuid primary key default gen_random_uuid(),
  workshop_id        uuid not null references public.workshops (id) on delete cascade,
  purchase_order_id  uuid not null references public.purchase_orders (id) on delete cascade,
  supplier_id        uuid references public.suppliers (id) on delete set null,
  kind               text not null default 'purchase_order' check (kind in ('purchase_order')),
  to_address         text not null,
  state              text not null default 'pending' check (state in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts           int not null default 0,
  last_error         text,
  requested_by       uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  sent_at            timestamptz
);
create index if not exists supplier_outbox_pending_idx on public.supplier_outbox (created_at) where state in ('pending', 'sending');
create index if not exists supplier_outbox_po_idx on public.supplier_outbox (purchase_order_id, created_at);

alter table public.supplier_outbox enable row level security;
drop policy if exists "supplier_outbox: staff read" on public.supplier_outbox;
create policy "supplier_outbox: staff read" on public.supplier_outbox
  for select to authenticated using (workshop_id = public.my_workshop() and public.has_access('inventory', 'view'));
revoke all on public.supplier_outbox from anon, authenticated;
grant select on public.supplier_outbox to authenticated;

-- The ERP has stored the order's PDF: record it, mark a draft as sent, and queue the email to the supplier.
create or replace function public.attach_po_pdf_and_send(p_po uuid, p_path text)
returns public.purchase_orders
language plpgsql volatile security definer set search_path = public
as $$
declare
  po public.purchase_orders := public.lock_po_for_change(p_po);
  sup public.suppliers;
begin
  if po.status not in ('draft', 'sent', 'partial') then
    raise exception '% is % and cannot be emailed.', po.number, po.status;
  end if;
  if p_path is distinct from (po.workshop_id::text || '/po/' || po.id::text || '.pdf') then
    raise exception 'Unexpected file name for this purchase order.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name = p_path) then
    raise exception 'The PDF of % is not stored yet. Try again.', po.number;
  end if;
  if not exists (select 1 from public.purchase_order_lines where po_id = po.id) then
    raise exception 'Add at least one line before sending %.', po.number;
  end if;
  select * into sup from public.suppliers where id = po.supplier_id;
  if sup.email is null then raise exception '% has no email address. Add one under Suppliers, or use Mark as sent.', sup.name; end if;
  if exists (select 1 from public.supplier_outbox where purchase_order_id = po.id and state in ('pending', 'sending')) then
    raise exception 'The email for % is already waiting to send.', po.number;
  end if;

  update public.purchase_orders
  set pdf_path = p_path,
      status = case when status = 'draft' then 'sent' else status end,
      sent_at = coalesce(sent_at, now())
  where id = po.id
  returning * into po;

  insert into public.supplier_outbox (workshop_id, purchase_order_id, supplier_id, to_address, requested_by)
  values (po.workshop_id, po.id, sup.id, sup.email, auth.uid());
  return po;
end;
$$;
revoke all on function public.attach_po_pdf_and_send(uuid, text) from public, anon;
grant execute on function public.attach_po_pdf_and_send(uuid, text) to authenticated;

-- The Edge Function (service role) claims waiting emails, so two runs never send the same one.
create or replace function public.claim_supplier_outbox(p_limit int default 10)
returns setof public.supplier_outbox
language sql volatile security definer set search_path = public
as $$
  update public.supplier_outbox o set state = 'sending', attempts = o.attempts + 1
  where o.id in (
    select id from public.supplier_outbox
    where state = 'pending' or (state = 'sending' and created_at < now() - interval '10 minutes' and attempts < 5)
    order by created_at limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked)
  returning o.*
$$;
revoke all on function public.claim_supplier_outbox(int) from public, anon, authenticated;
grant execute on function public.claim_supplier_outbox(int) to service_role;

-- 7. Live updates --------------------------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['purchase_orders', 'purchase_order_lines', 'supplier_outbox'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

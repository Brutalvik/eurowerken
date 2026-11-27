-- EuroWerken: automatic customer emails and invoices. Safe to re-run.
--
--   customer_outbox      one row per message to send a customer: a progress email for every status change, and the
--                        invoice email (with the PDF attached) at Ready for pickup. Written by triggers only; sent by
--                        the customer-mailer Edge Function (supabase/functions/customer-mailer), which a Database
--                        Webhook on INSERT calls. Failed sends are retried by the function (up to 5 attempts).
--   invoices             created automatically when a repair order is marked Ready for pickup (INV-0001 per workshop),
--                        from its approved line items. Marking it ready again refreshes the same invoice and resends
--                        it; cancelling the repair voids it. The PDF is made by the Edge Function and kept in the
--                        private "invoices" bucket.
--   workshop_notification_settings gains email_progress, email_invoice and sms_progress (SMS: no provider yet, the
--                        switch stays off and nothing is sent).
--
-- Progress emails follow the customer's "email me" choice (customer_accounts.notify_email); guests get them at the
-- email they booked with. The invoice email is always sent when the shop has invoice emails on.

-- 1. Settings and numbering -------------------------------------------------------------------------------------

alter table public.workshop_notification_settings add column if not exists email_progress boolean not null default true;
alter table public.workshop_notification_settings add column if not exists email_invoice boolean not null default true;
alter table public.workshop_notification_settings add column if not exists sms_progress boolean not null default false;
alter table public.workshop_counters add column if not exists last_invoice int not null default 0;

create or replace function public.set_customer_email_settings(p_progress boolean, p_invoice boolean)
returns void
language plpgsql volatile security definer set search_path = public
as $$
begin
  if public.my_workshop() is null or not public.has_access('settings', 'full') then
    raise exception 'You need full access to Settings to change this.';
  end if;
  insert into public.workshop_notification_settings (workshop_id, email_progress, email_invoice, updated_by, updated_at)
  values (public.my_workshop(), coalesce(p_progress, true), coalesce(p_invoice, true), auth.uid(), now())
  on conflict (workshop_id) do update
    set email_progress = excluded.email_progress, email_invoice = excluded.email_invoice,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end;
$$;
revoke all on function public.set_customer_email_settings(boolean, boolean) from public, anon;
grant execute on function public.set_customer_email_settings(boolean, boolean) to authenticated;

create or replace function public.next_invoice_number(p_workshop uuid)
returns text
language plpgsql volatile security definer set search_path = public
as $$
declare
  n int;
begin
  insert into public.workshop_counters (workshop_id, last_invoice) values (p_workshop, 1)
  on conflict (workshop_id) do update set last_invoice = public.workshop_counters.last_invoice + 1
  returning last_invoice into n;
  return 'INV-' || lpad(n::text, 4, '0');
end;
$$;
revoke all on function public.next_invoice_number(uuid) from public, anon, authenticated;

-- 2. Invoices --------------------------------------------------------------------------------------------------------

create table if not exists public.invoices (
  id               uuid primary key default gen_random_uuid(),
  workshop_id      uuid not null references public.workshops (id) on delete cascade,
  repair_order_id  uuid not null unique references public.repair_orders (id) on delete cascade,
  number           text not null,
  status           text not null default 'issued' check (status in ('issued', 'void')),
  customer_id      uuid references public.customer_accounts (id) on delete set null,
  bill_to          jsonb not null default '{}'::jsonb,   -- {name, email, phone}
  vehicle          jsonb not null default '{}'::jsonb,
  lines            jsonb not null default '[]'::jsonb,   -- [{kind, description, quantity, unit_price, amount}]
  subtotal         numeric(12, 2) not null default 0,
  gst_rate         numeric(5, 4) not null default 0.05,
  gst              numeric(12, 2) not null default 0,
  total            numeric(12, 2) not null default 0,
  issued_at        timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  pdf_path         text,
  unique (workshop_id, number)
);
create index if not exists invoices_workshop_idx on public.invoices (workshop_id, issued_at desc);
create index if not exists invoices_customer_idx on public.invoices (customer_id);

alter table public.invoices enable row level security;
drop policy if exists "invoices: staff read" on public.invoices;
create policy "invoices: staff read" on public.invoices
  for select to authenticated
  using (workshop_id = public.my_workshop() and (public.has_access('invoices', 'view') or public.has_access('repair-orders', 'view')));
drop policy if exists "invoices: customer reads own" on public.invoices;
create policy "invoices: customer reads own" on public.invoices
  for select to authenticated using (customer_id = auth.uid() and status = 'issued');
revoke all on public.invoices from anon, authenticated;
grant select on public.invoices to authenticated;

-- Private bucket for invoice PDFs: <workshop id>/<invoice id>.pdf. Only the Edge Function (service role) writes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoices', 'invoices', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "invoices: staff read pdf" on storage.objects;
create policy "invoices: staff read pdf" on storage.objects
  for select to authenticated
  using (bucket_id = 'invoices' and (storage.foldername(name))[1] = public.my_workshop()::text
         and (public.has_access('invoices', 'view') or public.has_access('repair-orders', 'view')));
drop policy if exists "invoices: customer reads own pdf" on storage.objects;
create policy "invoices: customer reads own pdf" on storage.objects
  for select to authenticated
  using (bucket_id = 'invoices' and exists (
    select 1 from public.invoices i where i.pdf_path = name and i.customer_id = auth.uid() and i.status = 'issued'));

-- Create or refresh the invoice of a repair order from its approved items.
create or replace function public.issue_invoice(p_repair_order uuid)
returns public.invoices
language plpgsql volatile security definer set search_path = public
as $$
declare
  r public.repair_orders;
  inv public.invoices;
  l jsonb;
  sub numeric(12, 2);
  g numeric(12, 2);
begin
  select * into r from public.repair_orders where id = p_repair_order;
  if r.id is null then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', i.kind, 'description', i.description, 'quantity', i.quantity, 'unit_price', i.unit_price,
           'amount', round(i.quantity * i.unit_price, 2)) order by i.sort_order, i.created_at), '[]'::jsonb),
         coalesce(round(sum(i.quantity * i.unit_price), 2), 0)
    into l, sub
  from public.repair_order_items i where i.repair_order_id = r.id and i.approval = 'approved';
  g := round(sub * 0.05, 2);

  select * into inv from public.invoices where repair_order_id = r.id;
  if inv.id is null then
    insert into public.invoices (workshop_id, repair_order_id, number, customer_id, bill_to, vehicle, lines, subtotal, gst, total)
    values (r.workshop_id, r.id, public.next_invoice_number(r.workshop_id), r.customer_id,
            jsonb_build_object('name', r.contact_name, 'email', r.contact_email, 'phone', r.contact_phone),
            r.vehicle, l, sub, g, sub + g)
    returning * into inv;
  else
    update public.invoices
    set status = 'issued', customer_id = r.customer_id,
        bill_to = jsonb_build_object('name', r.contact_name, 'email', r.contact_email, 'phone', r.contact_phone),
        vehicle = r.vehicle, lines = l, subtotal = sub, gst = g, total = sub + g,
        updated_at = now(), pdf_path = null
    where id = inv.id
    returning * into inv;
  end if;
  return inv;
end;
$$;
revoke all on function public.issue_invoice(uuid) from public, anon, authenticated;

-- 3. Outbox -------------------------------------------------------------------------------------------------------------

create table if not exists public.customer_outbox (
  id               uuid primary key default gen_random_uuid(),
  workshop_id      uuid not null references public.workshops (id) on delete cascade,
  repair_order_id  uuid not null references public.repair_orders (id) on delete cascade,
  invoice_id       uuid references public.invoices (id) on delete cascade,
  kind             text not null check (kind in ('status', 'invoice')),
  status           public.repair_order_status,
  channel          text not null default 'email' check (channel in ('email', 'sms')),
  to_address       text,
  state            text not null default 'pending' check (state in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts         int not null default 0,
  last_error       text,
  requested_by     uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  sent_at          timestamptz
);
create index if not exists customer_outbox_pending_idx on public.customer_outbox (created_at) where state = 'pending';
create index if not exists customer_outbox_ro_idx on public.customer_outbox (repair_order_id, created_at);

alter table public.customer_outbox enable row level security;
drop policy if exists "customer_outbox: staff read" on public.customer_outbox;
create policy "customer_outbox: staff read" on public.customer_outbox
  for select to authenticated
  using (workshop_id = public.my_workshop() and (public.has_access('repair-orders', 'view') or public.has_access('invoices', 'view')));
revoke all on public.customer_outbox from anon, authenticated;
grant select on public.customer_outbox to authenticated;

-- Where a repair's emails go: the customer account's email (if they want emails), else the booking email.
create or replace function public.repair_email_address(r public.repair_orders, p_progress boolean)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when a.id is not null and p_progress and not a.notify_email then null
    else nullif(lower(trim(coalesce(a.email, r.contact_email))), '')
  end
  from (select 1) one left join public.customer_accounts a on a.id = r.customer_id
$$;
revoke all on function public.repair_email_address(public.repair_orders, boolean) from public, anon, authenticated;

-- Every status change queues a progress email; Ready for pickup issues the invoice and queues the invoice email.
create or replace function public.repair_orders_queue_customer_email()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  s public.workshop_notification_settings;
  inv public.invoices;
  addr text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then return new; end if;
  select * into s from public.workshop_notification_settings where workshop_id = new.workshop_id;

  if new.status = 'ready' then
    inv := public.issue_invoice(new.id);
    -- The invoice job always runs (it makes the PDF). It emails the customer when the shop sends invoices and
    -- there is an address; otherwise to_address is empty and the reason is kept in last_error.
    addr := public.repair_email_address(new, false);
    insert into public.customer_outbox (workshop_id, repair_order_id, invoice_id, kind, status, to_address, last_error)
    values (new.workshop_id, new.id, inv.id, 'invoice', new.status,
            case when coalesce(s.email_invoice, true) then addr end,
            case when not coalesce(s.email_invoice, true) then 'Invoice emails are off in Settings'
                 when addr is null then 'No email address' end);
    return new;
  end if;

  if new.status = 'cancelled' then
    update public.invoices set status = 'void', updated_at = now() where repair_order_id = new.id and status = 'issued';
  end if;

  if coalesce(s.email_progress, true) then
    addr := public.repair_email_address(new, true);
    if addr is not null then
      insert into public.customer_outbox (workshop_id, repair_order_id, kind, status, to_address)
      values (new.workshop_id, new.id, 'status', new.status, addr);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists repair_orders_queue_customer_email on public.repair_orders;
create trigger repair_orders_queue_customer_email
  after insert or update of status on public.repair_orders
  for each row execute function public.repair_orders_queue_customer_email();

-- Staff: send the invoice again (also makes a fresh PDF).
create or replace function public.resend_invoice(p_invoice uuid)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  inv public.invoices;
  r public.repair_orders;
  addr text;
begin
  select * into inv from public.invoices where id = p_invoice and workshop_id = public.my_workshop();
  if inv.id is null then raise exception 'Invoice not found.'; end if;
  if not (public.has_access('invoices', 'full') or public.has_access('repair-orders', 'full')) then
    raise exception 'You need full access to Invoices or Repair Orders to send invoices.';
  end if;
  if inv.status <> 'issued' then raise exception 'This invoice is void.'; end if;
  select * into r from public.repair_orders where id = inv.repair_order_id;
  addr := public.repair_email_address(r, false);
  if addr is null then raise exception 'This customer has no email address.'; end if;
  update public.invoices set pdf_path = null, updated_at = now() where id = inv.id;
  insert into public.customer_outbox (workshop_id, repair_order_id, invoice_id, kind, status, to_address, requested_by)
  values (inv.workshop_id, inv.repair_order_id, inv.id, 'invoice', r.status, addr, auth.uid());
end;
$$;
revoke all on function public.resend_invoice(uuid) from public, anon;
grant execute on function public.resend_invoice(uuid) to authenticated;

-- The Edge Function (service role) claims pending messages, so two runs never send the same one.
create or replace function public.claim_customer_outbox(p_limit int default 10)
returns setof public.customer_outbox
language sql volatile security definer set search_path = public
as $$
  update public.customer_outbox o set state = 'sending', attempts = o.attempts + 1
  where o.id in (
    select id from public.customer_outbox
    where state = 'pending' or (state = 'sending' and created_at < now() - interval '10 minutes' and attempts < 5)
    order by created_at limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked)
  returning o.*
$$;
revoke all on function public.claim_customer_outbox(int) from public, anon, authenticated;
grant execute on function public.claim_customer_outbox(int) to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'invoices') then
      alter publication supabase_realtime add table public.invoices;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'customer_outbox') then
      alter publication supabase_realtime add table public.customer_outbox;
    end if;
  end if;
end $$;

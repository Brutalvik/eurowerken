-- EuroWerken: payments (Helcim card payments, manual payments, balances and refunds). Safe to re-run. Run after 028.
--
--   workshop_payment_settings   one row per workshop: Helcim connected or not, the last 4 characters of the API token
--                               (token_hint), whether customers may pay online. The token itself is stored ONLY in
--                               Supabase Vault (vault.secrets); only service_role reads it, through get_helcim_token().
--   payments                    every payment and refund, one row each, never deleted. A succeeded or failed row
--                               cannot change. Card refunds start as "pending" (the Helcim request is in flight) and
--                               become succeeded or failed exactly once.
--   payment_checkouts           one HelcimPay.js session (checkoutToken + secretToken, 60 minutes at Helcim). Only the
--                               payments Edge Function (service_role) reads or writes it: the secretToken never leaves
--                               the server.
--   invoices.amount_paid, balance, payment_status
--                               kept correct by triggers: always recomputed from succeeded payments minus succeeded
--                               refunds, whenever a payment changes or the invoice total or status changes (re-issued
--                               or void). Nothing else can write them.
--
-- Money rules: amounts are numeric(12,2), positive, whole cents. Manual payments can never exceed the balance. A card
-- payment that Helcim approved is always recorded, even if the balance went down meanwhile (the money was taken: the
-- invoice then shows a credit to refund). Card transactions are recorded once: provider_transaction_id is unique.
-- Every money function locks the invoice row first, so two payments on one invoice never interleave.
-- Financial rows are never deleted: payments restrict deleting their invoice or repair order.

-- 1. Settings ------------------------------------------------------------------------------------------------------

create table if not exists public.workshop_payment_settings (
  workshop_id              uuid primary key references public.workshops (id) on delete cascade,
  provider                 text not null default 'helcim' check (provider in ('helcim')),
  enabled                  boolean not null default false,
  token_hint               text check (token_hint is null or length(token_hint) <= 4),
  vault_secret_id          uuid,
  online_payments_enabled  boolean not null default true,
  connected_at             timestamptz,
  connected_by             uuid,
  updated_at               timestamptz not null default now()
);

alter table public.workshop_payment_settings enable row level security;
drop policy if exists "payment settings: staff read" on public.workshop_payment_settings;
create policy "payment settings: staff read" on public.workshop_payment_settings
  for select to authenticated using (workshop_id = public.my_workshop() and public.my_role() is not null);
revoke all on public.workshop_payment_settings from anon, authenticated;
-- Staff read the row but not the Vault id.
grant select (workshop_id, provider, enabled, token_hint, online_payments_enabled, connected_at, connected_by, updated_at)
  on public.workshop_payment_settings to authenticated;
grant all on public.workshop_payment_settings to service_role;

-- Store (or replace) the shop's Helcim API token in Vault. Settings (full).
create or replace function public.set_helcim_token(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = public, vault
as $$
declare
  ws uuid := public.my_workshop();
  t text := btrim(coalesce(p_token, ''));
  s public.workshop_payment_settings;
  sid uuid;
begin
  if ws is null or not public.has_access('settings', 'full') then
    raise exception 'You need full access to Settings to connect payments.';
  end if;
  if length(t) < 16 or length(t) > 300 or t !~ '^[\x21-\x7e]+$' then
    raise exception 'That does not look like a Helcim API token. Copy the whole token from Helcim (All Tools > Integrations > API Access Configurations).';
  end if;
  insert into public.workshop_payment_settings (workshop_id) values (ws) on conflict (workshop_id) do nothing;
  select * into s from public.workshop_payment_settings where workshop_id = ws for update;
  if s.vault_secret_id is not null and exists (select 1 from vault.secrets where id = s.vault_secret_id) then
    perform vault.update_secret(s.vault_secret_id, t);
    sid := s.vault_secret_id;
  else
    -- Vault names are unique: drop a stale secret of this workshop first.
    delete from vault.secrets where name = 'helcim_api_token_' || ws::text;
    sid := vault.create_secret(t, 'helcim_api_token_' || ws::text, 'Helcim API token of workshop ' || ws::text);
  end if;
  update public.workshop_payment_settings
  set enabled = true, provider = 'helcim', token_hint = right(t, 4), vault_secret_id = sid,
      connected_at = now(), connected_by = auth.uid(), updated_at = now()
  where workshop_id = ws;
  return jsonb_build_object('enabled', true, 'token_hint', right(t, 4));
end;
$$;
revoke all on function public.set_helcim_token(text) from public, anon;
grant execute on function public.set_helcim_token(text) to authenticated;

-- Remove the token from Vault and switch card payments off. Settings (full). Recorded payments stay.
create or replace function public.disconnect_helcim()
returns void
language plpgsql volatile security definer set search_path = public, vault
as $$
declare
  ws uuid := public.my_workshop();
  s public.workshop_payment_settings;
begin
  if ws is null or not public.has_access('settings', 'full') then
    raise exception 'You need full access to Settings to disconnect payments.';
  end if;
  select * into s from public.workshop_payment_settings where workshop_id = ws for update;
  if s.workshop_id is null then return; end if;
  if s.vault_secret_id is not null then delete from vault.secrets where id = s.vault_secret_id; end if;
  delete from vault.secrets where name = 'helcim_api_token_' || ws::text;
  update public.workshop_payment_settings
  set enabled = false, token_hint = null, vault_secret_id = null, connected_at = null, connected_by = null, updated_at = now()
  where workshop_id = ws;
  update public.payment_checkouts set status = 'expired', last_error = 'Payments were disconnected'
  where workshop_id = ws and status = 'open';
end;
$$;
revoke all on function public.disconnect_helcim() from public, anon;
grant execute on function public.disconnect_helcim() to authenticated;

-- Customers may pay invoices online (Pay now on the customer site). Settings (full).
create or replace function public.set_online_payments(p_enabled boolean)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  ws uuid := public.my_workshop();
begin
  if ws is null or not public.has_access('settings', 'full') then
    raise exception 'You need full access to Settings to change this.';
  end if;
  insert into public.workshop_payment_settings (workshop_id, online_payments_enabled, updated_at)
  values (ws, coalesce(p_enabled, true), now())
  on conflict (workshop_id) do update set online_payments_enabled = excluded.online_payments_enabled, updated_at = now();
end;
$$;
revoke all on function public.set_online_payments(boolean) from public, anon;
grant execute on function public.set_online_payments(boolean) to authenticated;

-- The token, for the payments Edge Function only.
create or replace function public.get_helcim_token(p_workshop uuid)
returns text
language sql stable security definer set search_path = public, vault
as $$
  select d.decrypted_secret
  from public.workshop_payment_settings s
  join vault.decrypted_secrets d on d.id = s.vault_secret_id
  where s.workshop_id = p_workshop and s.enabled
$$;
revoke all on function public.get_helcim_token(uuid) from public, anon, authenticated;
grant execute on function public.get_helcim_token(uuid) to service_role;

-- 2. Payments --------------------------------------------------------------------------------------------------------

alter table public.invoices add column if not exists amount_paid numeric(12, 2) not null default 0;
alter table public.invoices add column if not exists balance numeric(12, 2);
alter table public.invoices add column if not exists payment_status text not null default 'unpaid';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_payment_status_check') then
    alter table public.invoices add constraint invoices_payment_status_check
      check (payment_status in ('unpaid', 'partial', 'paid', 'refunded'));
  end if;
end $$;

create table if not exists public.payments (
  id                       uuid primary key default gen_random_uuid(),
  workshop_id              uuid not null references public.workshops (id) on delete restrict,
  invoice_id               uuid not null references public.invoices (id) on delete restrict,
  repair_order_id          uuid references public.repair_orders (id) on delete restrict,
  kind                     text not null check (kind in ('payment', 'refund')),
  amount                   numeric(12, 2) not null check (amount > 0),
  currency                 text not null default 'CAD' check (currency = 'CAD'),
  method                   text not null check (method in ('card_online', 'card_present', 'debit', 'cash', 'cheque', 'etransfer', 'other')),
  status                   text not null default 'succeeded' check (status in ('succeeded', 'pending', 'failed')),
  provider                 text check (provider in ('helcim')),
  provider_transaction_id  text,
  card_brand               text check (card_brand is null or length(card_brand) <= 30),
  card_last4               text check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  refund_of                uuid references public.payments (id) on delete restrict,
  checkout_id              uuid,
  client_request_id        uuid unique,
  note                     text check (note is null or length(note) <= 500),
  failure_reason           text check (failure_reason is null or length(failure_reason) <= 500),
  received_at              timestamptz not null default now(),
  recorded_by              uuid,
  customer_id              uuid,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint payments_refund_link check ((kind = 'refund') = (refund_of is not null)),
  constraint payments_provider_txn check (provider_transaction_id is null or provider is not null),
  constraint payments_succeeded_card_has_txn check (not (provider is not null and status = 'succeeded' and provider_transaction_id is null)),
  constraint payments_pending_is_card_refund check (status <> 'pending' or (kind = 'refund' and provider is not null))
);
create unique index if not exists payments_provider_txn_idx on public.payments (provider, provider_transaction_id)
  where provider_transaction_id is not null;
create index if not exists payments_invoice_idx on public.payments (invoice_id, created_at);
create index if not exists payments_workshop_idx on public.payments (workshop_id, received_at desc);
create index if not exists payments_refund_of_idx on public.payments (refund_of);

alter table public.payments enable row level security;
drop policy if exists "payments: staff read" on public.payments;
create policy "payments: staff read" on public.payments
  for select to authenticated
  using (workshop_id = public.my_workshop() and (public.has_access('invoices', 'view') or public.has_access('repair-orders', 'view')));
drop policy if exists "payments: customer reads own" on public.payments;
create policy "payments: customer reads own" on public.payments
  for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and i.customer_id = auth.uid() and i.status = 'issued'));
revoke all on public.payments from anon, authenticated;
grant select (id, workshop_id, invoice_id, repair_order_id, kind, amount, currency, method, status, provider,
              provider_transaction_id, card_brand, card_last4, refund_of, note, failure_reason, received_at,
              recorded_by, customer_id, created_at, updated_at)
  on public.payments to authenticated;
grant all on public.payments to service_role;

-- A succeeded or failed payment is final. Pending (a card refund in flight) may become succeeded or failed once.
-- Only the links (customer, repair order, recorder) may change afterwards. Payments are never deleted.
create or replace function public.payments_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    -- Only supabase/scripts/reset_activity.sql deletes payments, inside its own transaction with this setting on.
    if current_setting('eurowerken.allow_activity_delete', true) = 'on' then return old; end if;
    raise exception 'Payments are permanent records and cannot be deleted. Record a refund instead.';
  end if;
  if old.status = 'pending' then
    if new.status not in ('pending', 'succeeded', 'failed') then raise exception 'Invalid payment status.'; end if;
    if (new.id, new.workshop_id, new.invoice_id, new.kind, new.amount, new.currency, new.method, new.provider, new.refund_of)
       is distinct from
       (old.id, old.workshop_id, old.invoice_id, old.kind, old.amount, old.currency, old.method, old.provider, old.refund_of) then
      raise exception 'A pending refund can only be completed or marked failed.';
    end if;
  else
    if (new.id, new.workshop_id, new.invoice_id, new.kind, new.amount, new.currency, new.method, new.status, new.provider,
        new.provider_transaction_id, new.card_brand, new.card_last4, new.refund_of, new.checkout_id, new.client_request_id,
        new.note, new.failure_reason, new.received_at, new.created_at)
       is distinct from
       (old.id, old.workshop_id, old.invoice_id, old.kind, old.amount, old.currency, old.method, old.status, old.provider,
        old.provider_transaction_id, old.card_brand, old.card_last4, old.refund_of, old.checkout_id, old.client_request_id,
        old.note, old.failure_reason, old.received_at, old.created_at) then
      raise exception 'Recorded payments cannot be changed. Record a refund instead.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists payments_guard on public.payments;
create trigger payments_guard before update or delete on public.payments
  for each row execute function public.payments_guard();

-- 3. Balances --------------------------------------------------------------------------------------------------------

-- Recomputes amount_paid, balance and payment_status from the payments table every time an invoice row is written:
-- whatever value a writer supplies is ignored.
create or replace function public.invoices_compute_balance()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  paid numeric(12, 2);
  refunded numeric(12, 2);
begin
  select coalesce(sum(amount) filter (where kind = 'payment'), 0), coalesce(sum(amount) filter (where kind = 'refund'), 0)
    into paid, refunded
  from public.payments where invoice_id = new.id and status = 'succeeded';
  new.amount_paid := paid - refunded;
  new.balance := (case when new.status = 'issued' then new.total else 0 end) - new.amount_paid;
  new.payment_status := case
    when new.amount_paid <= 0 and refunded > 0 then 'refunded'
    when new.amount_paid <= 0 then 'unpaid'
    when new.balance <= 0 then 'paid'
    else 'partial' end;
  return new;
end;
$$;
drop trigger if exists invoices_compute_balance on public.invoices;
create trigger invoices_compute_balance before insert or update on public.invoices
  for each row execute function public.invoices_compute_balance();

create or replace function public.payments_refresh_invoice()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- Touching the row runs invoices_compute_balance.
  update public.invoices set amount_paid = amount_paid where id = new.invoice_id;
  return null;
end;
$$;
drop trigger if exists payments_refresh_invoice on public.payments;
create trigger payments_refresh_invoice after insert or update on public.payments
  for each row execute function public.payments_refresh_invoice();

-- Backfill every invoice (also fills balance where it was null).
update public.invoices set amount_paid = amount_paid;
alter table public.invoices alter column balance set not null;

-- 4. Checkouts (HelcimPay.js sessions; service_role only) ---------------------------------------------------------------

create table if not exists public.payment_checkouts (
  id              uuid primary key default gen_random_uuid(),
  workshop_id     uuid not null references public.workshops (id) on delete cascade,
  invoice_id      uuid not null references public.invoices (id) on delete cascade,
  amount          numeric(12, 2) not null check (amount > 0),
  currency        text not null default 'CAD' check (currency = 'CAD'),
  checkout_token  text,
  secret_token    text,
  status          text not null default 'open' check (status in ('open', 'completed', 'expired')),
  created_by      uuid,          -- staff who started it
  created_for     uuid,          -- signed-in customer who started it
  guest           boolean not null default false,
  transaction_id  text,
  payment_id      uuid references public.payments (id) on delete restrict,
  last_error      text,
  expires_at      timestamptz not null default now() + interval '60 minutes',
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists payment_checkouts_invoice_idx on public.payment_checkouts (invoice_id, created_at desc);
alter table public.payment_checkouts enable row level security;
revoke all on public.payment_checkouts from public, anon, authenticated;
grant all on public.payment_checkouts to service_role;

-- 5. Helpers -----------------------------------------------------------------------------------------------------------

create or replace function public.invoice_payment_state(p_invoice uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('invoice_id', i.id, 'total', i.total, 'amount_paid', i.amount_paid, 'balance', i.balance,
                            'payment_status', i.payment_status, 'status', i.status)
  from public.invoices i where i.id = p_invoice
$$;
revoke all on function public.invoice_payment_state(uuid) from public, anon, authenticated;
grant execute on function public.invoice_payment_state(uuid) to service_role;

create or replace function public.assert_money(p_amount numeric)
returns void
language plpgsql immutable
as $$
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount above zero.'; end if;
  if p_amount <> round(p_amount, 2) then raise exception 'Amounts are in dollars and cents (two decimals at most).'; end if;
  if p_amount > 9999999999.99 then raise exception 'That amount is too large.'; end if;
end;
$$;
revoke all on function public.assert_money(numeric) from public, anon;
grant execute on function public.assert_money(numeric) to authenticated, service_role;

-- 6. Manual payments and refunds (staff) ----------------------------------------------------------------------------------

create or replace function public.record_manual_payment(
  p_invoice uuid, p_amount numeric, p_method text, p_note text default null, p_received_at timestamptz default null,
  p_request_id uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  inv public.invoices;
  existing public.payments;
  pid uuid;
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if public.my_workshop() is null or not (public.has_access('invoices', 'full') or public.has_access('repair-orders', 'full')) then
    raise exception 'You need full access to Invoices or Repair Orders to record payments.';
  end if;
  -- The same request sent twice (a double click, a retry after a lost reply) records once.
  if p_request_id is not null then
    select * into existing from public.payments where client_request_id = p_request_id;
    if existing.id is not null then
      if existing.workshop_id <> public.my_workshop() then raise exception 'Payment not found.'; end if;
      return public.invoice_payment_state(existing.invoice_id) || jsonb_build_object('payment_id', existing.id, 'duplicate', true);
    end if;
  end if;
  select * into inv from public.invoices where id = p_invoice and workshop_id = public.my_workshop() for update;
  if inv.id is null then raise exception 'Invoice not found.'; end if;
  -- Checked again under the lock: two copies of one request sent at once still record once.
  if p_request_id is not null and exists (select 1 from public.payments where client_request_id = p_request_id) then
    return public.invoice_payment_state(inv.id) || jsonb_build_object('payment_id',
      (select id from public.payments where client_request_id = p_request_id), 'duplicate', true);
  end if;
  if inv.status <> 'issued' then raise exception 'This invoice is void. Payments cannot be recorded on it.'; end if;
  if p_method is null or p_method not in ('card_present', 'debit', 'cash', 'cheque', 'etransfer', 'other') then
    raise exception 'Choose how the customer paid: card on a terminal, debit, cash, cheque, e-transfer or other. Online card payments are recorded by Helcim.';
  end if;
  perform public.assert_money(p_amount);
  if inv.balance <= 0 then raise exception 'This invoice is already paid.'; end if;
  if p_amount > inv.balance then
    raise exception 'That is more than the balance of % on this invoice.', to_char(inv.balance, 'FM$999,999,990.00');
  end if;
  if p_received_at is not null and (p_received_at > now() + interval '10 minutes' or p_received_at < now() - interval '3 years') then
    raise exception 'The date received cannot be in the future or more than 3 years ago.';
  end if;
  if length(note) > 500 then raise exception 'Keep the note under 500 characters.'; end if;
  insert into public.payments (workshop_id, invoice_id, repair_order_id, kind, amount, method, status, note, received_at,
                               recorded_by, customer_id, client_request_id)
  values (inv.workshop_id, inv.id, inv.repair_order_id, 'payment', p_amount, p_method, 'succeeded', note,
          coalesce(p_received_at, now()), auth.uid(), inv.customer_id, p_request_id)
  returning id into pid;
  return public.invoice_payment_state(inv.id) || jsonb_build_object('payment_id', pid, 'duplicate', false);
end;
$$;
revoke all on function public.record_manual_payment(uuid, numeric, text, text, timestamptz, uuid) from public, anon;
grant execute on function public.record_manual_payment(uuid, numeric, text, text, timestamptz, uuid) to authenticated;

-- What is still refundable on a payment: its amount less succeeded and in-flight refunds.
create or replace function public.payment_refundable(p_payment uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select p.amount - coalesce((select sum(r.amount) from public.payments r
                              where r.refund_of = p.id and r.status in ('succeeded', 'pending')), 0)
  from public.payments p where p.id = p_payment
$$;
revoke all on function public.payment_refundable(uuid) from public, anon;
grant execute on function public.payment_refundable(uuid) to authenticated, service_role;

create or replace function public.record_manual_refund(p_payment uuid, p_amount numeric, p_note text default null, p_request_id uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  p public.payments;
  existing public.payments;
  rid uuid;
  left_amount numeric(12, 2);
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if public.my_workshop() is null or not (public.has_access('invoices', 'full') or public.has_access('repair-orders', 'full')) then
    raise exception 'You need full access to Invoices or Repair Orders to record refunds.';
  end if;
  if p_request_id is not null then
    select * into existing from public.payments where client_request_id = p_request_id;
    if existing.id is not null then
      if existing.workshop_id <> public.my_workshop() then raise exception 'Payment not found.'; end if;
      return public.invoice_payment_state(existing.invoice_id) || jsonb_build_object('payment_id', existing.id, 'duplicate', true);
    end if;
  end if;
  select * into p from public.payments where id = p_payment and workshop_id = public.my_workshop();
  if p.id is null then raise exception 'Payment not found.'; end if;
  -- Lock the invoice: refunds and payments on one invoice happen one at a time.
  perform 1 from public.invoices where id = p.invoice_id for update;
  if p_request_id is not null and exists (select 1 from public.payments where client_request_id = p_request_id) then
    return public.invoice_payment_state(p.invoice_id) || jsonb_build_object('payment_id',
      (select id from public.payments where client_request_id = p_request_id), 'duplicate', true);
  end if;
  if p.kind <> 'payment' or p.status <> 'succeeded' then raise exception 'Only a received payment can be refunded.'; end if;
  if p.method = 'card_online' or p.provider is not null then
    raise exception 'This was paid by card through Helcim. Use Refund to card, so the money goes back to the card.';
  end if;
  perform public.assert_money(p_amount);
  left_amount := public.payment_refundable(p.id);
  if p_amount > left_amount then
    raise exception 'That is more than the % still refundable on this payment.', to_char(left_amount, 'FM$999,999,990.00');
  end if;
  if length(note) > 500 then raise exception 'Keep the note under 500 characters.'; end if;
  insert into public.payments (workshop_id, invoice_id, repair_order_id, kind, amount, method, status, refund_of, note,
                               recorded_by, customer_id, client_request_id)
  values (p.workshop_id, p.invoice_id, p.repair_order_id, 'refund', p_amount, p.method, 'succeeded', p.id, note,
          auth.uid(), p.customer_id, p_request_id)
  returning id into rid;
  return public.invoice_payment_state(p.invoice_id) || jsonb_build_object('payment_id', rid, 'duplicate', false);
end;
$$;
revoke all on function public.record_manual_refund(uuid, numeric, text, uuid) from public, anon;
grant execute on function public.record_manual_refund(uuid, numeric, text, uuid) to authenticated;

-- 7. Checks the Edge Function runs AS THE CALLER (their JWT), so RLS and has_access decide ----------------------------------

-- Staff: may this user take a payment on (or refund on) this invoice? Returns what the function needs.
create or replace function public.payment_staff_check(p_invoice uuid default null, p_payment uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  ws uuid := public.my_workshop();
  inv_id uuid := p_invoice;
begin
  if ws is null or public.my_role() is null then raise exception 'Sign in with a staff account of this workshop.'; end if;
  if p_payment is not null then
    select invoice_id into inv_id from public.payments where id = p_payment and workshop_id = ws;
    if inv_id is null then raise exception 'Payment not found.'; end if;
  end if;
  if inv_id is not null and not exists (select 1 from public.invoices where id = inv_id and workshop_id = ws) then
    raise exception 'Invoice not found.';
  end if;
  return jsonb_build_object(
    'workshop_id', ws, 'invoice_id', inv_id, 'user_id', auth.uid(),
    'payments_full', public.has_access('invoices', 'full') or public.has_access('repair-orders', 'full'),
    'settings_full', public.has_access('settings', 'full'));
end;
$$;
revoke all on function public.payment_staff_check(uuid, uuid) from public, anon;
grant execute on function public.payment_staff_check(uuid, uuid) to authenticated;

-- What paying needs, and nothing more.
create or replace function public.invoice_pay_info(inv public.invoices)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'invoice_id', inv.id, 'number', inv.number, 'total', inv.total, 'amount_paid', inv.amount_paid,
    'balance', greatest(inv.balance, 0)::numeric(12, 2), 'payment_status', inv.payment_status,
    'shop_name', coalesce((select display_name from public.workshop_sites where workshop_id = inv.workshop_id),
                          (select name from public.workshops where id = inv.workshop_id)),
    'online_payments', coalesce((select s.enabled and s.online_payments_enabled from public.workshop_payment_settings s
                                 where s.workshop_id = inv.workshop_id), false),
    'last_payment', (select jsonb_build_object('amount', p.amount, 'received_at', p.received_at, 'method', p.method,
                                               'card_brand', p.card_brand, 'card_last4', p.card_last4)
                     from public.payments p where p.invoice_id = inv.id and p.kind = 'payment' and p.status = 'succeeded'
                     order by p.received_at desc limit 1))
$$;
revoke all on function public.invoice_pay_info(public.invoices) from public, anon, authenticated;

-- Guests (and signed-in owners) on the tracking page: tracking code plus the email or phone they booked with.
create or replace function public.invoice_for_payment(p_slug text, p_code text, p_contact text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  r public.repair_orders;
  inv public.invoices;
begin
  r := public.repair_for_contact(p_slug, p_code, p_contact);
  if r.id is null then
    raise exception 'We could not find a repair with those details. Check the tracking code and the email or phone you booked with.';
  end if;
  select * into inv from public.invoices where repair_order_id = r.id and status = 'issued';
  if inv.id is null then return null; end if;
  return public.invoice_pay_info(inv);
end;
$$;
revoke all on function public.invoice_for_payment(text, text, text) from public;
grant execute on function public.invoice_for_payment(text, text, text) to anon, authenticated, service_role;

-- Signed-in customers: one of their own invoices.
create or replace function public.my_invoice_for_payment(p_invoice uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  inv public.invoices;
begin
  if auth.uid() is null then raise exception 'Sign in to pay this invoice.'; end if;
  select * into inv from public.invoices where id = p_invoice and customer_id = auth.uid() and status = 'issued';
  if inv.id is null then raise exception 'Invoice not found.'; end if;
  return public.invoice_pay_info(inv);
end;
$$;
revoke all on function public.my_invoice_for_payment(uuid) from public, anon;
grant execute on function public.my_invoice_for_payment(uuid) to authenticated;

-- 8. Service-role functions (the payments Edge Function) --------------------------------------------------------------------

-- Opens a checkout for the server-computed balance. Exactly one way in: staff (p_staff, already checked with
-- payment_staff_check as that user; may choose a smaller amount), the signed-in owner (p_customer), or a guest
-- (slug, code, contact, verified again here). Returns the checkout id and amount; the Edge Function then asks Helcim
-- for the tokens and stores them with attach_checkout_tokens.
create or replace function public.open_checkout(
  p_invoice uuid, p_amount numeric default null, p_staff uuid default null, p_customer uuid default null,
  p_slug text default null, p_code text default null, p_contact text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  inv public.invoices;
  s public.workshop_payment_settings;
  r public.repair_orders;
  amt numeric(12, 2);
  cid uuid;
  ways int := (p_staff is not null)::int + (p_customer is not null)::int + (p_code is not null)::int;
begin
  if ways <> 1 then raise exception 'open_checkout: exactly one of staff, customer or guest.'; end if;
  if p_code is not null then
    r := public.repair_for_contact(p_slug, p_code, p_contact);
    if r.id is null then
      raise exception 'We could not find a repair with those details. Check the tracking code and the email or phone you booked with.';
    end if;
    select id into p_invoice from public.invoices where repair_order_id = r.id and status = 'issued';
  end if;
  select * into inv from public.invoices where id = p_invoice for update;
  if inv.id is null then raise exception 'Invoice not found.'; end if;
  if p_customer is not null and inv.customer_id is distinct from p_customer then raise exception 'Invoice not found.'; end if;
  if inv.status <> 'issued' then raise exception 'This invoice is void and cannot be paid.'; end if;
  select * into s from public.workshop_payment_settings where workshop_id = inv.workshop_id;
  if not coalesce(s.enabled, false) or s.vault_secret_id is null then
    raise exception 'Card payments are not set up for this shop yet.';
  end if;
  if p_staff is null and not s.online_payments_enabled then
    raise exception 'This shop does not take payments online. Pay at the shop.';
  end if;
  if inv.balance <= 0 then raise exception 'This invoice is already paid.'; end if;
  if p_amount is null then
    amt := inv.balance;
  else
    if p_staff is null then raise exception 'Online payments are for the full balance.'; end if;
    perform public.assert_money(p_amount);
    if p_amount > inv.balance then
      raise exception 'That is more than the balance of % on this invoice.', to_char(inv.balance, 'FM$999,999,990.00');
    end if;
    amt := p_amount;
  end if;
  update public.payment_checkouts set status = 'expired' where invoice_id = inv.id and status = 'open' and expires_at < now();
  insert into public.payment_checkouts (workshop_id, invoice_id, amount, created_by, created_for, guest, expires_at)
  values (inv.workshop_id, inv.id, amt, p_staff, p_customer, p_code is not null, now() + interval '60 minutes')
  returning id into cid;
  return jsonb_build_object('checkout_id', cid, 'amount', amt, 'workshop_id', inv.workshop_id, 'invoice_id', inv.id,
                            'invoice_number', inv.number, 'currency', 'CAD');
end;
$$;
revoke all on function public.open_checkout(uuid, numeric, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.open_checkout(uuid, numeric, uuid, uuid, text, text, text) to service_role;

-- Records an approved Helcim card payment for a checkout. Idempotent: the same transaction recorded again returns
-- the invoice state without a second row. The Edge Function has already checked the hash with the secretToken and
-- re-read the transaction from Helcim (approved, purchase, CAD, this amount).
create or replace function public.record_card_payment(
  p_checkout uuid, p_transaction_id text, p_amount numeric, p_card_brand text default null, p_card_last4 text default null,
  p_received_at timestamptz default null)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  c public.payment_checkouts;
  inv public.invoices;
  existing public.payments;
  pid uuid;
  txn text := nullif(btrim(coalesce(p_transaction_id, '')), '');
begin
  if txn is null then raise exception 'record_card_payment: transaction id missing.'; end if;
  select * into c from public.payment_checkouts where id = p_checkout;
  if c.id is null then raise exception 'Checkout not found.'; end if;
  select * into inv from public.invoices where id = c.invoice_id for update;
  select * into c from public.payment_checkouts where id = p_checkout for update;

  select * into existing from public.payments where provider = 'helcim' and provider_transaction_id = txn;
  if existing.id is not null then
    -- One Helcim transaction belongs to exactly one checkout.
    if existing.invoice_id <> c.invoice_id or existing.kind <> 'payment' or existing.checkout_id is distinct from c.id then
      raise exception 'This card transaction is already recorded for another payment.';
    end if;
    update public.payment_checkouts set status = 'completed', transaction_id = txn, payment_id = existing.id,
           completed_at = coalesce(completed_at, now())
    where id = c.id and (status <> 'completed' or payment_id is null);
    return public.invoice_payment_state(inv.id) || jsonb_build_object('payment_id', existing.id, 'duplicate', true);
  end if;
  if c.status = 'completed' then raise exception 'This checkout already recorded a different transaction.'; end if;
  perform public.assert_money(p_amount);
  if p_amount <> c.amount then raise exception 'The card amount does not match this checkout.'; end if;

  -- Approved at Helcim: always recorded, even if the invoice changed meanwhile (it then shows a credit).
  insert into public.payments (workshop_id, invoice_id, repair_order_id, kind, amount, method, status, provider,
                               provider_transaction_id, card_brand, card_last4, checkout_id, received_at, recorded_by,
                               customer_id, note)
  values (inv.workshop_id, inv.id, inv.repair_order_id, 'payment', p_amount, 'card_online', 'succeeded', 'helcim', txn,
          left(nullif(btrim(coalesce(p_card_brand, '')), ''), 30),
          case when p_card_last4 ~ '^[0-9]{4}$' then p_card_last4 end,
          c.id, coalesce(p_received_at, now()), c.created_by, coalesce(c.created_for, inv.customer_id),
          case when c.created_by is null then 'Paid online' end)
  returning id into pid;
  update public.payment_checkouts set status = 'completed', transaction_id = txn, payment_id = pid, completed_at = now(),
         last_error = null
  where id = c.id;
  return public.invoice_payment_state(inv.id) || jsonb_build_object('payment_id', pid, 'duplicate', false);
end;
$$;
revoke all on function public.record_card_payment(uuid, text, numeric, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_card_payment(uuid, text, numeric, text, text, timestamptz) to service_role;

-- Starts a card refund: a pending refund row whose id is the Helcim idempotency key. A refund still pending for the
-- same payment and amount is returned again (a retry after a lost reply must reuse the same key, never send a second
-- refund). p_staff has passed payment_staff_check with payments_full.
create or replace function public.begin_card_refund(p_payment uuid, p_amount numeric, p_staff uuid, p_note text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  p public.payments;
  pend public.payments;
  rid uuid;
  left_amount numeric(12, 2);
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into p from public.payments where id = p_payment;
  if p.id is null then raise exception 'Payment not found.'; end if;
  perform 1 from public.invoices where id = p.invoice_id for update;
  if p.kind <> 'payment' or p.status <> 'succeeded' then raise exception 'Only a received payment can be refunded.'; end if;
  if p.provider is distinct from 'helcim' or p.provider_transaction_id is null then
    raise exception 'This payment was not made through Helcim. Record the refund by hand instead.';
  end if;
  select * into pend from public.payments where refund_of = p.id and status = 'pending' order by created_at limit 1;
  if pend.id is not null then
    if pend.amount = p_amount then
      return jsonb_build_object('refund_id', pend.id, 'original_transaction_id', p.provider_transaction_id,
                                'workshop_id', p.workshop_id, 'payment_amount', p.amount, 'amount', pend.amount,
                                'other_refunds', (select count(*) from public.payments r where r.refund_of = p.id and r.id <> pend.id
                                                  and r.status = 'succeeded'), 'resumed', true);
    end if;
    raise exception 'A refund of % on this payment is still being processed. Press Refund to card again with that amount to finish it.',
      to_char(pend.amount, 'FM$999,999,990.00');
  end if;
  perform public.assert_money(p_amount);
  left_amount := public.payment_refundable(p.id);
  if p_amount > left_amount then
    raise exception 'That is more than the % still refundable on this payment.', to_char(left_amount, 'FM$999,999,990.00');
  end if;
  insert into public.payments (workshop_id, invoice_id, repair_order_id, kind, amount, method, status, provider, refund_of,
                               recorded_by, customer_id, note, card_brand, card_last4)
  values (p.workshop_id, p.invoice_id, p.repair_order_id, 'refund', p_amount, p.method, 'pending', 'helcim', p.id,
          p_staff, p.customer_id, left(note, 500), p.card_brand, p.card_last4)
  returning id into rid;
  return jsonb_build_object('refund_id', rid, 'original_transaction_id', p.provider_transaction_id, 'workshop_id', p.workshop_id,
                            'payment_amount', p.amount, 'amount', p_amount,
                            'other_refunds', (select count(*) from public.payments r where r.refund_of = p.id and r.id <> rid
                                              and r.status = 'succeeded'), 'resumed', false);
end;
$$;
revoke all on function public.begin_card_refund(uuid, numeric, uuid, text) from public, anon, authenticated;
grant execute on function public.begin_card_refund(uuid, numeric, uuid, text) to service_role;

-- Finishes a card refund once Helcim has answered. Idempotent on the Helcim transaction id.
create or replace function public.record_card_refund(p_refund uuid, p_transaction_id text, p_succeeded boolean, p_failure text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  r public.payments;
  existing public.payments;
  txn text := nullif(btrim(coalesce(p_transaction_id, '')), '');
begin
  select * into r from public.payments where id = p_refund;
  if r.id is null or r.kind <> 'refund' or r.provider is null then raise exception 'Refund not found.'; end if;
  perform 1 from public.invoices where id = r.invoice_id for update;
  select * into r from public.payments where id = p_refund for update;
  if txn is not null then
    select * into existing from public.payments where provider = 'helcim' and provider_transaction_id = txn;
    if existing.id is not null then
      if existing.id <> r.id then raise exception 'This refund transaction is already recorded.'; end if;
      return public.invoice_payment_state(r.invoice_id) || jsonb_build_object('payment_id', r.id, 'status', r.status, 'duplicate', true);
    end if;
  end if;
  if r.status <> 'pending' then
    return public.invoice_payment_state(r.invoice_id) || jsonb_build_object('payment_id', r.id, 'status', r.status, 'duplicate', true);
  end if;
  if coalesce(p_succeeded, false) then
    if txn is null then raise exception 'record_card_refund: transaction id missing.'; end if;
    update public.payments set status = 'succeeded', provider_transaction_id = txn, received_at = now() where id = r.id;
  else
    update public.payments set status = 'failed', provider_transaction_id = txn, failure_reason = left(coalesce(p_failure, 'Declined'), 500)
    where id = r.id;
  end if;
  return public.invoice_payment_state(r.invoice_id)
         || jsonb_build_object('payment_id', r.id, 'status', case when coalesce(p_succeeded, false) then 'succeeded' else 'failed' end,
                               'duplicate', false);
end;
$$;
revoke all on function public.record_card_refund(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.record_card_refund(uuid, text, boolean, text) to service_role;

-- Live updates in the ERP.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'payments') then
      alter publication supabase_realtime add table public.payments;
    end if;
  end if;
end $$;

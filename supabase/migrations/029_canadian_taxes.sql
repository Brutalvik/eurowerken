-- EuroWerken: Canadian sales taxes for every province and territory. Safe to re-run. Run after 028.
--
--   workshop_tax_settings            one row per workshop: its province, the taxes it charges (1 to 3, in order) and
--                                    its registration numbers. Every workshop starts as Alberta, GST 5%.
--   default_tax_components(prov)     the usual taxes of a province, for the ERP to prefill
--   set_tax_settings(...)            the only way to change the settings (Settings full); checks everything
--   tax_breakdown(workshop, amount)  the taxes on a taxable amount: [{code, label, rate, amount}]
--   tax_rate(workshop)               the combined rate (sum of the components)
--   repair_order_items.taxable       false for exempt lines: they count in the subtotal but are not taxed
--   invoices.taxes / tax_total       the breakdown stored on each invoice
--
-- Every tax is charged on the taxable subtotal (no tax on tax) and each amount is rounded half-up to the cent
-- (Postgres round(numeric, 2); packages/shared/src/taxes.ts computeTaxes does exactly the same).
--
-- Default rates, checked 2026-11-27 on canada.ca ("GST/HST calculator (and rates)", page modified 2025-04-01):
--   AB, NT, NU, YT  GST 5%                BC  GST 5% + PST 7%     SK  GST 5% + PST 6%     MB  GST 5% + RST 7%
--   ON  HST 13%     NS  HST 14% (since 1 April 2025, was 15%)     NB, NL, PE  HST 15%     QC  GST 5% + QST 9.975%

-- 1. Checks (used by the table constraints and by set_tax_settings) ---------------------------------------------------

create or replace function public.tax_provinces()
returns text[]
language sql immutable
as $$
  select array['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']
$$;

-- Null when the list of taxes is valid, else a sentence saying what is wrong.
create or replace function public.tax_components_problem(p jsonb)
returns text
language plpgsql immutable
as $$
declare
  c jsonb;
  codes text[] := '{}';
  code text;
  lbl text;
  r numeric;
  total numeric := 0;
  n int;
begin
  if p is null or jsonb_typeof(p) <> 'array' then return 'The taxes must be a list.'; end if;
  n := jsonb_array_length(p);
  if n < 1 then return 'Add at least one tax.'; end if;
  if n > 3 then return 'A shop can charge at most 3 taxes.'; end if;
  for c in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(c) <> 'object' then return 'Each tax needs a type, a label and a rate.'; end if;
    if exists (select 1 from jsonb_object_keys(c) k where k not in ('code', 'label', 'rate')) then
      return 'Each tax can only have a type, a label and a rate.';
    end if;
    if jsonb_typeof(c -> 'code') is distinct from 'string' or (c ->> 'code') not in ('GST', 'HST', 'PST', 'QST', 'RST') then
      return 'Each tax type must be GST, HST, PST, QST or RST.';
    end if;
    code := c ->> 'code';
    if code = any (codes) then return format('%s is listed twice.', code); end if;
    codes := codes || code;
    if jsonb_typeof(c -> 'label') is distinct from 'string' then return format('Give %s a label, for example "%s".', code, code); end if;
    lbl := c ->> 'label';
    if lbl <> btrim(lbl) or length(lbl) < 1 or length(lbl) > 30 or lbl ~ '[[:cntrl:]]' then
      return format('The label of %s must be 1 to 30 characters.', code);
    end if;
    if jsonb_typeof(c -> 'rate') is distinct from 'number' then return format('The rate of %s must be a number.', lbl); end if;
    r := (c ->> 'rate')::numeric;
    if r < 0 or r > 0.25 then return format('The rate of %s must be between 0%% and 25%%.', lbl); end if;
    if r <> round(r, 6) then return format('The rate of %s can have at most 4 decimals as a percentage (for example 9.975%%).', lbl); end if;
    total := total + r;
  end loop;
  if 'HST' = any (codes) and n > 1 then
    return 'HST already combines GST and the provincial tax: charge HST on its own.';
  end if;
  if total > 0.25 then return 'The taxes add up to more than 25%.'; end if;
  return null;
end;
$$;

-- Registration numbers as stored: digits and letters only, upper case; empty values left out.
create or replace function public.tax_registration_normalize(p jsonb)
returns jsonb
language plpgsql immutable
as $$
declare
  out jsonb := '{}'::jsonb;
  k text;
  v jsonb;
  s text;
begin
  if p is null or jsonb_typeof(p) = 'null' then return '{}'::jsonb; end if;
  if jsonb_typeof(p) <> 'object' then return p; end if;   -- left for tax_registration_problem to reject
  for k, v in select key, value from jsonb_each(p) loop
    if jsonb_typeof(v) = 'null' then continue; end if;
    if jsonb_typeof(v) <> 'string' then out := out || jsonb_build_object(k, v); continue; end if;
    s := btrim(v #>> '{}');
    if k in ('gst_hst_number', 'qst_number') then s := upper(regexp_replace(s, '[\s-]', '', 'g')); end if;
    if s <> '' then out := out || jsonb_build_object(k, s); end if;
  end loop;
  return out;
end;
$$;

-- Null when the (normalized) registration numbers are valid, else a sentence.
create or replace function public.tax_registration_problem(p jsonb)
returns text
language plpgsql immutable
as $$
declare
  k text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return 'The registration numbers must be an object.'; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('gst_hst_number', 'pst_number', 'qst_number') then return format('Unknown registration number: %s.', k); end if;
    if jsonb_typeof(p -> k) <> 'string' then return 'Registration numbers must be text.'; end if;
  end loop;
  if p ? 'gst_hst_number' and (p ->> 'gst_hst_number') !~ '^[0-9]{9}RT[0-9]{4}$' then
    return 'The GST/HST number is 9 digits, RT and 4 digits, for example 123456789 RT0001.';
  end if;
  if p ? 'qst_number' and (p ->> 'qst_number') !~ '^[0-9]{10}TQ[0-9]{4}$' then
    return 'The QST number is 10 digits, TQ and 4 digits, for example 1234567890 TQ0001.';
  end if;
  if p ? 'pst_number' and (length(p ->> 'pst_number') > 30 or (p ->> 'pst_number') ~ '[[:cntrl:]]') then
    return 'The PST number can be at most 30 characters.';
  end if;
  return null;
end;
$$;

-- The usual taxes of a province or territory (raises for an unknown code).
create or replace function public.default_tax_components(p_province text)
returns jsonb
language plpgsql immutable
as $$
declare
  d jsonb;
begin
  d := case upper(btrim(coalesce(p_province, '')))
    when 'AB' then '[{"code":"GST","label":"GST","rate":0.05}]'
    when 'NT' then '[{"code":"GST","label":"GST","rate":0.05}]'
    when 'NU' then '[{"code":"GST","label":"GST","rate":0.05}]'
    when 'YT' then '[{"code":"GST","label":"GST","rate":0.05}]'
    when 'BC' then '[{"code":"GST","label":"GST","rate":0.05},{"code":"PST","label":"PST","rate":0.07}]'
    when 'SK' then '[{"code":"GST","label":"GST","rate":0.05},{"code":"PST","label":"PST","rate":0.06}]'
    when 'MB' then '[{"code":"GST","label":"GST","rate":0.05},{"code":"RST","label":"RST","rate":0.07}]'
    when 'QC' then '[{"code":"GST","label":"GST","rate":0.05},{"code":"QST","label":"QST","rate":0.09975}]'
    when 'ON' then '[{"code":"HST","label":"HST","rate":0.13}]'
    when 'NS' then '[{"code":"HST","label":"HST","rate":0.14}]'
    when 'NB' then '[{"code":"HST","label":"HST","rate":0.15}]'
    when 'NL' then '[{"code":"HST","label":"HST","rate":0.15}]'
    when 'PE' then '[{"code":"HST","label":"HST","rate":0.15}]'
  end::jsonb;
  if d is null then raise exception 'Unknown province or territory: %', coalesce(p_province, '(none)'); end if;
  return d;
end;
$$;

-- The taxes on an amount for a list of components: each one on the full amount, rounded half-up to the cent.
create or replace function public.tax_breakdown_for(p_components jsonb, p_taxable numeric)
returns jsonb
language sql immutable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', c ->> 'code',
           'label', c ->> 'label',
           'rate', (c ->> 'rate')::numeric,
           'amount', round(round(coalesce(p_taxable, 0), 2) * (c ->> 'rate')::numeric, 2)) order by o), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_components) = 'array' then p_components else '[]'::jsonb end) with ordinality as e(c, o)
$$;

-- The sum of those taxes.
create or replace function public.tax_total_for(p_components jsonb, p_taxable numeric)
returns numeric
language sql immutable
as $$
  select coalesce(sum((e ->> 'amount')::numeric), 0)::numeric(12, 2)
  from jsonb_array_elements(public.tax_breakdown_for(p_components, p_taxable)) e
$$;

-- The combined rate of a list of components.
create or replace function public.tax_rate_for(p_components jsonb)
returns numeric
language sql immutable
as $$
  select coalesce(sum((c ->> 'rate')::numeric), 0)
  from jsonb_array_elements(case when jsonb_typeof(p_components) = 'array' then p_components else '[]'::jsonb end) c
$$;

-- 2. Settings table ----------------------------------------------------------------------------------------------------

create table if not exists public.workshop_tax_settings (
  workshop_id   uuid primary key references public.workshops (id) on delete cascade,
  province      text not null default 'AB',
  components    jsonb not null default '[{"code":"GST","label":"GST","rate":0.05}]'::jsonb,
  registration  jsonb not null default '{}'::jsonb,   -- {gst_hst_number?, pst_number?, qst_number?}
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workshop_tax_settings_province_check') then
    alter table public.workshop_tax_settings add constraint workshop_tax_settings_province_check
      check (province = any (public.tax_provinces()));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workshop_tax_settings_components_check') then
    alter table public.workshop_tax_settings add constraint workshop_tax_settings_components_check
      check (public.tax_components_problem(components) is null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workshop_tax_settings_registration_check') then
    alter table public.workshop_tax_settings add constraint workshop_tax_settings_registration_check
      check (public.tax_registration_problem(registration) is null and registration = public.tax_registration_normalize(registration));
  end if;
end;
$$;

-- Every existing workshop starts as Alberta, GST 5%; new workshops get the same row.
insert into public.workshop_tax_settings (workshop_id, province, components)
select id, 'AB', public.default_tax_components('AB') from public.workshops
on conflict (workshop_id) do nothing;

create or replace function public.workshops_after_insert_taxes()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.workshop_tax_settings (workshop_id, province, components)
  values (new.id, 'AB', public.default_tax_components('AB'))
  on conflict (workshop_id) do nothing;
  return new;
end;
$$;
revoke all on function public.workshops_after_insert_taxes() from public, anon, authenticated;
drop trigger if exists workshops_after_insert_taxes on public.workshops;
create trigger workshops_after_insert_taxes
  after insert on public.workshops
  for each row execute function public.workshops_after_insert_taxes();

-- Reading: anyone for a published site (customers see estimates with tax); the workshop's own staff; customers of the
-- workshop (their invoices show its registration numbers). Nobody writes directly: only set_tax_settings().
alter table public.workshop_tax_settings enable row level security;
drop policy if exists "workshop_tax_settings: published read" on public.workshop_tax_settings;
create policy "workshop_tax_settings: published read" on public.workshop_tax_settings
  for select to anon, authenticated using (public.site_is_published(workshop_id));
drop policy if exists "workshop_tax_settings: staff read" on public.workshop_tax_settings;
create policy "workshop_tax_settings: staff read" on public.workshop_tax_settings
  for select to authenticated using (workshop_id = public.my_workshop());
drop policy if exists "workshop_tax_settings: customer read" on public.workshop_tax_settings;
create policy "workshop_tax_settings: customer read" on public.workshop_tax_settings
  for select to authenticated
  using (exists (select 1 from public.workshop_customers wc
                 where wc.workshop_id = workshop_tax_settings.workshop_id and wc.customer_id = auth.uid()));
revoke all on public.workshop_tax_settings from anon, authenticated;
grant select on public.workshop_tax_settings to anon, authenticated;

-- 3. Tax of a workshop -----------------------------------------------------------------------------------------------

-- Internal: the workshop's components, or GST 5% if it has no row. Called from the security definer functions below.
create or replace function public.workshop_tax_components(p_workshop uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce((select components from public.workshop_tax_settings where workshop_id = p_workshop),
                  public.default_tax_components('AB'))
$$;
revoke all on function public.workshop_tax_components(uuid) from public, anon, authenticated;

-- Public: the taxes on an amount for a workshop whose settings the caller may read (null when it may not).
create or replace function public.tax_breakdown(p_workshop uuid, p_taxable numeric)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  select public.tax_breakdown_for(s.components, p_taxable) from public.workshop_tax_settings s where s.workshop_id = p_workshop
$$;

create or replace function public.tax_rate(p_workshop uuid)
returns numeric
language sql stable security invoker set search_path = public
as $$
  select public.tax_rate_for(s.components) from public.workshop_tax_settings s where s.workshop_id = p_workshop
$$;

revoke all on function public.tax_provinces() from public;
revoke all on function public.tax_components_problem(jsonb) from public;
revoke all on function public.tax_registration_normalize(jsonb) from public;
revoke all on function public.tax_registration_problem(jsonb) from public;
revoke all on function public.default_tax_components(text) from public;
revoke all on function public.tax_breakdown_for(jsonb, numeric) from public;
revoke all on function public.tax_total_for(jsonb, numeric) from public;
revoke all on function public.tax_rate_for(jsonb) from public;
revoke all on function public.tax_breakdown(uuid, numeric) from public;
revoke all on function public.tax_rate(uuid) from public;
grant execute on function public.tax_provinces() to anon, authenticated;
grant execute on function public.tax_components_problem(jsonb) to anon, authenticated;
grant execute on function public.tax_registration_normalize(jsonb) to anon, authenticated;
grant execute on function public.tax_registration_problem(jsonb) to anon, authenticated;
grant execute on function public.default_tax_components(text) to anon, authenticated;
grant execute on function public.tax_breakdown_for(jsonb, numeric) to anon, authenticated;
grant execute on function public.tax_total_for(jsonb, numeric) to anon, authenticated;
grant execute on function public.tax_rate_for(jsonb) to anon, authenticated;
grant execute on function public.tax_breakdown(uuid, numeric) to anon, authenticated;
grant execute on function public.tax_rate(uuid) to anon, authenticated;

-- 4. Saving the settings (Settings full) -------------------------------------------------------------------------------

create or replace function public.set_tax_settings(p_province text, p_components jsonb, p_registration jsonb default '{}'::jsonb)
returns public.workshop_tax_settings
language plpgsql volatile security definer set search_path = public
as $$
declare
  w uuid := public.my_workshop();
  prov text := upper(btrim(coalesce(p_province, '')));
  comps jsonb;
  reg jsonb;
  problem text;
  saved public.workshop_tax_settings;
begin
  if auth.uid() is null or w is null then raise exception 'Sign in to your workshop to change its taxes.'; end if;
  if not public.has_access('settings', 'full') then raise exception 'You need full access to Settings to change taxes.'; end if;
  if not (prov = any (public.tax_provinces())) then raise exception 'Choose the province or territory the shop is in.'; end if;
  if p_components is null or jsonb_typeof(p_components) <> 'array' then raise exception 'The taxes must be a list.'; end if;

  -- Tidy what was typed (codes in capitals, labels trimmed, an empty label becomes the code); keep anything odd as it
  -- is so the check below names the problem.
  select coalesce(jsonb_agg(case when jsonb_typeof(c) = 'object' then
           (c - 'code' - 'label')
           || jsonb_build_object('code', case when jsonb_typeof(c -> 'code') = 'string' then to_jsonb(upper(btrim(c ->> 'code'))) else coalesce(c -> 'code', 'null'::jsonb) end)
           || jsonb_build_object('label', case
                when jsonb_typeof(c -> 'label') = 'string' and btrim(c ->> 'label') <> '' then to_jsonb(btrim(c ->> 'label'))
                when (c -> 'label' is null or jsonb_typeof(c -> 'label') = 'null' or (jsonb_typeof(c -> 'label') = 'string' and btrim(c ->> 'label') = ''))
                     and jsonb_typeof(c -> 'code') = 'string' then to_jsonb(upper(btrim(c ->> 'code')))
                else coalesce(c -> 'label', 'null'::jsonb) end)
         else c end order by o), '[]'::jsonb)
    into comps
  from jsonb_array_elements(p_components) with ordinality as e(c, o);
  problem := public.tax_components_problem(comps);
  if problem is not null then raise exception '%', problem; end if;

  reg := public.tax_registration_normalize(coalesce(p_registration, '{}'::jsonb));
  problem := public.tax_registration_problem(reg);
  if problem is not null then raise exception '%', problem; end if;

  insert into public.workshop_tax_settings (workshop_id, province, components, registration, updated_at, updated_by)
  values (w, prov, comps, reg, now(), auth.uid())
  on conflict (workshop_id) do update
    set province = excluded.province, components = excluded.components, registration = excluded.registration,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by
  returning * into saved;
  return saved;
end;
$$;
revoke all on function public.set_tax_settings(text, jsonb, jsonb) from public, anon;
grant execute on function public.set_tax_settings(text, jsonb, jsonb) to authenticated;

-- 5. Exempt line items ----------------------------------------------------------------------------------------------------

alter table public.repair_order_items add column if not exists taxable boolean not null default true;

-- 6. Invoices -------------------------------------------------------------------------------------------------------------

alter table public.invoices add column if not exists taxes jsonb not null default '[]'::jsonb;   -- [{code, label, rate, amount}]
alter table public.invoices add column if not exists tax_total numeric(12, 2) not null default 0;
-- The combined rate can have 6 decimals (Quebec: 0.14975), so the compatibility column is widened.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'invoices' and column_name = 'gst_rate' and numeric_scale is distinct from 6) then
    alter table public.invoices alter column gst_rate type numeric(8, 6);
  end if;
end;
$$;
comment on column public.invoices.gst is 'Compatibility (before 029): the total of all taxes, equal to tax_total. Use taxes / tax_total.';
comment on column public.invoices.gst_rate is 'Compatibility (before 029): the combined rate of all taxes. Use taxes.';
comment on column public.repair_item_approvals.amount_with_tax is 'Amount plus the workshop''s taxes at the moment of the decision (none on an exempt line). Before 029: GST 5%.';

-- Invoices made before 029 charged GST only: give them their one-line breakdown.
update public.invoices
set taxes = jsonb_build_array(jsonb_build_object('code', 'GST', 'label', 'GST', 'rate', gst_rate, 'amount', gst)),
    tax_total = gst
where taxes = '[]'::jsonb and gst <> 0;

-- Create or refresh the invoice of a repair order from its approved items. Replaces the version from migration 023:
-- the workshop's taxes on the taxable lines, stored per tax; gst / gst_rate kept filled for older readers.
create or replace function public.issue_invoice(p_repair_order uuid)
returns public.invoices
language plpgsql volatile security definer set search_path = public
as $$
declare
  r public.repair_orders;
  inv public.invoices;
  l jsonb;
  sub numeric(12, 2);
  txb numeric(12, 2);
  comps jsonb;
  tx jsonb;
  ttl numeric(12, 2);
  rate numeric;
begin
  select * into r from public.repair_orders where id = p_repair_order;
  if r.id is null then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', i.kind, 'description', i.description, 'quantity', i.quantity, 'unit_price', i.unit_price,
           'amount', round(i.quantity * i.unit_price, 2), 'taxable', i.taxable) order by i.sort_order, i.created_at), '[]'::jsonb),
         coalesce(sum(round(i.quantity * i.unit_price, 2)), 0),
         coalesce(sum(round(i.quantity * i.unit_price, 2)) filter (where i.taxable), 0)
    into l, sub, txb
  from public.repair_order_items i where i.repair_order_id = r.id and i.approval = 'approved';
  comps := public.workshop_tax_components(r.workshop_id);
  tx := public.tax_breakdown_for(comps, txb);
  ttl := public.tax_total_for(comps, txb);
  rate := public.tax_rate_for(comps);

  select * into inv from public.invoices where repair_order_id = r.id;
  if inv.id is null then
    insert into public.invoices (workshop_id, repair_order_id, number, customer_id, bill_to, vehicle, lines, subtotal,
                                 taxes, tax_total, gst, gst_rate, total)
    values (r.workshop_id, r.id, public.next_invoice_number(r.workshop_id), r.customer_id,
            jsonb_build_object('name', r.contact_name, 'email', r.contact_email, 'phone', r.contact_phone),
            r.vehicle, l, sub, tx, ttl, ttl, rate, sub + ttl)
    returning * into inv;
  else
    update public.invoices
    set status = 'issued', customer_id = r.customer_id,
        bill_to = jsonb_build_object('name', r.contact_name, 'email', r.contact_email, 'phone', r.contact_phone),
        vehicle = r.vehicle, lines = l, subtotal = sub, taxes = tx, tax_total = ttl, gst = ttl, gst_rate = rate,
        total = sub + ttl, updated_at = now(), pdf_path = null
    where id = inv.id
    returning * into inv;
  end if;
  return inv;
end;
$$;
revoke all on function public.issue_invoice(uuid) from public, anon, authenticated;

-- 7. Approvals: the amount with tax uses the workshop's taxes and the item's taxable flag ---------------------------------

-- Approve or decline: signed-in customers only. Replaces the version from migration 018 (only amount_with_tax changed).
create or replace function public.respond_to_repair_items(p_slug text, p_code text, p_contact text, p_item_ids uuid[], p_decision text)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  r public.repair_orders;
  me_email text;
  n int;
  names text;
  comps jsonb;
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

  comps := public.workshop_tax_components(r.workshop_id);

  -- Record each decision first (with the amount at this moment), then apply it.
  insert into public.repair_item_approvals (
    repair_order_id, item_id, workshop_id, item_description, amount, amount_with_tax, decision, method,
    customer_id, customer_email, signed_in, ip_address, user_agent)
  select r.id, i.id, r.workshop_id, i.description, round(i.quantity * i.unit_price, 2),
         round(i.quantity * i.unit_price, 2) + case when i.taxable then public.tax_total_for(comps, round(i.quantity * i.unit_price, 2)) else 0 end,
         p_decision, 'online',
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

-- Staff record an approval the customer gave by phone. Replaces the version from migration 018 (only amount_with_tax).
create or replace function public.record_phone_approval(p_repair_order uuid, p_item_ids uuid[], p_decision text, p_note text default null)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  r public.repair_orders;
  n int;
  comps jsonb;
begin
  if p_decision not in ('approved', 'declined') then raise exception 'Choose approve or decline'; end if;
  if not public.has_access('repair-orders', 'full') then raise exception 'You do not have permission to record approvals'; end if;
  select * into r from public.repair_orders where id = p_repair_order and workshop_id = public.my_workshop();
  if r.id is null then raise exception 'Repair order not found'; end if;
  if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Add a short note, for example who you spoke to and when.'; end if;

  comps := public.workshop_tax_components(r.workshop_id);

  insert into public.repair_item_approvals (
    repair_order_id, item_id, workshop_id, item_description, amount, amount_with_tax, decision, method,
    customer_id, customer_email, signed_in, ip_address, user_agent, recorded_by, note)
  select r.id, i.id, r.workshop_id, i.description, round(i.quantity * i.unit_price, 2),
         round(i.quantity * i.unit_price, 2) + case when i.taxable then public.tax_total_for(comps, round(i.quantity * i.unit_price, 2)) else 0 end,
         p_decision, 'phone',
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

-- 8. The customer's tracking view tells which items are taxed. Replaces the version from migration 018 (adds
--    items[].taxable only).
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
        'unit_price', i.unit_price, 'approval', i.approval, 'taxable', i.taxable,
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

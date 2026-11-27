-- EuroWerken: customers, vehicles and service history brought over from another shop system. Safe to re-run.
--
--   workshop_contacts          customers of the workshop without an online account (imported, or added by staff).
--                              One per email and one per phone (last 10 digits) in a workshop, so an import can
--                              always tell which customer a row belongs to. customer_id records the link when the
--                              contact is the same person as one of the workshop's customer accounts.
--   contact_vehicles           their cars.
--   imported_service_records   past visits from the old system (date, RO number, work, mileage, total). One per
--                              (source system, external id) in a workshop, so importing the same file twice adds
--                              nothing.
--   import_external_ids        which contact or car an old system's customer / vehicle id became.
--
--   import_rows(kind, rows, source, dry_run)
--     kind contacts | vehicles | history, at most 500 rows a call. Every row is checked, then merged:
--       customers by the old system's id, then email, then phone; a customer account of the workshop with the same
--       email or phone is linked rather than copied. Cars by the old id, then VIN, then plate, within the customer.
--       History by (source, external id), else by (customer, car, date, RO number, total).
--     Existing details are never overwritten: an import only fills in what is blank (notes are added to).
--     A dry run does every step inside a savepoint and rolls it back, so its summary is exactly what the import
--     will do. Returns {created, updated, merged, unchanged, linked, skipped, errors:[{row, message}],
--     warnings:[{row, message}], contacts{..}, vehicles{..}, history{..}, rows:[{row, result}]}.
--     created   a new record          merged     matched another record by email/phone/VIN/plate and filled blanks
--     updated   the same old id again with something new                  unchanged  nothing new
--     skipped   rows with an error (nothing written for that row)
--
--   Reading: Customers (view) or Repair Orders (view). Importing and editing: Customers (full) or Settings (full).
--
--   staff_find_customer, service_history_search and service_history (027, 022) are redefined to include these:
--   same JSON and columns, with fields added only.

-- 1. Tables ----------------------------------------------------------------------------------------------------

create table if not exists public.workshop_contacts (
  id             uuid primary key default gen_random_uuid(),
  workshop_id    uuid not null references public.workshops (id) on delete cascade,
  name           text check (length(name) <= 200),
  email          text check (length(email) <= 254),
  phone          text check (length(phone) <= 40),
  address        text check (length(address) <= 500),
  notes          text check (length(notes) <= 10000),
  source         text not null default 'import' check (source in ('import', 'manual')),
  source_system  text check (length(source_system) <= 60),
  external_id    text check (length(external_id) <= 120),
  customer_id    uuid references public.customer_accounts (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint workshop_contacts_identity check (coalesce(nullif(trim(name), ''), email, nullif(trim(phone), '')) is not null)
);
create unique index if not exists workshop_contacts_email_uq on public.workshop_contacts (workshop_id, lower(email)) where email is not null;
create unique index if not exists workshop_contacts_phone_uq on public.workshop_contacts (workshop_id, public.norm_phone10(phone))
  where length(public.norm_phone10(phone)) = 10;
create index if not exists workshop_contacts_workshop_idx on public.workshop_contacts (workshop_id, created_at);
create index if not exists workshop_contacts_customer_idx on public.workshop_contacts (customer_id) where customer_id is not null;

create table if not exists public.contact_vehicles (
  id             uuid primary key default gen_random_uuid(),
  contact_id     uuid not null references public.workshop_contacts (id) on delete cascade,
  workshop_id    uuid not null references public.workshops (id) on delete cascade,
  make           text check (length(make) <= 60),
  model          text check (length(model) <= 80),
  year           int check (year between 1900 and 2100),
  vin            text check (length(vin) <= 30),
  plate          text check (length(plate) <= 20),
  odometer_km    int check (odometer_km between 0 and 5000000),
  notes          text check (length(notes) <= 4000),
  source_system  text check (length(source_system) <= 60),
  external_id    text check (length(external_id) <= 120),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint contact_vehicles_identity check (coalesce(nullif(trim(make), ''), nullif(trim(vin), ''), nullif(trim(plate), '')) is not null)
);
create unique index if not exists contact_vehicles_vin_uq on public.contact_vehicles (contact_id, vin) where vin is not null;
create index if not exists contact_vehicles_contact_idx on public.contact_vehicles (contact_id);
create index if not exists contact_vehicles_workshop_idx on public.contact_vehicles (workshop_id);

create table if not exists public.imported_service_records (
  id              uuid primary key default gen_random_uuid(),
  workshop_id     uuid not null references public.workshops (id) on delete cascade,
  contact_id      uuid references public.workshop_contacts (id) on delete set null,
  vehicle_id      uuid references public.contact_vehicles (id) on delete set null,
  vehicle         jsonb not null default '{}'::jsonb,
  customer_name   text check (length(customer_name) <= 200),
  customer_email  text check (length(customer_email) <= 254),
  customer_phone  text check (length(customer_phone) <= 40),
  service_date    date not null,
  ro_number       text check (length(ro_number) <= 60),
  description     text check (length(description) <= 10000),
  mileage_km      int check (mileage_km between 0 and 5000000),
  total           numeric(12, 2) check (total between -10000000 and 10000000),
  source_system   text check (length(source_system) <= 60),
  external_id     text check (length(external_id) <= 120),
  created_at      timestamptz not null default now()
);
create unique index if not exists imported_service_records_ext_uq
  on public.imported_service_records (workshop_id, lower(coalesce(source_system, '')), external_id) where external_id is not null;
create index if not exists imported_service_records_workshop_idx on public.imported_service_records (workshop_id, service_date);
create index if not exists imported_service_records_contact_idx on public.imported_service_records (contact_id);
create index if not exists imported_service_records_vehicle_idx on public.imported_service_records (vehicle_id);

create table if not exists public.import_external_ids (
  workshop_id    uuid not null references public.workshops (id) on delete cascade,
  source_system  text not null,
  kind           text not null check (kind in ('contact', 'vehicle')),
  external_id    text not null,
  target_id      uuid not null,
  created_at     timestamptz not null default now(),
  primary key (workshop_id, source_system, kind, external_id)
);

-- Tidy values on every write; a car always belongs to its customer's workshop.
create or replace function public.workshop_contacts_before_write()
returns trigger
language plpgsql
as $$
begin
  new.name := nullif(trim(new.name), '');
  new.email := nullif(lower(trim(new.email)), '');
  new.phone := nullif(trim(new.phone), '');
  new.address := nullif(trim(new.address), '');
  new.notes := nullif(trim(new.notes), '');
  if new.email is not null and new.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email address does not look right.';
  end if;
  if tg_op = 'UPDATE' then
    new.workshop_id := old.workshop_id;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists workshop_contacts_before_write on public.workshop_contacts;
create trigger workshop_contacts_before_write
  before insert or update on public.workshop_contacts
  for each row execute function public.workshop_contacts_before_write();

create or replace function public.contact_vehicles_before_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  select workshop_id into new.workshop_id from public.workshop_contacts where id = new.contact_id;
  new.vin := nullif(upper(regexp_replace(coalesce(new.vin, ''), '[^A-Za-z0-9]', '', 'g')), '');
  new.plate := nullif(upper(trim(new.plate)), '');
  new.make := nullif(trim(new.make), '');
  new.model := nullif(trim(new.model), '');
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end;
$$;
drop trigger if exists contact_vehicles_before_write on public.contact_vehicles;
create trigger contact_vehicles_before_write
  before insert or update on public.contact_vehicles
  for each row execute function public.contact_vehicles_before_write();

-- 2. Who may do what -----------------------------------------------------------------------------------------

create or replace function public.contacts_can_read()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_access('customers', 'view') or public.has_access('repair-orders', 'view')
$$;

create or replace function public.contacts_can_write()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_access('customers', 'full') or public.has_access('settings', 'full')
$$;
revoke all on function public.contacts_can_read() from public, anon;
revoke all on function public.contacts_can_write() from public, anon;
grant execute on function public.contacts_can_read() to authenticated;
grant execute on function public.contacts_can_write() to authenticated;

alter table public.workshop_contacts enable row level security;
alter table public.contact_vehicles enable row level security;
alter table public.imported_service_records enable row level security;
alter table public.import_external_ids enable row level security;

revoke all on public.workshop_contacts, public.contact_vehicles, public.imported_service_records, public.import_external_ids
  from anon, authenticated;
grant select on public.workshop_contacts, public.contact_vehicles, public.imported_service_records to authenticated;
-- Staff edit contact details only; rows are created by import_rows.
grant update (name, email, phone, address, notes) on public.workshop_contacts to authenticated;

drop policy if exists "workshop_contacts: staff read" on public.workshop_contacts;
create policy "workshop_contacts: staff read" on public.workshop_contacts
  for select to authenticated using (workshop_id = public.my_workshop() and public.contacts_can_read());
drop policy if exists "workshop_contacts: staff edit" on public.workshop_contacts;
create policy "workshop_contacts: staff edit" on public.workshop_contacts
  for update to authenticated
  using (workshop_id = public.my_workshop() and public.contacts_can_write())
  with check (workshop_id = public.my_workshop() and public.contacts_can_write());
drop policy if exists "contact_vehicles: staff read" on public.contact_vehicles;
create policy "contact_vehicles: staff read" on public.contact_vehicles
  for select to authenticated using (workshop_id = public.my_workshop() and public.contacts_can_read());
drop policy if exists "imported_service_records: staff read" on public.imported_service_records;
create policy "imported_service_records: staff read" on public.imported_service_records
  for select to authenticated using (workshop_id = public.my_workshop() and public.contacts_can_read());

-- 3. Import helpers (internal) ---------------------------------------------------------------------------------

-- A trimmed text value of a row, or null.
create or replace function public.imp_txt(r jsonb, k text)
returns text
language sql immutable
as $$
  select nullif(trim(regexp_replace(coalesce(r ->> k, ''), '\s+', ' ', 'g')), '')
$$;

-- Like imp_txt but keeps line breaks (notes, descriptions).
create or replace function public.imp_long(r jsonb, k text)
returns text
language sql immutable
as $$
  select nullif(trim(coalesce(r ->> k, '')), '')
$$;

-- Money: "$1,234.50", "1234.5", "(12.00)" (negative). Null when empty; raises when not a number.
create or replace function public.imp_money(p text)
returns numeric
language plpgsql immutable
as $$
declare
  s text := regexp_replace(coalesce(p, ''), '[\s$€£,]|CAD|USD|EUR', '', 'gi');
  neg boolean := false;
begin
  if s = '' then return null; end if;
  if s ~ '^\(.*\)$' then neg := true; s := substr(s, 2, length(s) - 2); end if;
  if s !~ '^-?\d+(\.\d+)?$' then raise exception 'not money'; end if;
  return round(case when neg then -s::numeric else s::numeric end, 2);
end;
$$;

-- Adds to notes without repeating what is already there.
create or replace function public.imp_add_note(old_notes text, more text)
returns text
language sql immutable
as $$
  select case
    when nullif(trim(more), '') is null then old_notes
    when old_notes is null or trim(old_notes) = '' then trim(more)
    when position(trim(more) in old_notes) > 0 then old_notes
    else left(old_notes || E'\n' || trim(more), 10000)
  end
$$;

-- One customer of a row: found (old id, email, phone), or created. allow_create false only finds.
create or replace function public.imp_contact(
  w uuid, src text, r jsonb, allow_create boolean,
  out contact_id uuid, out action text, out linked boolean, out warns text[], out err text)
language plpgsql security definer set search_path = public
as $$
declare
  ref text := public.imp_txt(r, 'customer_ref');
  nm text := coalesce(public.imp_txt(r, 'name'),
                      nullif(concat_ws(' ', public.imp_txt(r, 'first_name'), public.imp_txt(r, 'last_name')), ''),
                      public.imp_txt(r, 'company'));
  email_raw text := public.imp_txt(r, 'email');
  em text := lower(email_raw);
  ph_raw text := public.imp_txt(r, 'phone');
  ph10 text;
  addr text;
  nts text := public.imp_long(r, 'notes');
  old_c public.workshop_contacts;
  after_row public.workshop_contacts;
  found_by text;
  acc uuid;
  phone_free boolean;
  email_free boolean;
begin
  warns := '{}';
  linked := false;
  if public.imp_txt(r, 'company') is not null and public.imp_txt(r, 'name') is null
     and concat_ws(' ', public.imp_txt(r, 'first_name'), public.imp_txt(r, 'last_name')) <> '' then
    nts := public.imp_add_note(nts, 'Company: ' || public.imp_txt(r, 'company'));
  end if;
  addr := nullif(concat_ws(', ', public.imp_txt(r, 'address'), public.imp_txt(r, 'address2'), public.imp_txt(r, 'city'),
                           nullif(concat_ws(' ', public.imp_txt(r, 'state'), public.imp_txt(r, 'zip')), '')), '');
  if public.imp_txt(r, 'phone2') is not null then nts := public.imp_add_note(nts, 'Other phone: ' || public.imp_txt(r, 'phone2')); end if;

  if em is not null and (em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(em) > 254) then
    warns := warns || format('Email "%s" is not a valid address; it was kept in the notes.', left(email_raw, 80));
    nts := public.imp_add_note(nts, 'Email in the old system: ' || left(email_raw, 254));
    em := null;
  end if;
  ph10 := public.norm_phone10(ph_raw);
  if ph_raw is not null and length(coalesce(ph10, '')) < 10 then
    warns := warns || format('Phone "%s" has fewer than 10 digits; it was kept in the notes.', left(ph_raw, 40));
    nts := public.imp_add_note(nts, 'Phone in the old system: ' || left(ph_raw, 40));
    ph_raw := null;
    ph10 := null;
  end if;
  nm := left(nm, 200);
  addr := left(addr, 500);

  if ref is null and nm is null and em is null and ph10 is null then
    action := 'none';
    return;
  end if;

  if ref is not null then
    select c.* into old_c from public.import_external_ids x join public.workshop_contacts c on c.id = x.target_id
    where x.workshop_id = w and x.source_system = lower(src) and x.kind = 'contact' and x.external_id = ref;
    if old_c.id is not null then found_by := 'ref'; end if;
  end if;
  if old_c.id is null and em is not null then
    select * into old_c from public.workshop_contacts c where c.workshop_id = w and lower(c.email) = em;
    if old_c.id is not null then found_by := 'email'; end if;
  end if;
  if old_c.id is null and em is null and ph10 is null and nm is not null then
    -- No email or phone to go by: the same name among customers that have neither.
    select * into old_c from public.workshop_contacts c
    where c.workshop_id = w and c.email is null and c.phone is null and lower(c.name) = lower(nm)
    order by c.created_at limit 1;
    if old_c.id is not null then found_by := 'name'; end if;
  end if;
  if old_c.id is null and ph10 is not null then
    select * into old_c from public.workshop_contacts c
    where c.workshop_id = w and length(public.norm_phone10(c.phone)) = 10 and public.norm_phone10(c.phone) = ph10;
    if old_c.id is not null then
      if em is not null and old_c.email is not null and old_c.email <> em then
        -- Same phone, different email: a different person (a family phone). Keep them apart.
        old_c := null;
      else
        found_by := 'phone';
      end if;
    end if;
  end if;

  phone_free := ph10 is null or not exists (
    select 1 from public.workshop_contacts c where c.workshop_id = w and length(public.norm_phone10(c.phone)) = 10
      and public.norm_phone10(c.phone) = ph10 and c.id is distinct from old_c.id);
  email_free := em is null or not exists (
    select 1 from public.workshop_contacts c where c.workshop_id = w and lower(c.email) = em and c.id is distinct from old_c.id);

  if old_c.id is null then
    if not allow_create then
      err := 'No customer matches this row (by old customer id, email or phone). Import the customers first.';
      return;
    end if;
    if nm is null and em is null and ph10 is null then
      err := format('No customer with id %s was imported from %s, and the row has no name, email or phone to add one.', ref, src);
      return;
    end if;
    if not phone_free then
      warns := warns || format('Phone %s already belongs to another customer with a different email; it was kept in the notes.', ph_raw);
      nts := public.imp_add_note(nts, 'Phone (shared with another customer): ' || ph_raw);
      ph_raw := null;
    end if;
    -- The same person may already have an online account with this workshop: link it.
    select a.id into acc from public.customer_accounts a
    join public.workshop_customers wc on wc.customer_id = a.id and wc.workshop_id = w
    where (em is not null and lower(a.email) = em) or (ph10 is not null and public.norm_phone10(a.phone) = ph10)
    order by (em is not null and lower(a.email) = em) desc, a.created_at
    limit 1;
    insert into public.workshop_contacts (workshop_id, name, email, phone, address, notes, source, source_system, external_id, customer_id)
    values (w, nm, em, ph_raw, addr, left(nts, 10000), 'import', src, ref, acc)
    returning id into contact_id;
    action := 'created';
    linked := acc is not null;
  else
    contact_id := old_c.id;
    if nm is not null and old_c.name is not null and lower(old_c.name) <> lower(nm) then
      warns := warns || format('Name "%s" differs from the one on file ("%s"); the one on file was kept.', nm, old_c.name);
    end if;
    if ph10 is not null and old_c.phone is not null and public.norm_phone10(old_c.phone) is distinct from ph10 then
      warns := warns || format('Phone %s differs from the one on file (%s); the one on file was kept.', ph_raw, old_c.phone);
    end if;
    if em is not null and old_c.email is not null and old_c.email <> em then
      warns := warns || format('Email %s differs from the one on file (%s); the one on file was kept.', em, old_c.email);
    end if;
    if old_c.customer_id is null then
      select a.id into acc from public.customer_accounts a
      join public.workshop_customers wc on wc.customer_id = a.id and wc.workshop_id = w
      where (coalesce(em, old_c.email) is not null and lower(a.email) = coalesce(em, old_c.email))
         or (coalesce(ph10, public.norm_phone10(old_c.phone)) is not null and public.norm_phone10(a.phone) = coalesce(ph10, public.norm_phone10(old_c.phone)))
      order by (lower(a.email) = coalesce(em, old_c.email)) desc nulls last, a.created_at
      limit 1;
    end if;
    update public.workshop_contacts c set
      name = coalesce(c.name, nm),
      email = coalesce(c.email, case when email_free then em end),
      phone = coalesce(c.phone, case when phone_free then ph_raw end),
      address = coalesce(c.address, addr),
      notes = public.imp_add_note(c.notes, nts),
      external_id = coalesce(c.external_id, ref),
      source_system = coalesce(c.source_system, src),
      customer_id = coalesce(c.customer_id, acc)
    where c.id = old_c.id
    returning * into after_row;
    linked := old_c.customer_id is null and after_row.customer_id is not null;
    if (after_row.name, after_row.email, after_row.phone, after_row.address, after_row.notes, after_row.customer_id)
       is not distinct from (old_c.name, old_c.email, old_c.phone, old_c.address, old_c.notes, old_c.customer_id) then
      action := 'unchanged';
    elsif found_by = 'ref' then
      action := 'updated';
    else
      action := 'merged';
    end if;
  end if;

  if ref is not null then
    insert into public.import_external_ids (workshop_id, source_system, kind, external_id, target_id)
    values (w, lower(src), 'contact', ref, contact_id) on conflict do nothing;
  end if;
end;
$$;

-- One car of a row for a customer: found (old id, VIN, plate, same make/model/year) or created.
create or replace function public.imp_vehicle(
  w uuid, src text, p_contact uuid, r jsonb,
  out vehicle_id uuid, out action text, out snapshot jsonb, out warns text[], out err text)
language plpgsql security definer set search_path = public
as $$
declare
  ref text := public.imp_txt(r, 'vehicle_ref');
  mk text := left(public.imp_txt(r, 'make'), 60);
  md text := left(public.imp_txt(r, 'model'), 80);
  yr_raw text := public.imp_txt(r, 'year');
  yr int;
  vn text := nullif(upper(regexp_replace(coalesce(r ->> 'vin', ''), '[^A-Za-z0-9]', '', 'g')), '');
  pl text := left(nullif(upper(trim(regexp_replace(coalesce(r ->> 'plate', ''), '\s+', ' ', 'g'))), ''), 20);
  odo_raw text := public.imp_txt(r, 'odometer_km');
  odo int;
  nts text := public.imp_long(r, 'vehicle_notes');
  old_v public.contact_vehicles;
  after_row public.contact_vehicles;
  found_by text;
begin
  warns := '{}';
  if public.imp_txt(r, 'submodel') is not null then md := left(concat_ws(' ', md, public.imp_txt(r, 'submodel')), 80); end if;
  if yr_raw is not null then
    if yr_raw ~ '^\d{4}$' and yr_raw::int between 1900 and extract(year from now())::int + 2 then
      yr := yr_raw::int;
    else
      warns := warns || format('Year "%s" is not a 4-digit year; it was left blank.', left(yr_raw, 20));
    end if;
  end if;
  if vn is not null and length(vn) > 30 then
    warns := warns || 'The VIN is far too long; it was kept in the vehicle notes.';
    nts := public.imp_add_note(nts, 'VIN in the old system: ' || left(r ->> 'vin', 200));
    vn := null;
  elsif vn is not null and (length(vn) <> 17 or vn ~ '[IOQ]') then
    warns := warns || format('VIN %s does not look right (17 characters, no I, O or Q); it was kept as given.', vn);
  end if;
  if odo_raw is not null then
    begin
      odo := round(replace(replace(odo_raw, ',', ''), ' ', '')::numeric);
      if odo < 0 or odo > 5000000 then raise exception 'range'; end if;
    exception when others then
      odo := null;
      warns := warns || format('Odometer "%s" is not a number; it was left blank.', left(odo_raw, 20));
    end;
  end if;
  snapshot := jsonb_strip_nulls(jsonb_build_object('make', mk, 'model', md, 'year', yr, 'vin', vn, 'plate', pl));

  if mk is null and vn is null and pl is null and ref is null then
    action := 'none';
    return;
  end if;
  if p_contact is null then
    action := 'none';
    return;
  end if;

  if ref is not null then
    select v.* into old_v from public.import_external_ids x join public.contact_vehicles v on v.id = x.target_id
    where x.workshop_id = w and x.source_system = lower(src) and x.kind = 'vehicle' and x.external_id = ref and v.contact_id = p_contact;
    if old_v.id is not null then found_by := 'ref'; end if;
  end if;
  if old_v.id is null and vn is not null then
    select * into old_v from public.contact_vehicles v where v.contact_id = p_contact and v.vin = vn;
    if old_v.id is not null then found_by := 'vin'; end if;
  end if;
  if old_v.id is null and pl is not null then
    select * into old_v from public.contact_vehicles v
    where v.contact_id = p_contact and public.norm_plate(jsonb_build_object('plate', v.plate)) = public.norm_plate(jsonb_build_object('plate', pl))
      and (v.vin is null or vn is null)
    order by v.created_at limit 1;
    if old_v.id is not null then found_by := 'plate'; end if;
  end if;
  if old_v.id is null and vn is null and pl is null and mk is not null then
    select * into old_v from public.contact_vehicles v
    where v.contact_id = p_contact and v.vin is null and v.plate is null
      and lower(v.make) = lower(mk) and lower(coalesce(v.model, '')) = lower(coalesce(md, '')) and v.year is not distinct from yr
    order by v.created_at limit 1;
    if old_v.id is not null then found_by := 'model'; end if;
  end if;

  if old_v.id is null then
    if mk is null and vn is null and pl is null then
      err := 'This row has a vehicle id but no make, VIN or plate, and no vehicle with that id was imported.';
      return;
    end if;
    insert into public.contact_vehicles (contact_id, workshop_id, make, model, year, vin, plate, odometer_km, notes, source_system, external_id)
    values (p_contact, w, mk, md, yr, vn, pl, odo, left(nts, 4000), src, ref)
    returning id into vehicle_id;
    action := 'created';
  else
    vehicle_id := old_v.id;
    update public.contact_vehicles v set
      make = coalesce(v.make, mk),
      model = coalesce(v.model, md),
      year = coalesce(v.year, yr),
      vin = coalesce(v.vin, case when not exists (select 1 from public.contact_vehicles o where o.contact_id = p_contact and o.vin = vn) then vn end),
      plate = coalesce(v.plate, pl),
      odometer_km = greatest(v.odometer_km, odo),
      notes = left(public.imp_add_note(v.notes, nts), 4000),
      external_id = coalesce(v.external_id, ref),
      source_system = coalesce(v.source_system, src)
    where v.id = old_v.id
    returning * into after_row;
    if (after_row.make, after_row.model, after_row.year, after_row.vin, after_row.plate, after_row.odometer_km, after_row.notes)
       is not distinct from (old_v.make, old_v.model, old_v.year, old_v.vin, old_v.plate, old_v.odometer_km, old_v.notes) then
      action := 'unchanged';
    elsif found_by = 'ref' then
      action := 'updated';
    else
      action := 'merged';
    end if;
    snapshot := jsonb_strip_nulls(jsonb_build_object('make', after_row.make, 'model', after_row.model, 'year', after_row.year,
                                                     'vin', after_row.vin, 'plate', after_row.plate));
  end if;

  if ref is not null then
    insert into public.import_external_ids (workshop_id, source_system, kind, external_id, target_id)
    values (w, lower(src), 'vehicle', ref, vehicle_id) on conflict do nothing;
  end if;
end;
$$;

-- One past visit of a row.
create or replace function public.imp_history(
  w uuid, src text, p_contact uuid, p_vehicle uuid, p_snapshot jsonb, r jsonb,
  out action text, out warns text[], out err text)
language plpgsql security definer set search_path = public
as $$
declare
  ref text := public.imp_txt(r, 'record_ref');
  d_raw text := public.imp_txt(r, 'service_date');
  d date;
  ro text := left(public.imp_txt(r, 'ro_number'), 60);
  descr text := left(public.imp_long(r, 'description'), 10000);
  km_raw text := public.imp_txt(r, 'mileage_km');
  km int;
  tot_raw text := public.imp_txt(r, 'total');
  tot numeric;
  nm text := coalesce(public.imp_txt(r, 'name'),
                      nullif(concat_ws(' ', public.imp_txt(r, 'first_name'), public.imp_txt(r, 'last_name')), ''),
                      public.imp_txt(r, 'company'));
  old_h public.imported_service_records;
  after_row public.imported_service_records;
  found_by text;
begin
  warns := '{}';
  if d_raw is null then err := 'The service date is missing.'; return; end if;
  if d_raw !~ '^\d{4}-\d{2}-\d{2}([T ].*)?$' then
    err := format('The service date "%s" is not a date (YYYY-MM-DD).', left(d_raw, 30));
    return;
  end if;
  begin
    d := left(d_raw, 10)::date;
  exception when others then
    err := format('The service date "%s" is not a real date.', left(d_raw, 30));
    return;
  end;
  if d < date '1950-01-01' or d > current_date + 1 then
    err := format('The service date %s is out of range (1950 to today).', d);
    return;
  end if;
  if km_raw is not null then
    begin
      km := round(replace(replace(km_raw, ',', ''), ' ', '')::numeric);
      if km < 0 or km > 5000000 then raise exception 'range'; end if;
    exception when others then
      km := null;
      warns := warns || format('Mileage "%s" is not a number; it was left blank.', left(km_raw, 20));
    end;
  end if;
  if tot_raw is not null then
    begin
      tot := public.imp_money(tot_raw);
      if abs(tot) >= 10000000 then raise exception 'range'; end if;
    exception when others then
      tot := null;
      warns := warns || format('Total "%s" is not an amount; it was left blank.', left(tot_raw, 30));
    end;
  end if;
  if p_contact is null and coalesce(p_snapshot, '{}'::jsonb) = '{}'::jsonb then
    err := 'This visit has no customer and no vehicle: map the customer (name, email or phone) or the vehicle (VIN, plate, make).';
    return;
  end if;
  if ro is null and descr is null and tot is null and ref is null then
    err := 'This visit has no RO number, description or total.';
    return;
  end if;

  if ref is not null then
    select * into old_h from public.imported_service_records s
    where s.workshop_id = w and lower(coalesce(s.source_system, '')) = lower(src) and s.external_id = ref;
    if old_h.id is not null then found_by := 'ref'; end if;
  end if;
  if old_h.id is null then
    select * into old_h from public.imported_service_records s
    where s.workshop_id = w and s.service_date = d
      and s.ro_number is not distinct from ro and s.total is not distinct from tot
      and s.contact_id is not distinct from p_contact
      and (p_contact is not null or (
            coalesce(public.norm_vin(s.vehicle), public.norm_plate(s.vehicle)) is not distinct from coalesce(public.norm_vin(p_snapshot), public.norm_plate(p_snapshot))
            and s.description is not distinct from descr))
      and (ref is null or s.external_id is null)
    order by s.created_at limit 1;
    if old_h.id is not null then found_by := 'natural'; end if;
  end if;

  if old_h.id is null then
    insert into public.imported_service_records (workshop_id, contact_id, vehicle_id, vehicle, customer_name, customer_email, customer_phone,
                                                 service_date, ro_number, description, mileage_km, total, source_system, external_id)
    values (w, p_contact, p_vehicle, coalesce(p_snapshot, '{}'::jsonb), left(nm, 200),
            case when lower(public.imp_txt(r, 'email')) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then left(lower(public.imp_txt(r, 'email')), 254) end,
            left(public.imp_txt(r, 'phone'), 40), d, ro, descr, km, tot, src, ref);
    action := 'created';
  else
    update public.imported_service_records s set
      contact_id = coalesce(s.contact_id, p_contact),
      vehicle_id = coalesce(s.vehicle_id, p_vehicle),
      vehicle = case when s.vehicle = '{}'::jsonb then coalesce(p_snapshot, '{}'::jsonb) else s.vehicle end,
      ro_number = coalesce(s.ro_number, ro),
      description = coalesce(s.description, descr),
      mileage_km = coalesce(s.mileage_km, km),
      total = coalesce(s.total, tot),
      external_id = coalesce(s.external_id, ref)
    where s.id = old_h.id
    returning * into after_row;
    if (after_row.contact_id, after_row.vehicle_id, after_row.vehicle, after_row.ro_number, after_row.description, after_row.mileage_km, after_row.total)
       is not distinct from (old_h.contact_id, old_h.vehicle_id, old_h.vehicle, old_h.ro_number, old_h.description, old_h.mileage_km, old_h.total) then
      action := 'unchanged';
    elsif found_by = 'ref' then
      action := 'updated';
    else
      action := 'merged';
    end if;
  end if;
end;
$$;

revoke all on function public.imp_contact(uuid, text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.imp_vehicle(uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.imp_history(uuid, text, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;

-- 4. import_rows ---------------------------------------------------------------------------------------------

create or replace function public.import_rows(p_kind text, p_rows jsonb, p_source text, p_dry_run boolean default true)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  w uuid := public.my_workshop();
  src text := left(coalesce(nullif(trim(p_source), ''), 'CSV'), 60);
  blank constant jsonb := '{"created":0,"updated":0,"merged":0,"unchanged":0}';
  st jsonb := jsonb_build_object('contacts', blank, 'vehicles', blank, 'history', blank);
  main text;
  errors jsonb := '[]';
  warnings jsonb := '[]';
  results jsonb := '[]';
  skipped int := 0;
  linked int := 0;
  r jsonb;
  i bigint;
  row_no int;
  c record;
  v record;
  h record;
  row_warns text[];
  row_st jsonb;
  row_linked boolean;
  msg text;
  dry boolean := coalesce(p_dry_run, true);
begin
  if w is null or not public.contacts_can_write() then
    raise exception 'You need full access to Customers or Settings to import data.';
  end if;
  if p_kind not in ('contacts', 'vehicles', 'history') then raise exception 'Unknown import kind: %', p_kind; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'Rows must be a list.'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'At most 500 rows can be imported at a time.'; end if;
  main := p_kind;

  -- One import at a time per workshop, so two people importing cannot create the same customer twice.
  perform pg_advisory_xact_lock(hashtext('eurowerken.import.' || w::text));

  begin
    for r, i in select e, n from jsonb_array_elements(p_rows) with ordinality as t(e, n) loop
      row_no := case when r ->> '_row' ~ '^\d{1,9}$' then (r ->> '_row')::int else i::int end;
      row_warns := '{}';
      row_st := '{}';
      row_linked := false;
      begin
        if jsonb_typeof(r) <> 'object' then raise exception 'This row is not a set of columns.'; end if;

        select * into c from public.imp_contact(w, src, r, true);
        if c.err is not null then raise exception '%', c.err; end if;
        row_warns := row_warns || c.warns;
        if c.action <> 'none' then row_st := row_st || jsonb_build_object('contacts', c.action); row_linked := c.linked; end if;
        if p_kind = 'contacts' and c.action = 'none' then
          raise exception 'Nothing to import: the row has no name, email, phone or customer id.';
        end if;
        if p_kind = 'vehicles' and c.action = 'none' then
          raise exception 'Each vehicle needs its customer: map the customer id, email, phone or name.';
        end if;

        select * into v from public.imp_vehicle(w, src, c.contact_id, r);
        if v.err is not null then
          if p_kind = 'contacts' then
            row_warns := row_warns || ('The vehicle was not imported: ' || v.err);
          else
            raise exception '%', v.err;
          end if;
        else
          row_warns := row_warns || v.warns;
          if v.action <> 'none' then row_st := row_st || jsonb_build_object('vehicles', v.action); end if;
        end if;
        if p_kind = 'vehicles' and coalesce(v.action, 'none') = 'none' then
          raise exception 'This row has no vehicle: map the make, VIN or plate.';
        end if;

        if p_kind = 'history' then
          select * into h from public.imp_history(w, src, c.contact_id, v.vehicle_id, v.snapshot, r);
          if h.err is not null then raise exception '%', h.err; end if;
          row_warns := row_warns || h.warns;
          row_st := row_st || jsonb_build_object('history', h.action);
        end if;
      exception when others then
        msg := sqlerrm;
        if sqlstate = '23505' then msg := 'This row clashes with another customer or vehicle (same email, phone or VIN). ' || msg; end if;
        errors := errors || jsonb_build_object('row', row_no, 'message', msg);
        results := results || jsonb_build_object('row', row_no, 'result', 'error');
        skipped := skipped + 1;
        continue;
      end;

      -- The row worked: count it.
      for msg in select unnest(row_warns) loop
        warnings := warnings || jsonb_build_object('row', row_no, 'message', msg);
      end loop;
      if row_linked then linked := linked + 1; end if;
      for msg in select jsonb_object_keys(row_st) loop
        st := jsonb_set(st, array[msg, row_st ->> msg], to_jsonb(((st -> msg ->> (row_st ->> msg))::int) + 1));
      end loop;
      results := results || jsonb_build_object('row', row_no, 'result', coalesce(row_st ->> main, 'unchanged'),
                                               'warnings', coalesce(array_length(row_warns, 1), 0));
    end loop;

    if dry then raise exception using errcode = 'EWDRY', message = 'dry run'; end if;
  exception when sqlstate 'EWDRY' then
    null; -- everything above is rolled back; the counts stay.
  end;

  return jsonb_build_object(
    'kind', p_kind, 'dry_run', dry, 'source', src, 'rows_received', jsonb_array_length(p_rows),
    'created', (st -> main ->> 'created')::int, 'updated', (st -> main ->> 'updated')::int,
    'merged', (st -> main ->> 'merged')::int, 'unchanged', (st -> main ->> 'unchanged')::int,
    'linked', linked, 'skipped', skipped,
    'errors', errors, 'warnings', warnings,
    'contacts', st -> 'contacts', 'vehicles', st -> 'vehicles', 'history', st -> 'history',
    'rows', results);
end;
$$;
revoke all on function public.import_rows(text, jsonb, text, boolean) from public, anon;
grant execute on function public.import_rows(text, jsonb, text, boolean) to authenticated;

-- 5. Vehicle keys for imported visits ------------------------------------------------------------------------
-- The same keys as workshop_vehicle_keys (022): VIN, else a VIN known for the plate, else plate. An imported visit
-- joins the repairs already grouped here when it can: its VIN, or its plate when the repairs only know the plate.

create or replace function public.imported_vehicle_keys(p_workshop uuid)
returns table (record_id uuid, vehicle_key text)
language sql stable security definer set search_path = public
as $$
  with ro as (select distinct vehicle_key from public.workshop_vehicle_keys(p_workshop)),
  m as (
    select s.id,
           public.norm_vin(jsonb_build_object('vin', coalesce(cv.vin, s.vehicle ->> 'vin'))) vin,
           public.norm_plate(jsonb_build_object('plate', coalesce(cv.plate, s.vehicle ->> 'plate'))) plate,
           s.vehicle_id
    from public.imported_service_records s left join public.contact_vehicles cv on cv.id = s.vehicle_id
    where s.workshop_id = p_workshop
  ),
  ro_plate_vin as (
    select public.norm_plate(r.vehicle) plate, min(public.norm_vin(r.vehicle)) vin
    from public.repair_orders r
    where r.workshop_id = p_workshop and public.norm_vin(r.vehicle) is not null and public.norm_plate(r.vehicle) is not null
    group by 1
  ),
  imp_plate_vin as (select plate, min(vin) vin from m where vin is not null and plate is not null group by plate)
  select m.id,
         case
           when m.vin is not null and m.plate is not null
                and not exists (select 1 from ro where ro.vehicle_key = 'VIN:' || m.vin)
                and exists (select 1 from ro where ro.vehicle_key = 'PLATE:' || m.plate) then 'PLATE:' || m.plate
           when m.vin is not null then 'VIN:' || m.vin
           when m.plate is not null and coalesce(rpv.vin, ipv.vin) is not null then 'VIN:' || coalesce(rpv.vin, ipv.vin)
           when m.plate is not null then 'PLATE:' || m.plate
           when m.vehicle_id is not null then 'IMPV:' || m.vehicle_id::text
           else 'IMP:' || m.id::text
         end
  from m
  left join ro_plate_vin rpv on rpv.plate = m.plate and m.vin is null
  left join imp_plate_vin ipv on ipv.plate = m.plate and m.vin is null
$$;
revoke all on function public.imported_vehicle_keys(uuid) from public, anon, authenticated;

-- One imported visit as the history shows it.
create or replace function public.imported_record_json(s public.imported_service_records)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', s.id, 'service_date', s.service_date, 'ro_number', s.ro_number, 'description', s.description,
    'mileage_km', s.mileage_km, 'total', s.total, 'source_system', s.source_system, 'external_id', s.external_id,
    'imported_at', s.created_at, 'contact_id', s.contact_id, 'vehicle_id', s.vehicle_id,
    'vehicle', coalesce((select jsonb_strip_nulls(jsonb_build_object('make', v.make, 'model', v.model, 'year', v.year, 'vin', v.vin, 'plate', v.plate))
                         from public.contact_vehicles v where v.id = s.vehicle_id), s.vehicle),
    'customer_name', coalesce((select c.name from public.workshop_contacts c where c.id = s.contact_id), s.customer_name),
    'customer_email', coalesce((select c.email from public.workshop_contacts c where c.id = s.contact_id), s.customer_email),
    'customer_phone', coalesce((select c.phone from public.workshop_contacts c where c.id = s.contact_id), s.customer_phone))
$$;
revoke all on function public.imported_record_json(public.imported_service_records) from public, anon, authenticated;

-- 6. Service history with imported visits (022, extended) --------------------------------------------------------
-- The result gains imported_visits; visits, first_visit and last_visit count imported visits too.

drop function if exists public.service_history_search(text);
create or replace function public.service_history_search(p_query text)
returns table (
  vehicle_key text, vehicle jsonb, owner_name text, owner_email text, owner_phone text,
  visits bigint, first_visit timestamptz, last_visit timestamptz, open_repairs bigint, imported_visits bigint)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
declare
  w uuid := public.my_workshop();
  q text := lower(trim(coalesce(p_query, '')));
  digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
  alnum text := upper(regexp_replace(coalesce(p_query, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if w is null or not public.has_access('repair-orders', 'view') then raise exception 'You do not have access to repair orders.'; end if;
  if length(q) < 2 then return; end if;
  return query
  with k as (select * from public.workshop_vehicle_keys(w)),
  imp as (
    select ik.vehicle_key, j.rec ->> 'customer_name' as contact_name, j.rec ->> 'customer_email' as contact_email,
           j.rec ->> 'customer_phone' as contact_phone, j.rec -> 'vehicle' as vehicle, s.ro_number,
           ((s.service_date + time '12:00') at time zone 'UTC') as created_at
    from public.imported_service_records s
    join public.imported_vehicle_keys(w) ik on ik.record_id = s.id
    cross join lateral (select public.imported_record_json(s) as rec) j
    where s.workshop_id = w
  ),
  hit as (
    select distinct k.vehicle_key
    from public.repair_orders r join k on k.repair_order_id = r.id
    left join public.customer_accounts a on a.id = r.customer_id
    where lower(r.contact_name) like '%' || q || '%'
       or lower(coalesce(r.contact_email, '')) like '%' || q || '%'
       or lower(coalesce(a.full_name, '')) like '%' || q || '%'
       or lower(coalesce(a.email, '')) like '%' || q || '%'
       or (length(digits) >= 4 and regexp_replace(coalesce(r.contact_phone, ''), '\D', '', 'g') like '%' || digits || '%')
       or (length(alnum) >= 3 and coalesce(public.norm_vin(r.vehicle), upper(regexp_replace(coalesce(r.vehicle ->> 'vin', ''), '[^A-Za-z0-9]', '', 'g'))) like '%' || alnum || '%')
       or (length(alnum) >= 2 and coalesce(public.norm_plate(r.vehicle), '') like '%' || alnum || '%')
    union
    select i.vehicle_key from imp i
    where lower(coalesce(i.contact_name, '')) like '%' || q || '%'
       or lower(coalesce(i.contact_email, '')) like '%' || q || '%'
       or (length(digits) >= 4 and regexp_replace(coalesce(i.contact_phone, ''), '\D', '', 'g') like '%' || digits || '%')
       or (length(alnum) >= 3 and upper(regexp_replace(coalesce(i.vehicle ->> 'vin', ''), '[^A-Za-z0-9]', '', 'g')) like '%' || alnum || '%')
       or (length(alnum) >= 2 and coalesce(public.norm_plate(i.vehicle), '') like '%' || alnum || '%')
       or (length(q) >= 2 and lower(coalesce(i.ro_number, '')) = q)
  ),
  rows as (
    select k.vehicle_key, r.vehicle, r.contact_name, r.contact_email, r.contact_phone, r.created_at, r.status::text as status, 0 as src
    from public.repair_orders r join k on k.repair_order_id = r.id
    where k.vehicle_key in (select vehicle_key from hit)
    union all
    select i.vehicle_key, i.vehicle, coalesce(i.contact_name, ''), i.contact_email, i.contact_phone, i.created_at, 'completed', 1
    from imp i where i.vehicle_key in (select vehicle_key from hit)
  )
  select x.vehicle_key,
         (array_agg(x.vehicle order by x.src, x.created_at desc))[1],
         (array_agg(x.contact_name order by x.src, x.created_at desc))[1],
         (array_agg(x.contact_email order by x.src, x.created_at desc) filter (where x.contact_email is not null))[1],
         (array_agg(x.contact_phone order by x.src, x.created_at desc) filter (where x.contact_phone is not null))[1],
         count(*), min(x.created_at), max(x.created_at),
         count(*) filter (where x.status not in ('completed', 'cancelled')),
         count(*) filter (where x.src = 1)
  from rows x
  group by x.vehicle_key
  order by max(x.created_at) desc
  limit 50;
end;
$$;

create or replace function public.service_history(p_key text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  w uuid := public.my_workshop();
begin
  if w is null or not public.has_access('repair-orders', 'view') then raise exception 'You do not have access to repair orders.'; end if;
  return jsonb_build_object(
    'vehicle_key', p_key,
    'workshop', (select jsonb_build_object('name', coalesce(s.display_name, ws.name), 'number', ws.number,
                                           'phone', s.phone, 'email', s.email, 'address', s.address)
                 from public.workshops ws left join public.workshop_sites s on s.workshop_id = ws.id where ws.id = w),
    'repairs', coalesce((
      select jsonb_agg(public.history_repair_json(r, true) order by r.created_at desc)
      from public.repair_orders r join public.workshop_vehicle_keys(w) k on k.repair_order_id = r.id
      where k.vehicle_key = p_key), '[]'::jsonb),
    'imported', coalesce((
      select jsonb_agg(public.imported_record_json(s) order by s.service_date desc, s.created_at desc)
      from public.imported_service_records s join public.imported_vehicle_keys(w) k on k.record_id = s.id
      where s.workshop_id = w and k.vehicle_key = p_key), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.service_history_search(text) from public, anon;
revoke all on function public.service_history(text) from public, anon;
grant execute on function public.service_history_search(text) to authenticated;
grant execute on function public.service_history(text) to authenticated;

-- 7. Staff customer lookup with imported customers (027, extended) ------------------------------------------------
-- Adds contact_id, has_contact and imported_from; every car gains source (garage | visit | imported) and
-- contact_vehicle_id. Imported cars come after the garage and earlier visits, and are dropped when the same car is
-- already listed (027's rules). Their vehicle_id stays null: a booking can only link a car of a customer account.

create or replace function public.staff_find_customer(p_email text, p_phone text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  w uuid := public.my_workshop();
  e text := nullif(lower(trim(coalesce(p_email, ''))), '');
  ph text := public.norm_phone10(p_phone);
  acc public.customer_accounts;
  ct public.workshop_contacts;
  contact_ids uuid[];
  name text;
  email text;
  phone text;
  cars jsonb;
  c record;
  vin text;
  plate text;
  mm text;
begin
  if w is null or not public.has_access('repair-orders', 'view') then raise exception 'You do not have access to bookings.'; end if;
  if e is not null and e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then e := null; end if;
  if ph is not null and length(ph) < 10 then ph := null; end if;
  if e is null and ph is null then return null; end if;

  -- A customer account of this workshop: the email first, then the phone.
  select a.* into acc
  from public.customer_accounts a
  join public.workshop_customers wc on wc.customer_id = a.id and wc.workshop_id = w
  where (e is not null and lower(a.email) = e) or (ph is not null and public.norm_phone10(a.phone) = ph)
  order by (e is not null and lower(a.email) = e) desc, a.created_at
  limit 1;

  -- An imported (or staff-added) customer: the email first, then the phone, else one linked to the account.
  select x.* into ct
  from public.workshop_contacts x
  where x.workshop_id = w
    and ((e is not null and lower(x.email) = e) or (ph is not null and public.norm_phone10(x.phone) = ph)
         or (acc.id is not null and x.customer_id = acc.id))
  order by (e is not null and lower(x.email) = e) desc, (ph is not null and public.norm_phone10(x.phone) = ph) desc, x.created_at
  limit 1;
  -- The contact may be linked to an account the typed details did not find.
  if acc.id is null and ct.customer_id is not null then
    select a.* into acc from public.customer_accounts a
    join public.workshop_customers wc on wc.customer_id = a.id and wc.workshop_id = w
    where a.id = ct.customer_id;
  end if;
  select coalesce(array_agg(x.id), '{}') into contact_ids
  from public.workshop_contacts x
  where x.workshop_id = w
    and ((e is not null and lower(x.email) = e) or (ph is not null and public.norm_phone10(x.phone) = ph)
         or (acc.id is not null and x.customer_id = acc.id));

  -- Every car seen: the customer's garage first, then past bookings and repairs, newest first, then imported cars.
  -- A car is kept once: a later sighting is the same car when it shares the VIN or the plate, or has neither and
  -- the same make and model.
  cars := '[]'::jsonb;
  for c in
    select * from (
      select v.id as vehicle_id, v.make, v.model, v.year::text as year, v.plate, v.vin, v.nickname, v.created_at as seen, 0 as rank,
             null::uuid as contact_vehicle_id
      from public.customer_vehicles v where acc.id is not null and v.customer_id = acc.id
      union all
      select null::uuid, nullif(trim(x.vehicle ->> 'make'), ''), nullif(trim(x.vehicle ->> 'model'), ''),
             nullif(trim(x.vehicle ->> 'year'), ''), nullif(trim(x.vehicle ->> 'plate'), ''), nullif(trim(x.vehicle ->> 'vin'), ''),
             null::text, x.created_at, 1, null::uuid
      from (
        select contact_email, contact_phone, vehicle, created_at, customer_id from public.appointments where workshop_id = w
        union all
        select contact_email, contact_phone, vehicle, created_at, customer_id from public.repair_orders where workshop_id = w
      ) x
      where ((e is not null and lower(x.contact_email) = e)
             or (ph is not null and public.norm_phone10(x.contact_phone) = ph)
             or (acc.id is not null and x.customer_id = acc.id))
        and (nullif(trim(x.vehicle ->> 'make'), '') is not null or nullif(trim(x.vehicle ->> 'plate'), '') is not null)
      union all
      select null::uuid, cv.make, cv.model, cv.year::text, cv.plate, cv.vin, null::text,
             coalesce((select max(s.service_date)::timestamptz from public.imported_service_records s where s.vehicle_id = cv.id), cv.created_at),
             2, cv.id
      from public.contact_vehicles cv where cv.contact_id = any (contact_ids)
    ) all_cars
    order by rank, seen desc
  loop
    vin := public.norm_vin(jsonb_build_object('vin', c.vin));
    plate := public.norm_plate(jsonb_build_object('plate', c.plate));
    mm := lower(concat_ws('|', trim(c.make), trim(c.model)));
    if exists (
      select 1 from jsonb_array_elements(cars) k
      where (vin is not null and k ->> 'k_vin' = vin)
         or (plate is not null and k ->> 'k_plate' = plate)
         or (vin is null and plate is null and k ->> 'k_mm' = mm)
         or (c.rank >= 1 and vin is null and plate is not null and k ->> 'k_plate' is null and k ->> 'k_mm' = mm)
    ) then
      continue;
    end if;
    cars := cars || jsonb_build_array(jsonb_build_object(
      'vehicle_id', c.vehicle_id, 'make', c.make, 'model', c.model, 'year', c.year, 'plate', c.plate, 'vin', c.vin,
      'nickname', c.nickname, 'from_garage', c.rank = 0, 'last_seen', c.seen,
      'source', case c.rank when 0 then 'garage' when 1 then 'visit' else 'imported' end,
      'contact_vehicle_id', c.contact_vehicle_id,
      'k_vin', vin, 'k_plate', plate, 'k_mm', mm));
  end loop;
  select coalesce(jsonb_agg(k - 'k_vin' - 'k_plate' - 'k_mm'), '[]'::jsonb) into cars from jsonb_array_elements(cars) k;

  -- Contact details: the account first, else the most recent booking or repair, else the imported customer.
  select p.contact_name, p.contact_email, p.contact_phone into name, email, phone
  from (
    select contact_name, contact_email, contact_phone, created_at from public.appointments
    where workshop_id = w and ((e is not null and lower(contact_email) = e) or (ph is not null and public.norm_phone10(contact_phone) = ph))
    union all
    select contact_name, contact_email, contact_phone, created_at from public.repair_orders
    where workshop_id = w and ((e is not null and lower(contact_email) = e) or (ph is not null and public.norm_phone10(contact_phone) = ph))
  ) p order by p.created_at desc limit 1;

  if acc.id is null and name is null and ct.id is null then return null; end if;

  return jsonb_build_object(
    'customer_id', acc.id,
    'name', coalesce(nullif(trim(acc.full_name), ''), name, ct.name),
    'email', coalesce(acc.email, email, ct.email),
    'phone', coalesce(nullif(trim(acc.phone), ''), phone, ct.phone),
    'has_account', acc.id is not null,
    'vehicles', cars,
    'contact_id', ct.id,
    'has_contact', ct.id is not null,
    'imported_from', ct.source_system
  );
end;
$$;
revoke all on function public.staff_find_customer(text, text) from public, anon;
grant execute on function public.staff_find_customer(text, text) to authenticated;

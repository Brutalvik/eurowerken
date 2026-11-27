-- EuroWerken: digital vehicle inspections. Safe to re-run.
--
--   inspection_templates   per workshop: a named checklist (items jsonb), at most one default. Every workshop gets a
--                          thorough default template (existing ones now, new ones by a trigger).
--   inspections            one checklist run on a repair order: in_progress -> completed -> sent (visible to the
--                          customer). Completed and sent inspections are read-only until reopened.
--   inspection_items       the items, copied from the template when the inspection starts (later template edits do not
--                          change it): condition good / attention / urgent / na, a measurement, a note, and the estimate
--                          line made from it (estimate_item_id).
--   repair_order_media.inspection_item_id   photos and videos of an item (same bucket and rules as other repair media).
--                          They are held from the customer (visible_to_customer = false) while the inspection is being
--                          worked on, and shown when it is sent.
--
-- Who may do what
--   Read:       Repair Orders view (staff of the workshop).
--   Inspect:    Repair Orders full (Manager, Service Advisor and Technician by default): start, check items, add photos,
--               complete, send, reopen (who and when is recorded), turn findings into estimate lines.
--   Templates:  Settings full (Manager by default) creates, edits, duplicates, sets the default, deletes non-default ones.
--               Templates are shared set-up for the whole workshop, so they follow Settings and not Repair Orders.
--   Customers:  track_inspections(slug, code, contact) returns only sent inspections, without staff data.
--
-- Functions (staff): start_inspection, update_inspection_item, add_inspection_finding_to_estimate, complete_inspection,
--   send_inspection, reopen_inspection, set_default_inspection_template.
-- Findings become estimate lines waiting for approval (approval 'pending', inserted, so the approval guard of 018 is not
-- involved). Asking the customer to approve them is the existing "Send for approval" step (requestApproval in the app);
-- when the repair is already awaiting approval, the 019 trigger refreshes the customer's approval alert by itself.

-- 1. Templates --------------------------------------------------------------------------------------------

create table if not exists public.inspection_templates (
  id           uuid primary key default gen_random_uuid(),
  workshop_id  uuid not null references public.workshops (id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 80),
  is_default   boolean not null default false,
  items        jsonb not null default '[]'::jsonb,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists inspection_templates_workshop_idx on public.inspection_templates (workshop_id, name);
create unique index if not exists inspection_templates_one_default on public.inspection_templates (workshop_id) where is_default;

-- Items must be a list of {key, section, label, kind, unit?, help?} with unique keys.
create or replace function public.inspection_template_items_problem(p_items jsonb)
returns text
language plpgsql immutable
as $$
declare
  it jsonb;
  keys text[] := '{}';
  k text;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then return 'The checklist must be a list of items.'; end if;
  if jsonb_array_length(p_items) = 0 then return 'Add at least one item to the checklist.'; end if;
  if jsonb_array_length(p_items) > 300 then return 'A checklist can have at most 300 items.'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(it) is distinct from 'object' then return 'Every checklist item must be an object.'; end if;
    k := it ->> 'key';
    if k is null or k !~ '^[a-z0-9_]{1,60}$' then return 'Every item needs a key of lower-case letters, digits and _.'; end if;
    if k = any (keys) then return format('Two items use the key %s.', k); end if;
    keys := keys || k;
    if length(trim(coalesce(it ->> 'label', ''))) not between 1 and 120 then return 'Every item needs a name of at most 120 characters.'; end if;
    if length(trim(coalesce(it ->> 'section', ''))) not between 1 and 60 then return 'Every item needs a section of at most 60 characters.'; end if;
    if coalesce(it ->> 'kind', '') not in ('condition', 'measurement') then return 'An item is either a condition check or a measurement.'; end if;
    if length(coalesce(it ->> 'unit', '')) > 12 then return 'A unit can be at most 12 characters.'; end if;
    if length(coalesce(it ->> 'help', '')) > 300 then return 'Help text can be at most 300 characters.'; end if;
  end loop;
  return null;
end;
$$;

create or replace function public.inspection_templates_before_write()
returns trigger
language plpgsql
as $$
declare
  problem text;
begin
  problem := public.inspection_template_items_problem(new.items);
  if problem is not null then raise exception '%', problem; end if;
  new.name := trim(new.name);
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  elsif new.workshop_id is distinct from old.workshop_id then
    raise exception 'A template cannot move to another workshop';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists inspection_templates_before_write on public.inspection_templates;
create trigger inspection_templates_before_write
  before insert or update on public.inspection_templates
  for each row execute function public.inspection_templates_before_write();

create or replace function public.inspection_templates_keep_default()
returns trigger
language plpgsql
as $$
begin
  -- Removed together with the workshop (a cascade): allowed.
  if old.is_default and auth.uid() is not null and exists (select 1 from public.workshops where id = old.workshop_id) then
    raise exception 'The default template cannot be deleted. Make another template the default first.';
  end if;
  return old;
end;
$$;
drop trigger if exists inspection_templates_keep_default on public.inspection_templates;
create trigger inspection_templates_keep_default
  before delete on public.inspection_templates
  for each row execute function public.inspection_templates_keep_default();

-- The default checklist (one place).
create or replace function public.default_inspection_template_items()
returns jsonb
language sql immutable
as $$
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('key', k, 'section', s, 'label', l, 'kind', kd, 'unit', u, 'help', h)) order by n)
  from (values
    (1,  'oil',               'Under the hood', 'Engine oil level and condition', 'condition', null, 'Level on the dipstick, colour, sludge or milky oil.'),
    (2,  'coolant',           'Under the hood', 'Coolant level and condition', 'condition', null, 'Level in the reservoir, colour, contamination.'),
    (3,  'brake_fluid',       'Under the hood', 'Brake fluid', 'condition', null, 'Level and moisture or colour test.'),
    (4,  'power_steering',    'Under the hood', 'Power steering fluid', 'condition', null, 'N/A for electric steering.'),
    (5,  'transmission',      'Under the hood', 'Transmission fluid', 'condition', null, 'Level and condition where it can be checked.'),
    (6,  'washer_fluid',      'Under the hood', 'Washer fluid', 'condition', null, null),
    (7,  'belts',             'Under the hood', 'Drive belts', 'condition', null, 'Cracks, glazing, fraying, tension.'),
    (8,  'hoses',             'Under the hood', 'Hoses', 'condition', null, 'Cracks, swelling, soft spots, leaks.'),
    (9,  'battery',           'Under the hood', 'Battery test result', 'measurement', '%', 'State of health from the tester. Note the CCA and terminals.'),
    (10, 'air_filter',        'Under the hood', 'Engine air filter', 'condition', null, null),
    (11, 'cabin_filter',      'Under the hood', 'Cabin air filter', 'condition', null, null),
    (12, 'pads_front',        'Brakes', 'Front brake pad thickness', 'measurement', 'mm', 'Good 5 mm or more, attention 3 to 4 mm, urgent 2 mm or less.'),
    (13, 'pads_rear',         'Brakes', 'Rear brake pad thickness', 'measurement', 'mm', 'Good 5 mm or more, attention 3 to 4 mm, urgent 2 mm or less.'),
    (14, 'rotors',            'Brakes', 'Rotors', 'condition', null, 'Scoring, lip, run-out, minimum thickness.'),
    (15, 'brake_lines',       'Brakes', 'Brake lines and hoses', 'condition', null, 'Corrosion, leaks, cracked hoses.'),
    (16, 'parking_brake',     'Brakes', 'Parking brake', 'condition', null, null),
    (17, 'tread_lf',          'Tires & wheels', 'Tread depth left front', 'measurement', 'mm', 'Good 5 mm or more, attention 3 to 4 mm, urgent 2 mm or less.'),
    (18, 'tread_rf',          'Tires & wheels', 'Tread depth right front', 'measurement', 'mm', 'Good 5 mm or more, attention 3 to 4 mm, urgent 2 mm or less.'),
    (19, 'tread_lr',          'Tires & wheels', 'Tread depth left rear', 'measurement', 'mm', 'Good 5 mm or more, attention 3 to 4 mm, urgent 2 mm or less.'),
    (20, 'tread_rr',          'Tires & wheels', 'Tread depth right rear', 'measurement', 'mm', 'Good 5 mm or more, attention 3 to 4 mm, urgent 2 mm or less.'),
    (21, 'tire_pressure',     'Tires & wheels', 'Tire pressure (set to spec)', 'condition', null, 'Note any tire that was low.'),
    (22, 'wear_pattern',      'Tires & wheels', 'Tire wear pattern', 'condition', null, 'Inner or outer edge wear, cupping, feathering.'),
    (23, 'spare',             'Tires & wheels', 'Spare tire or repair kit', 'condition', null, null),
    (24, 'tie_rods',          'Steering & suspension', 'Tie rod ends', 'condition', null, null),
    (25, 'ball_joints',       'Steering & suspension', 'Ball joints', 'condition', null, null),
    (26, 'shocks',            'Steering & suspension', 'Shocks and struts', 'condition', null, 'Leaks, bounce, mounts.'),
    (27, 'cv_boots',          'Steering & suspension', 'CV boots', 'condition', null, 'Tears or grease thrown.'),
    (28, 'alignment',         'Steering & suspension', 'Signs of misalignment', 'condition', null, 'Pulling, off-centre wheel, uneven wear.'),
    (29, 'headlights',        'Lights & electrical', 'Headlights (low and high)', 'condition', null, null),
    (30, 'brake_lights',      'Lights & electrical', 'Brake lights', 'condition', null, null),
    (31, 'signals',           'Lights & electrical', 'Turn signals and hazards', 'condition', null, null),
    (32, 'wipers',            'Lights & electrical', 'Wiper blades and washers', 'condition', null, null),
    (33, 'horn',              'Lights & electrical', 'Horn', 'condition', null, null),
    (34, 'dash_warnings',     'Lights & electrical', 'Dashboard warning lights', 'condition', null, 'Note any light on and the codes read.'),
    (35, 'exhaust',           'Underbody', 'Exhaust system', 'condition', null, 'Leaks, hangers, corrosion, heat shields.'),
    (36, 'leak_oil',          'Underbody', 'Oil leaks', 'condition', null, null),
    (37, 'leak_coolant',      'Underbody', 'Coolant leaks', 'condition', null, null),
    (38, 'fuel_lines',        'Underbody', 'Fuel lines', 'condition', null, null),
    (39, 'windshield',        'Exterior & interior', 'Windshield chips and cracks', 'condition', null, null),
    (40, 'body_damage',       'Exterior & interior', 'Body damage noted', 'condition', null, 'Take photos of existing damage at check-in.'),
    (41, 'road_test',         'Road test', 'Road test notes', 'condition', null, 'Noises, vibration, braking, shifting, steering.')
  ) as t(n, k, s, l, kd, u, h)
$$;

-- A workshop without any template gets the default one.
create or replace function public.seed_inspection_templates(p_workshop uuid)
returns void
language sql security definer set search_path = public
as $$
  insert into public.inspection_templates (workshop_id, name, is_default, items)
  select p_workshop, 'Multi-point inspection', true, public.default_inspection_template_items()
  where not exists (select 1 from public.inspection_templates where workshop_id = p_workshop)
$$;
revoke all on function public.seed_inspection_templates(uuid) from public, anon, authenticated;

select public.seed_inspection_templates(id) from public.workshops;

create or replace function public.workshops_seed_inspection_templates()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.seed_inspection_templates(new.id);
  return new;
end;
$$;
drop trigger if exists workshops_seed_inspection_templates on public.workshops;
create trigger workshops_seed_inspection_templates
  after insert on public.workshops
  for each row execute function public.workshops_seed_inspection_templates();

-- Switch the default in one step (the unique index allows one at a time).
create or replace function public.set_default_inspection_template(p_template uuid)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  t public.inspection_templates;
begin
  if not public.has_access('settings', 'full') then raise exception 'You do not have permission to change inspection templates'; end if;
  select * into t from public.inspection_templates where id = p_template and workshop_id = public.my_workshop();
  if t.id is null then raise exception 'Template not found'; end if;
  update public.inspection_templates set is_default = false where workshop_id = t.workshop_id and is_default and id <> t.id;
  update public.inspection_templates set is_default = true where id = t.id and not is_default;
end;
$$;
revoke all on function public.set_default_inspection_template(uuid) from public, anon;
grant execute on function public.set_default_inspection_template(uuid) to authenticated;

-- 2. Inspections ------------------------------------------------------------------------------------------

create table if not exists public.inspections (
  id               uuid primary key default gen_random_uuid(),
  workshop_id      uuid not null references public.workshops (id) on delete cascade,
  repair_order_id  uuid not null references public.repair_orders (id) on delete cascade,
  template_id      uuid references public.inspection_templates (id) on delete set null,
  name             text not null,
  status           text not null default 'in_progress' check (status in ('in_progress', 'completed', 'sent')),
  started_by       uuid references auth.users (id) on delete set null,
  completed_by     uuid references auth.users (id) on delete set null,
  completed_at     timestamptz,
  sent_by          uuid references auth.users (id) on delete set null,
  sent_at          timestamptz,
  reopened_by      uuid references auth.users (id) on delete set null,
  reopened_at      timestamptz,
  summary          text check (length(summary) <= 2000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists inspections_ro_idx on public.inspections (repair_order_id, created_at);

create table if not exists public.inspection_items (
  id                uuid primary key default gen_random_uuid(),
  inspection_id     uuid not null references public.inspections (id) on delete cascade,
  workshop_id       uuid not null references public.workshops (id) on delete cascade,
  key               text not null,
  section           text not null,
  label             text not null,
  kind              text not null check (kind in ('condition', 'measurement')),
  help              text,
  condition         text check (condition in ('good', 'attention', 'urgent', 'na')),
  measurement       numeric(10, 2) check (measurement between -99999 and 99999),
  unit              text,
  note              text check (length(note) <= 1000),
  sort_order        int not null default 0,
  estimate_item_id  uuid references public.repair_order_items (id) on delete set null,
  updated_by        uuid references auth.users (id) on delete set null,
  updated_at        timestamptz,
  unique (inspection_id, key)
);
create index if not exists inspection_items_inspection_idx on public.inspection_items (inspection_id, sort_order);
create index if not exists inspection_items_estimate_idx on public.inspection_items (estimate_item_id) where estimate_item_id is not null;

-- 3. Photos and videos of an item ---------------------------------------------------------------------------

alter table public.repair_order_media add column if not exists inspection_item_id uuid references public.inspection_items (id) on delete set null;
create index if not exists repair_order_media_inspection_idx on public.repair_order_media (inspection_item_id) where inspection_item_id is not null;

-- The item must be on the same repair order, and its inspection open. While it is not sent, the file is held from
-- the customer (send_inspection shows it).
create or replace function public.repair_media_inspection_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  st text;
begin
  if new.inspection_item_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.inspection_item_id is not distinct from old.inspection_item_id then return new; end if;
  select i.status into st
  from public.inspection_items it join public.inspections i on i.id = it.inspection_id
  where it.id = new.inspection_item_id and i.repair_order_id = new.repair_order_id;
  if st is null then raise exception 'That inspection item is not on this repair order.'; end if;
  if st <> 'in_progress' then raise exception 'This inspection is completed. Reopen it to add photos or videos.'; end if;
  new.visible_to_customer := false;
  return new;
end;
$$;
drop trigger if exists repair_media_inspection_guard on public.repair_order_media;
create trigger repair_media_inspection_guard
  before insert or update of inspection_item_id on public.repair_order_media
  for each row execute function public.repair_media_inspection_guard();

-- 4. Staff functions ----------------------------------------------------------------------------------------

-- The inspection, locked, if the caller may change it (Repair Orders full, own workshop).
create or replace function public.inspection_for_write(p_inspection uuid)
returns public.inspections
language plpgsql volatile security definer set search_path = public
as $$
declare
  i public.inspections;
begin
  if not public.has_access('repair-orders', 'full') then raise exception 'You do not have permission to change inspections'; end if;
  select * into i from public.inspections where id = p_inspection and workshop_id = public.my_workshop() for update;
  if i.id is null then raise exception 'Inspection not found'; end if;
  return i;
end;
$$;
revoke all on function public.inspection_for_write(uuid) from public, anon, authenticated;

create or replace function public.start_inspection(p_repair_order uuid, p_template uuid default null)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare
  r public.repair_orders;
  t public.inspection_templates;
  new_id uuid;
begin
  if not public.has_access('repair-orders', 'full') then raise exception 'You do not have permission to start inspections'; end if;
  select * into r from public.repair_orders where id = p_repair_order and workshop_id = public.my_workshop();
  if r.id is null then raise exception 'Repair order not found'; end if;
  if r.status in ('completed', 'cancelled') then raise exception 'A completed or cancelled repair order cannot be inspected.'; end if;

  if p_template is null then
    select * into t from public.inspection_templates where workshop_id = r.workshop_id and is_default;
  else
    select * into t from public.inspection_templates where id = p_template and workshop_id = r.workshop_id;
  end if;
  if t.id is null then raise exception 'Choose an inspection template.'; end if;

  insert into public.inspections (workshop_id, repair_order_id, template_id, name, started_by)
  values (r.workshop_id, r.id, t.id, t.name, auth.uid())
  returning id into new_id;

  insert into public.inspection_items (inspection_id, workshop_id, key, section, label, kind, help, unit, sort_order)
  select new_id, r.workshop_id, e.v ->> 'key', trim(e.v ->> 'section'), trim(e.v ->> 'label'), e.v ->> 'kind',
         nullif(trim(coalesce(e.v ->> 'help', '')), ''), nullif(trim(coalesce(e.v ->> 'unit', '')), ''), (e.n * 10)::int
  from jsonb_array_elements(t.items) with ordinality as e(v, n);

  insert into public.repair_order_events (repair_order_id, workshop_id, kind, title, body, visible_to_customer, created_by)
  values (r.id, r.workshop_id, 'note', 'Inspection started', t.name, false, auth.uid());
  return new_id;
end;
$$;
revoke all on function public.start_inspection(uuid, uuid) from public, anon;
grant execute on function public.start_inspection(uuid, uuid) to authenticated;

-- Saves the whole state of one item (condition, measurement, note): saving the same values twice is harmless.
create or replace function public.update_inspection_item(p_item uuid, p_condition text, p_measurement numeric, p_note text)
returns public.inspection_items
language plpgsql volatile security definer set search_path = public
as $$
declare
  it public.inspection_items;
  i public.inspections;
begin
  select * into it from public.inspection_items where id = p_item and workshop_id = public.my_workshop();
  if it.id is null then
    if not public.has_access('repair-orders', 'full') then raise exception 'You do not have permission to change inspections'; end if;
    raise exception 'Inspection item not found';
  end if;
  i := public.inspection_for_write(it.inspection_id);
  if i.status <> 'in_progress' then raise exception 'This inspection is completed. Reopen it to make changes.'; end if;
  if p_condition is not null and p_condition not in ('good', 'attention', 'urgent', 'na') then raise exception 'Choose good, attention, urgent or N/A.'; end if;
  if p_measurement is not null and (p_measurement < -99999 or p_measurement > 99999) then raise exception 'That measurement is out of range.'; end if;
  if length(coalesce(p_note, '')) > 1000 then raise exception 'A note can be at most 1000 characters.'; end if;

  update public.inspection_items
  set condition = p_condition, measurement = round(p_measurement, 2), note = nullif(trim(coalesce(p_note, '')), ''),
      updated_by = auth.uid(), updated_at = now()
  where id = it.id
  returning * into it;
  update public.inspections set updated_at = now() where id = i.id;
  return it;
end;
$$;
revoke all on function public.update_inspection_item(uuid, text, numeric, text) from public, anon;
grant execute on function public.update_inspection_item(uuid, text, numeric, text) to authenticated;

-- A finding (attention or urgent) becomes an estimate line waiting for the customer's approval.
-- Allowed on completed and sent inspections too: it does not change the findings.
create or replace function public.add_inspection_finding_to_estimate(
  p_item uuid, p_kind text, p_description text, p_quantity numeric, p_unit_price numeric)
returns public.repair_order_items
language plpgsql volatile security definer set search_path = public
as $$
declare
  it public.inspection_items;
  i public.inspections;
  r public.repair_orders;
  line public.repair_order_items;
  d text := trim(coalesce(p_description, ''));
begin
  if not public.has_access('repair-orders', 'full') then raise exception 'You do not have permission to change the estimate'; end if;
  select * into it from public.inspection_items where id = p_item and workshop_id = public.my_workshop() for update;
  if it.id is null then raise exception 'Inspection item not found'; end if;
  select * into i from public.inspections where id = it.inspection_id;
  select * into r from public.repair_orders where id = i.repair_order_id for update;
  if r.status in ('completed', 'cancelled') then raise exception 'A completed or cancelled repair order cannot get new estimate lines.'; end if;
  if coalesce(it.condition, '') not in ('attention', 'urgent') then raise exception 'Only items marked attention or urgent can be added to the estimate.'; end if;
  if it.estimate_item_id is not null and exists (select 1 from public.repair_order_items where id = it.estimate_item_id) then
    raise exception 'This finding is already on the estimate.';
  end if;
  if coalesce(p_kind, '') not in ('service', 'labour', 'part', 'fee') then raise exception 'Choose service, labour, part or fee.'; end if;
  if length(d) not between 1 and 300 then raise exception 'Enter a description of at most 300 characters.'; end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 99999999 then raise exception 'The quantity must be more than 0.'; end if;
  if p_unit_price is null or p_unit_price < 0 or p_unit_price > 99999999 then raise exception 'The price cannot be negative.'; end if;

  insert into public.repair_order_items (repair_order_id, workshop_id, kind, description, quantity, unit_price, approval, sort_order)
  values (r.id, r.workshop_id, p_kind, d, round(p_quantity, 2), round(p_unit_price, 2), 'pending',
          coalesce((select max(sort_order) from public.repair_order_items where repair_order_id = r.id), 0) + 10)
  returning * into line;
  update public.inspection_items set estimate_item_id = line.id, updated_by = auth.uid(), updated_at = now() where id = it.id;
  return line;
end;
$$;
revoke all on function public.add_inspection_finding_to_estimate(uuid, text, text, numeric, numeric) from public, anon;
grant execute on function public.add_inspection_finding_to_estimate(uuid, text, text, numeric, numeric) to authenticated;

create or replace function public.complete_inspection(p_inspection uuid, p_summary text default null)
returns public.inspections
language plpgsql volatile security definer set search_path = public
as $$
declare
  i public.inspections;
begin
  i := public.inspection_for_write(p_inspection);
  if i.status <> 'in_progress' then raise exception 'This inspection is already completed.'; end if;
  if length(coalesce(p_summary, '')) > 2000 then raise exception 'The summary can be at most 2000 characters.'; end if;
  update public.inspections
  set status = 'completed', completed_by = auth.uid(), completed_at = now(),
      summary = coalesce(nullif(trim(coalesce(p_summary, '')), ''), summary), updated_at = now()
  where id = i.id
  returning * into i;
  insert into public.repair_order_events (repair_order_id, workshop_id, kind, title, body, visible_to_customer, created_by)
  values (i.repair_order_id, i.workshop_id, 'note', 'Inspection completed', i.name, false, auth.uid());
  return i;
end;
$$;
revoke all on function public.complete_inspection(uuid, text) from public, anon;
grant execute on function public.complete_inspection(uuid, text) to authenticated;

-- Makes the report visible to the customer (completing it first if needed) and shows its held photos.
create or replace function public.send_inspection(p_inspection uuid, p_summary text default null)
returns public.inspections
language plpgsql volatile security definer set search_path = public
as $$
declare
  i public.inspections;
  last_sent timestamptz;
begin
  i := public.inspection_for_write(p_inspection);
  if i.status = 'sent' then raise exception 'This inspection was already sent to the customer.'; end if;
  if length(coalesce(p_summary, '')) > 2000 then raise exception 'The summary can be at most 2000 characters.'; end if;
  if exists (select 1 from public.repair_orders where id = i.repair_order_id and status = 'cancelled') then
    raise exception 'This repair order is cancelled.';
  end if;
  last_sent := i.sent_at;
  update public.inspections
  set status = 'sent', sent_by = auth.uid(), sent_at = now(),
      completed_by = case when status = 'in_progress' then auth.uid() else completed_by end,
      completed_at = case when status = 'in_progress' then now() else completed_at end,
      summary = coalesce(nullif(trim(coalesce(p_summary, '')), ''), summary), updated_at = now()
  where id = i.id
  returning * into i;
  -- Photos added since the last send are shown (one hidden by staff after an earlier send stays hidden).
  update public.repair_order_media m set visible_to_customer = true
  where m.inspection_item_id in (select id from public.inspection_items where inspection_id = i.id)
    and not m.visible_to_customer and m.created_at > coalesce(last_sent, '-infinity'::timestamptz);
  insert into public.repair_order_events (repair_order_id, workshop_id, kind, title, body, visible_to_customer, created_by)
  values (i.repair_order_id, i.workshop_id, 'note', 'Inspection report ready',
          'Your vehicle inspection report (' || i.name || ') is ready to view.', true, auth.uid());
  return i;
end;
$$;
revoke all on function public.send_inspection(uuid, text) from public, anon;
grant execute on function public.send_inspection(uuid, text) to authenticated;

-- Back to in progress (records who and when). A sent report is hidden from the customer until it is sent again.
create or replace function public.reopen_inspection(p_inspection uuid)
returns public.inspections
language plpgsql volatile security definer set search_path = public
as $$
declare
  i public.inspections;
begin
  i := public.inspection_for_write(p_inspection);
  if i.status = 'in_progress' then raise exception 'This inspection is already open.'; end if;
  if exists (select 1 from public.repair_orders where id = i.repair_order_id and status in ('completed', 'cancelled')) then
    raise exception 'The repair order is completed or cancelled; its inspection cannot be reopened.';
  end if;
  update public.inspections
  set status = 'in_progress', reopened_by = auth.uid(), reopened_at = now(), updated_at = now()
  where id = i.id
  returning * into i;
  insert into public.repair_order_events (repair_order_id, workshop_id, kind, title, body, visible_to_customer, created_by)
  values (i.repair_order_id, i.workshop_id, 'note', 'Inspection reopened', i.name, false, auth.uid());
  return i;
end;
$$;
revoke all on function public.reopen_inspection(uuid) from public, anon;
grant execute on function public.reopen_inspection(uuid) to authenticated;

-- 5. Customer report ----------------------------------------------------------------------------------------

-- Sent inspections of a repair, for the customer (tracking code + email or phone, or the signed-in owner).
create or replace function public.track_inspections(p_slug text, p_code text, p_contact text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  r public.repair_orders;
begin
  r := public.repair_for_contact(p_slug, p_code, p_contact);
  if r.id is null then raise exception 'We could not find a repair with those details. Check the tracking code and the email or phone you booked with.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'name', i.name, 'completed_at', i.completed_at, 'sent_at', i.sent_at, 'summary', i.summary,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', it.id, 'section', it.section, 'label', it.label, 'kind', it.kind, 'condition', it.condition,
          'measurement', it.measurement, 'unit', it.unit, 'note', it.note,
          'estimate', (select jsonb_build_object('description', li.description, 'approval', li.approval)
                       from public.repair_order_items li where li.id = it.estimate_item_id),
          'media', coalesce((
            select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'path', m.path, 'caption', m.caption, 'created_at', m.created_at)
                             order by m.created_at)
            from public.repair_order_media m where m.inspection_item_id = it.id and m.visible_to_customer), '[]'::jsonb))
          order by it.sort_order)
        from public.inspection_items it where it.inspection_id = i.id), '[]'::jsonb))
      order by i.sent_at desc)
    from public.inspections i where i.repair_order_id = r.id and i.status = 'sent'), '[]'::jsonb);
end;
$$;
revoke all on function public.track_inspections(text, text, text) from public;
grant execute on function public.track_inspections(text, text, text) to anon, authenticated;

-- 6. Row level security ---------------------------------------------------------------------------------------

alter table public.inspection_templates enable row level security;
alter table public.inspections enable row level security;
alter table public.inspection_items enable row level security;

drop policy if exists "inspection_templates: staff read" on public.inspection_templates;
create policy "inspection_templates: staff read" on public.inspection_templates
  for select to authenticated
  using (workshop_id = public.my_workshop() and (public.has_access('repair-orders', 'view') or public.has_access('settings', 'view')));
drop policy if exists "inspection_templates: settings insert" on public.inspection_templates;
create policy "inspection_templates: settings insert" on public.inspection_templates
  for insert to authenticated
  with check (workshop_id = public.my_workshop() and public.has_access('settings', 'full') and not is_default);
drop policy if exists "inspection_templates: settings update" on public.inspection_templates;
create policy "inspection_templates: settings update" on public.inspection_templates
  for update to authenticated
  using (workshop_id = public.my_workshop() and public.has_access('settings', 'full'))
  with check (workshop_id = public.my_workshop() and public.has_access('settings', 'full'));
drop policy if exists "inspection_templates: settings delete" on public.inspection_templates;
create policy "inspection_templates: settings delete" on public.inspection_templates
  for delete to authenticated
  using (workshop_id = public.my_workshop() and public.has_access('settings', 'full') and not is_default);

-- The default flag only changes through set_default_inspection_template.
revoke all on public.inspection_templates from anon, authenticated;
grant select, delete on public.inspection_templates to authenticated;
grant insert (workshop_id, name, items) on public.inspection_templates to authenticated;
grant update (name, items) on public.inspection_templates to authenticated;

drop policy if exists "inspections: staff read" on public.inspections;
create policy "inspections: staff read" on public.inspections
  for select to authenticated using (workshop_id = public.my_workshop() and public.has_access('repair-orders', 'view'));
drop policy if exists "inspection_items: staff read" on public.inspection_items;
create policy "inspection_items: staff read" on public.inspection_items
  for select to authenticated using (workshop_id = public.my_workshop() and public.has_access('repair-orders', 'view'));

-- Inspections change only through the functions above.
revoke all on public.inspections, public.inspection_items from anon, authenticated;
grant select on public.inspections, public.inspection_items to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'inspections') then
      alter publication supabase_realtime add table public.inspections;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'inspection_items') then
      alter publication supabase_realtime add table public.inspection_items;
    end if;
  end if;
end $$;

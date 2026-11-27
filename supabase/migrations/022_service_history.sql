-- EuroWerken: service history per vehicle, and closed conversations. Safe to re-run.
--
--   A vehicle's history is every repair order of the workshop for that vehicle. Repairs are grouped by VIN; a
--   repair with only a plate joins the VIN of another repair with the same plate, else it is grouped by plate.
--
--   service_history_search(query)       staff: vehicles whose repairs match a VIN, plate, phone, name or email
--   service_history(key)                staff: the full history of one vehicle (everything, team-only marked)
--   my_service_history(slug, vehicle)   customer: their own repairs on one of their cars (customer-visible parts)
--
--   Conversations close when a repair is completed or cancelled: no new messages from anyone.

-- 1. Grouping keys ------------------------------------------------------------------------------------------

create or replace function public.norm_vin(v jsonb)
returns text
language sql immutable
as $$
  select case when length(x) = 17 then x end
  from (select upper(regexp_replace(coalesce(v ->> 'vin', ''), '[^A-Za-z0-9]', '', 'g')) x) s
$$;

create or replace function public.norm_plate(v jsonb)
returns text
language sql immutable
as $$
  select nullif(upper(regexp_replace(coalesce(v ->> 'plate', ''), '[^A-Za-z0-9]', '', 'g')), '')
$$;

-- Every repair order of a workshop with its vehicle key.
create or replace function public.workshop_vehicle_keys(p_workshop uuid)
returns table (repair_order_id uuid, vehicle_key text)
language sql stable security definer set search_path = public
as $$
  with m as (
    select r.id, public.norm_vin(r.vehicle) vin, public.norm_plate(r.vehicle) plate
    from public.repair_orders r where r.workshop_id = p_workshop
  ),
  plate_vin as (
    select plate, min(vin) vin from m where vin is not null and plate is not null group by plate
  )
  select m.id,
         coalesce('VIN:' || m.vin, 'VIN:' || pv.vin, 'PLATE:' || m.plate, 'RO:' || m.id::text)
  from m left join plate_vin pv on pv.plate = m.plate and m.vin is null
$$;
revoke all on function public.workshop_vehicle_keys(uuid) from public, anon, authenticated;

-- One repair order, as the history shows it. p_staff adds team-only notes, hidden photos and staff detail.
create or replace function public.history_repair_json(r public.repair_orders, p_staff boolean)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id, 'number', r.number, 'tracking_code', r.tracking_code, 'status', r.status,
    'vehicle', r.vehicle, 'contact_name', r.contact_name,
    'created_at', r.created_at, 'completed_at', r.completed_at, 'labour_rate', r.labour_rate,
    'customer_notes', r.customer_notes,
    'technician', (select t.name from public.team_members t where t.id = r.technician_id),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'kind', i.kind, 'description', i.description, 'quantity', i.quantity,
        'unit_price', i.unit_price, 'approval', i.approval) order by i.sort_order, i.created_at)
      from public.repair_order_items i where i.repair_order_id = r.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'kind', e.kind, 'title', e.title, 'body', e.body, 'created_at', e.created_at,
        'visible_to_customer', e.visible_to_customer) order by e.created_at)
      from public.repair_order_events e where e.repair_order_id = r.id and (p_staff or e.visible_to_customer)), '[]'::jsonb),
    'media', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'kind', m.kind, 'path', m.path, 'caption', m.caption, 'created_at', m.created_at,
        'visible_to_customer', m.visible_to_customer) order by m.created_at)
      from public.repair_order_media m where m.repair_order_id = r.id and (p_staff or m.visible_to_customer)), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'sender', g.sender, 'author_name', g.author_name, 'body', g.body, 'created_at', g.created_at) order by g.created_at)
      from public.repair_order_messages g where g.repair_order_id = r.id), '[]'::jsonb)
  ) || case when p_staff then jsonb_build_object(
    'contact_email', r.contact_email, 'contact_phone', r.contact_phone, 'staff_notes', r.staff_notes,
    'approvals', coalesce((select jsonb_agg(jsonb_build_object(
        'item_description', a.item_description, 'decision', a.decision, 'method', a.method, 'decided_at', a.decided_at,
        'customer_email', a.customer_email, 'note', a.note) order by a.decided_at)
      from public.repair_item_approvals a where a.repair_order_id = r.id), '[]'::jsonb))
  else '{}'::jsonb end
$$;
revoke all on function public.history_repair_json(public.repair_orders, boolean) from public, anon, authenticated;

-- 2. Staff: search and history --------------------------------------------------------------------------------

create or replace function public.service_history_search(p_query text)
returns table (
  vehicle_key text, vehicle jsonb, owner_name text, owner_email text, owner_phone text,
  visits bigint, first_visit timestamptz, last_visit timestamptz, open_repairs bigint)
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
  ),
  rows as (
    select k.vehicle_key, r.* from public.repair_orders r join k on k.repair_order_id = r.id
    where k.vehicle_key in (select vehicle_key from hit)
  )
  select x.vehicle_key,
         (array_agg(x.vehicle order by x.created_at desc))[1],
         (array_agg(x.contact_name order by x.created_at desc))[1],
         (array_agg(x.contact_email order by x.created_at desc) filter (where x.contact_email is not null))[1],
         (array_agg(x.contact_phone order by x.created_at desc) filter (where x.contact_phone is not null))[1],
         count(*), min(x.created_at), max(x.created_at),
         count(*) filter (where x.status not in ('completed', 'cancelled'))
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
      where k.vehicle_key = p_key), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.service_history_search(text) from public, anon;
revoke all on function public.service_history(text) from public, anon;
grant execute on function public.service_history_search(text) to authenticated;
grant execute on function public.service_history(text) to authenticated;

-- 3. Customer: their own car --------------------------------------------------------------------------------

create or replace function public.my_service_history(p_slug text, p_vehicle uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  w uuid;
  v public.customer_vehicles;
  vin text;
  plate text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select workshop_id into w from public.workshop_sites where slug = lower(trim(p_slug)) and published;
  if w is null then raise exception 'Workshop not found.'; end if;
  select * into v from public.customer_vehicles where id = p_vehicle and customer_id = auth.uid();
  if v.id is null then raise exception 'Vehicle not found.'; end if;
  vin := public.norm_vin(jsonb_build_object('vin', v.vin));
  plate := public.norm_plate(jsonb_build_object('plate', v.plate));
  return coalesce((
    select jsonb_agg(public.history_repair_json(r, false) order by r.created_at desc)
    from public.repair_orders r
    where r.workshop_id = w and r.customer_id = auth.uid() and r.status <> 'cancelled'
      and (r.vehicle_id = v.id
           or (vin is not null and public.norm_vin(r.vehicle) = vin)
           or (plate is not null and public.norm_plate(r.vehicle) = plate
               and (vin is null or public.norm_vin(r.vehicle) is null)))
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.my_service_history(text, uuid) from public, anon;
grant execute on function public.my_service_history(text, uuid) to authenticated;

-- 4. Closed conversations ---------------------------------------------------------------------------------------

create or replace function public.repair_messages_closed()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.repair_orders where id = new.repair_order_id and status in ('completed', 'cancelled')) then
    raise exception 'This repair is closed, so its conversation is closed too.';
  end if;
  return new;
end;
$$;
drop trigger if exists repair_messages_closed on public.repair_order_messages;
create trigger repair_messages_closed
  before insert on public.repair_order_messages
  for each row execute function public.repair_messages_closed();

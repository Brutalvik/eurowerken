-- EuroWerken: find a customer and their cars by email or phone when staff book an appointment. Safe to re-run.
--
--   staff_find_customer(email, phone)   for staff with Repair Orders (view): the workshop's customer with that email or
--                                       phone (last 10 digits), and every car known for them: cars in their garage on
--                                       the customer site, and cars from past bookings and repair orders here.
--                                       Returns null when nothing matches. Never looks outside the workshop.
--   A staff booking may link the customer account and one of their cars; a trigger makes sure the account is a
--   customer of the workshop and the car belongs to that account.

create or replace function public.norm_phone10(p text)
returns text
language sql immutable
as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10), '')
$$;

create or replace function public.staff_find_customer(p_email text, p_phone text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  w uuid := public.my_workshop();
  e text := nullif(lower(trim(coalesce(p_email, ''))), '');
  ph text := public.norm_phone10(p_phone);
  acc public.customer_accounts;
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

  -- Every car seen: the customer's garage first, then past bookings and repairs, newest first. A car is kept once:
  -- a later sighting is the same car when it shares the VIN or the plate, or has neither and the same make and model.
  cars := '[]'::jsonb;
  for c in
    select * from (
      select v.id as vehicle_id, v.make, v.model, v.year::text as year, v.plate, v.vin, v.nickname, v.created_at as seen, 0 as rank
      from public.customer_vehicles v where acc.id is not null and v.customer_id = acc.id
      union all
      select null::uuid, nullif(trim(x.vehicle ->> 'make'), ''), nullif(trim(x.vehicle ->> 'model'), ''),
             nullif(trim(x.vehicle ->> 'year'), ''), nullif(trim(x.vehicle ->> 'plate'), ''), nullif(trim(x.vehicle ->> 'vin'), ''),
             null::text, x.created_at, 1
      from (
        select contact_email, contact_phone, vehicle, created_at, customer_id from public.appointments where workshop_id = w
        union all
        select contact_email, contact_phone, vehicle, created_at, customer_id from public.repair_orders where workshop_id = w
      ) x
      where ((e is not null and lower(x.contact_email) = e)
             or (ph is not null and public.norm_phone10(x.contact_phone) = ph)
             or (acc.id is not null and x.customer_id = acc.id))
        and (nullif(trim(x.vehicle ->> 'make'), '') is not null or nullif(trim(x.vehicle ->> 'plate'), '') is not null)
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
         or (c.rank = 1 and vin is null and plate is not null and k ->> 'k_plate' is null and k ->> 'k_mm' = mm)
    ) then
      continue;
    end if;
    cars := cars || jsonb_build_array(jsonb_build_object(
      'vehicle_id', c.vehicle_id, 'make', c.make, 'model', c.model, 'year', c.year, 'plate', c.plate, 'vin', c.vin,
      'nickname', c.nickname, 'from_garage', c.rank = 0, 'last_seen', c.seen,
      'k_vin', vin, 'k_plate', plate, 'k_mm', mm));
  end loop;
  select coalesce(jsonb_agg(k - 'k_vin' - 'k_plate' - 'k_mm'), '[]'::jsonb) into cars from jsonb_array_elements(cars) k;

  -- Contact details: the account first, else the most recent booking or repair.
  select p.contact_name, p.contact_email, p.contact_phone into name, email, phone
  from (
    select contact_name, contact_email, contact_phone, created_at from public.appointments
    where workshop_id = w and ((e is not null and lower(contact_email) = e) or (ph is not null and public.norm_phone10(contact_phone) = ph))
    union all
    select contact_name, contact_email, contact_phone, created_at from public.repair_orders
    where workshop_id = w and ((e is not null and lower(contact_email) = e) or (ph is not null and public.norm_phone10(contact_phone) = ph))
  ) p order by p.created_at desc limit 1;

  if acc.id is null and name is null then return null; end if;

  return jsonb_build_object(
    'customer_id', acc.id,
    'name', coalesce(nullif(trim(acc.full_name), ''), name),
    'email', coalesce(acc.email, email),
    'phone', coalesce(nullif(trim(acc.phone), ''), phone),
    'has_account', acc.id is not null,
    'vehicles', cars
  );
end;
$$;
revoke all on function public.staff_find_customer(text, text) from public, anon;
grant execute on function public.staff_find_customer(text, text) to authenticated;

-- A booking's customer account and car must make sense for the workshop.
create or replace function public.appointments_check_customer_link()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.customer_id is not null
     and (tg_op = 'INSERT' or new.customer_id is distinct from old.customer_id)
     and new.customer_id is distinct from auth.uid()
     and not exists (select 1 from public.workshop_customers where workshop_id = new.workshop_id and customer_id = new.customer_id) then
    raise exception 'This customer account is not a customer of this workshop.';
  end if;
  if new.vehicle_id is not null
     and (tg_op = 'INSERT' or new.vehicle_id is distinct from old.vehicle_id)
     and not exists (select 1 from public.customer_vehicles where id = new.vehicle_id and customer_id = new.customer_id) then
    raise exception 'That car does not belong to this customer.';
  end if;
  return new;
end;
$$;
drop trigger if exists appointments_check_customer_link on public.appointments;
create trigger appointments_check_customer_link
  before insert or update of customer_id, vehicle_id on public.appointments
  for each row execute function public.appointments_check_customer_link();

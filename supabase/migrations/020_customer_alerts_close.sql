-- EuroWerken: close a customer's "approval needed" alert when nothing waits for them any more. Safe to re-run.
--
-- 019 closes it when the last pending item is approved or declined. This also closes it when staff
-- remove the last pending item, or move the repair out of "awaiting approval" (started, cancelled...).

create or replace function public.close_customer_approval_alert(p_repair_order uuid)
returns void
language sql volatile security definer set search_path = public
as $$
  update public.customer_notifications set read_at = now()
  where repair_order_id = p_repair_order and kind = 'approval' and read_at is null
$$;
revoke all on function public.close_customer_approval_alert(uuid) from public, anon, authenticated;

create or replace function public.repair_orders_alert_customer()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'awaiting_approval' and old.status is distinct from new.status then
    perform public.customer_approval_alert(new.id);
  elsif old.status = 'awaiting_approval' and new.status <> 'awaiting_approval' then
    perform public.close_customer_approval_alert(new.id);
  end if;
  return new;
end;
$$;

create or replace function public.repair_items_closed_alert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.approval = 'pending'
     and not exists (select 1 from public.repair_order_items where repair_order_id = old.repair_order_id and approval = 'pending') then
    perform public.close_customer_approval_alert(old.repair_order_id);
  end if;
  return old;
end;
$$;
drop trigger if exists repair_items_closed_alert on public.repair_order_items;
create trigger repair_items_closed_alert
  after delete on public.repair_order_items
  for each row execute function public.repair_items_closed_alert();

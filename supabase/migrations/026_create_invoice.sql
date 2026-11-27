-- EuroWerken: create the invoice of a repair by hand. Safe to re-run. Run after 024.
--
-- Invoices are made automatically at Ready for pickup. Repairs that were ready or completed before invoicing existed
-- (or whose invoice should be made now) get one with create_invoice(): same numbering and content as the automatic
-- invoice. With p_send the ERP then stores the PDF and emails it, as at Ready for pickup; without, it is only filed.

create or replace function public.create_invoice(p_repair_order uuid, p_send boolean default true)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare
  r public.repair_orders;
  inv public.invoices;
begin
  select * into r from public.repair_orders where id = p_repair_order and workshop_id = public.my_workshop();
  if r.id is null then raise exception 'Repair order not found.'; end if;
  if not (public.has_access('invoices', 'full') or public.has_access('repair-orders', 'full')) then
    raise exception 'You need full access to Invoices or Repair Orders to create invoices.';
  end if;
  if r.status not in ('ready', 'completed') then
    raise exception 'An invoice can be created once the repair is ready for pickup or completed.';
  end if;
  if exists (select 1 from public.invoices where repair_order_id = r.id) then
    raise exception 'This repair already has an invoice.';
  end if;
  inv := public.issue_invoice(r.id);
  -- Sent: email_pending makes the ERP store the PDF and queue the email. Filed only: the PDF is stored, no email.
  update public.invoices set email_pending = coalesce(p_send, true) where id = inv.id;
  return inv.id;
end;
$$;
revoke all on function public.create_invoice(uuid, boolean) from public, anon;
grant execute on function public.create_invoice(uuid, boolean) to authenticated;

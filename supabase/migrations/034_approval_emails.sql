-- 034: an approval email for EVERY approval request.
--
-- Before: the customer got the "your estimate is ready" email only when the repair MOVED into Awaiting approval.
-- A second request while the repair was already waiting (a new finding, an extra part) sent nothing.
--
-- Now:
--   * Moving into Awaiting approval queues an 'approval' email (instead of the plain status email). The mailer lists
--     every line still waiting for a decision, with prices, and a Review and approve button.
--   * queue_approval_email(repair) queues the same email when the shop asks again while the repair is already
--     waiting. The ERP calls it after marking the new lines as waiting.
--   * Approval emails are sent even when the shop turned progress emails off, and even when the customer turned off
--     progress emails in their account: the work cannot go ahead without an answer (like the invoice email).
--   * Never two waiting approval emails for the same repair: a request made while one is still queued is folded into
--     it (the mailer reads the waiting lines when it sends).
--
-- Safe to run more than once.

-- 1. The new kind of email -------------------------------------------------------------------------------------------

alter table public.customer_outbox drop constraint if exists customer_outbox_kind_check;
alter table public.customer_outbox add constraint customer_outbox_kind_check
  check (kind in ('status', 'invoice', 'approval'));

-- 2. Queue one approval email (shared by the status trigger and the function below) ---------------------------------

create or replace function public.queue_approval_email_for(r public.repair_orders)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  addr text;
begin
  -- Approval emails ignore the "progress emails" choices: the customer must answer for the work to go ahead.
  addr := public.repair_email_address(r, false);
  if addr is null then return false; end if;
  -- One waiting approval email per repair: a newer request is folded into it.
  if exists (select 1 from public.customer_outbox
             where repair_order_id = r.id and kind = 'approval' and state = 'pending') then
    return true;
  end if;
  insert into public.customer_outbox (workshop_id, repair_order_id, kind, status, to_address)
  values (r.workshop_id, r.id, 'approval', 'awaiting_approval', addr);
  return true;
end;
$$;
revoke all on function public.queue_approval_email_for(public.repair_orders) from public, anon, authenticated;

-- 3. Status changes: Awaiting approval sends the approval email (copied from 024, with that one change) -------------

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
    update public.invoices set email_pending = true where id = inv.id;
    return new;
  end if;

  if new.status = 'awaiting_approval' then
    perform public.queue_approval_email_for(new);
    return new;
  end if;

  if new.status = 'cancelled' then
    update public.invoices set status = 'void', email_pending = false, updated_at = now()
    where repair_order_id = new.id and status = 'issued';
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

-- 4. Asking again while the repair is already waiting -----------------------------------------------------------------

-- Returns 'queued', 'no_email' (no address on the repair) or 'nothing_waiting' (no line waits for a decision).
create or replace function public.queue_approval_email(p_repair_order uuid)
returns text
language plpgsql volatile security definer set search_path = public
as $$
declare
  r public.repair_orders;
begin
  select * into r from public.repair_orders where id = p_repair_order for update;
  if not found or r.workshop_id is distinct from public.my_workshop() then
    raise exception 'Repair order not found.' using errcode = 'P0002';
  end if;
  if not public.has_access('repair-orders', 'full') then
    raise exception 'You need full access to Repair Orders to ask the customer for approval.' using errcode = '42501';
  end if;
  if r.status <> 'awaiting_approval' then
    raise exception 'The repair is not waiting for approval. Ask for approval from the repair order first.';
  end if;
  if not exists (select 1 from public.repair_order_items where repair_order_id = r.id and approval = 'pending') then
    return 'nothing_waiting';
  end if;
  if not public.queue_approval_email_for(r) then return 'no_email'; end if;

  insert into public.repair_order_events (repair_order_id, workshop_id, kind, title, body, visible_to_customer, created_by)
  values (r.id, r.workshop_id, 'approval', 'Estimate sent for approval', 'More work is waiting for your approval.', true, auth.uid());
  return 'queued';
end;
$$;
revoke all on function public.queue_approval_email(uuid) from public, anon;
grant execute on function public.queue_approval_email(uuid) to authenticated;

notify pgrst, 'reload schema';

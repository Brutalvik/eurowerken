-- EuroWerken: invoice privacy settings, and invoice PDFs made in the ERP. Safe to re-run. Run after 023.
--
--   workshop_notification_settings.invoice_hide_contact   the shop's default: invoices show the customer's phone as
--                                                         "403 471 xxxx" and email as "vixxx0@gmail.com"
--   customer_accounts.invoice_hide_contact                the customer's own default when they print or download
--   Both are only starting points: whoever prints chooses again each time.
--
--   The invoice PDF is now made by the ERP (one design for the ERP, the customer site and the email), stored in the
--   private "invoices" bucket, then attach_invoice_pdf() queues the invoice email. The customer-mailer Edge Function
--   only attaches the stored file. Ready for pickup marks the invoice "email_pending"; the ERP makes the PDF as soon
--   as the invoice shows on a repair order or the Invoices page.

alter table public.workshop_notification_settings add column if not exists invoice_hide_contact boolean not null default true;
alter table public.customer_accounts add column if not exists invoice_hide_contact boolean not null default true;
grant update (invoice_hide_contact) on public.customer_accounts to authenticated;
alter table public.invoices add column if not exists email_pending boolean not null default false;

create or replace function public.set_invoice_privacy(p_hide boolean)
returns void
language plpgsql volatile security definer set search_path = public
as $$
begin
  if public.my_workshop() is null or not public.has_access('settings', 'full') then
    raise exception 'You need full access to Settings to change this.';
  end if;
  insert into public.workshop_notification_settings (workshop_id, invoice_hide_contact, updated_by, updated_at)
  values (public.my_workshop(), coalesce(p_hide, true), auth.uid(), now())
  on conflict (workshop_id) do update
    set invoice_hide_contact = excluded.invoice_hide_contact, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end;
$$;
revoke all on function public.set_invoice_privacy(boolean) from public, anon;
grant execute on function public.set_invoice_privacy(boolean) to authenticated;

-- Staff who may change repair orders or invoices store invoice PDFs in their workshop's folder.
drop policy if exists "invoices: staff upload pdf" on storage.objects;
create policy "invoices: staff upload pdf" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'invoices' and (storage.foldername(name))[1] = public.my_workshop()::text
              and (public.has_access('invoices', 'full') or public.has_access('repair-orders', 'full')));
drop policy if exists "invoices: staff replace pdf" on storage.objects;
create policy "invoices: staff replace pdf" on storage.objects
  for update to authenticated
  using (bucket_id = 'invoices' and (storage.foldername(name))[1] = public.my_workshop()::text
         and (public.has_access('invoices', 'full') or public.has_access('repair-orders', 'full')));

-- Ready for pickup: issue the invoice and wait for its PDF (no email yet).
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

-- Send again: make a fresh PDF (the ERP does it at once) and email it.
create or replace function public.resend_invoice(p_invoice uuid)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  inv public.invoices;
  r public.repair_orders;
begin
  select * into inv from public.invoices where id = p_invoice and workshop_id = public.my_workshop();
  if inv.id is null then raise exception 'Invoice not found.'; end if;
  if not (public.has_access('invoices', 'full') or public.has_access('repair-orders', 'full')) then
    raise exception 'You need full access to Invoices or Repair Orders to send invoices.';
  end if;
  if inv.status <> 'issued' then raise exception 'This invoice is void.'; end if;
  select * into r from public.repair_orders where id = inv.repair_order_id;
  if public.repair_email_address(r, false) is null then raise exception 'This customer has no email address.'; end if;
  update public.invoices set pdf_path = null, email_pending = true, updated_at = now() where id = inv.id;
end;
$$;

-- The ERP has stored the PDF: record it, and queue the invoice email if one is waiting.
create or replace function public.attach_invoice_pdf(p_invoice uuid, p_path text)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  inv public.invoices;
  r public.repair_orders;
  s public.workshop_notification_settings;
  addr text;
begin
  select * into inv from public.invoices where id = p_invoice and workshop_id = public.my_workshop() for update;
  if inv.id is null then raise exception 'Invoice not found.'; end if;
  if not (public.has_access('invoices', 'full') or public.has_access('repair-orders', 'full')) then
    raise exception 'You need full access to Invoices or Repair Orders to store invoices.';
  end if;
  if p_path is distinct from (inv.workshop_id::text || '/' || inv.id::text || '.pdf') then
    raise exception 'Unexpected file name for this invoice.';
  end if;
  update public.invoices set pdf_path = p_path, email_pending = false, updated_at = now() where id = inv.id;
  if not inv.email_pending or inv.status <> 'issued' then return; end if;

  select * into r from public.repair_orders where id = inv.repair_order_id;
  select * into s from public.workshop_notification_settings where workshop_id = inv.workshop_id;
  addr := public.repair_email_address(r, false);
  insert into public.customer_outbox (workshop_id, repair_order_id, invoice_id, kind, status, to_address, state, last_error, requested_by)
  values (inv.workshop_id, inv.repair_order_id, inv.id, 'invoice', r.status,
          case when coalesce(s.email_invoice, true) then addr end,
          case when coalesce(s.email_invoice, true) and addr is not null then 'pending' else 'skipped' end,
          case when not coalesce(s.email_invoice, true) then 'Invoice emails are off in Settings'
               when addr is null then 'No email address' end,
          auth.uid());
end;
$$;
revoke all on function public.attach_invoice_pdf(uuid, text) from public, anon;
grant execute on function public.attach_invoice_pdf(uuid, text) to authenticated;

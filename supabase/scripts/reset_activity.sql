-- EuroWerken: start fresh by deleting all ACTIVITY data, for every workshop.
-- NOT a migration: run it by hand in the Supabase SQL editor, once, when you mean it.
-- It cannot be undone.
--
-- Deletes: appointments, repair orders (items, approval records, timeline, photos and videos records, messages),
--          staff notifications and their read state, customer alerts, invoices, payments and refunds, inspections,
--          and the customer email queue;
--          resets repair order and invoice numbering (RO-0001, INV-0001).
-- Keeps:   purchase orders and suppliers (inventory history; links to deleted repairs are cleared), imported
--          customers and history, tax and payment settings, inspection templates,
--          workshops, staff accounts and roles, customer accounts and vehicles, website settings,
--          booking settings, business hours, closures and holidays, services, team, parts.
--
-- Photo and video FILES are not removed by SQL (Supabase does not allow deleting storage objects this way).
-- To remove them too: Supabase dashboard > Storage > repair-media (and invoices) > select all > Delete.

begin;

-- Approval records and payments are protected; these settings let this script (and only this transaction) remove them.
set local eurowerken.allow_approval_delete = 'on';
set local eurowerken.allow_activity_delete = 'on';

delete from public.notification_reads;
delete from public.notifications;
delete from public.customer_outbox;
-- Refunds point at the payment they refund, so they go first.
delete from public.payments where refund_of is not null;
delete from public.payments;
delete from public.invoices;
delete from public.customer_notifications;
delete from public.repair_order_messages;
delete from public.repair_order_media;
delete from public.repair_item_approvals;
delete from public.repair_order_events;
delete from public.repair_order_items;
delete from public.repair_orders;
delete from public.appointments;
update public.workshop_counters set last_ro = 0, last_invoice = 0;

commit;

-- Check: every count below should be 0.
select
  (select count(*) from public.appointments) as appointments,
  (select count(*) from public.repair_orders) as repair_orders,
  (select count(*) from public.repair_order_items) as items,
  (select count(*) from public.repair_order_messages) as messages,
  (select count(*) from public.payments) as payments,
  (select count(*) from public.notifications) as notifications;

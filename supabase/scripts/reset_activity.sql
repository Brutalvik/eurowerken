-- EuroWerken: start fresh by deleting all ACTIVITY data, for every workshop.
-- NOT a migration: run it by hand in the Supabase SQL editor, once, when you mean it.
-- It cannot be undone.
--
-- Deletes: appointments, repair orders (items, approval records, timeline, photos and videos records, messages),
--          staff notifications and their read state; resets repair order numbering to RO-0001.
-- Keeps:   workshops, staff accounts and roles, customer accounts and vehicles, website settings,
--          booking settings, business hours, closures and holidays, services, team, parts.
--
-- Photo and video FILES are not removed by SQL (Supabase does not allow deleting storage objects this way).
-- To remove them too: Supabase dashboard > Storage > repair-media > select all > Delete.

begin;

-- Approval records are protected; this setting lets this script remove them.
set local eurowerken.allow_approval_delete = 'on';

delete from public.notification_reads;
delete from public.notifications;
delete from public.repair_order_messages;
delete from public.repair_order_media;
delete from public.repair_item_approvals;
delete from public.repair_order_events;
delete from public.repair_order_items;
delete from public.repair_orders;
delete from public.appointments;
update public.workshop_counters set last_ro = 0;

commit;

-- Check: every count below should be 0.
select
  (select count(*) from public.appointments) as appointments,
  (select count(*) from public.repair_orders) as repair_orders,
  (select count(*) from public.repair_order_items) as items,
  (select count(*) from public.repair_order_messages) as messages,
  (select count(*) from public.notifications) as notifications;

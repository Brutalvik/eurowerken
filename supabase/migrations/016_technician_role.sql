-- EuroWerken: a Technician staff role. Safe to re-run.
-- On its own because Postgres cannot use a new enum value in the same transaction that adds it;
-- 017 sets up its permissions.

alter type public.staff_role add value if not exists 'Technician';

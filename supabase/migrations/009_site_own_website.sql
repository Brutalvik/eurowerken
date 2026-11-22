-- EuroWerken: a workshop that already has its own website can link to it from its customer site.
-- Safe to re-run.

alter table public.workshop_sites
  add column if not exists own_website_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workshop_sites'::regclass and conname = 'workshop_sites_own_website_url_check'
  ) then
    alter table public.workshop_sites
      add constraint workshop_sites_own_website_url_check
      check (own_website_url is null or (own_website_url ~ '^https?://[^\s/$.?#].[^\s]*$' and length(own_website_url) <= 300));
  end if;
end $$;

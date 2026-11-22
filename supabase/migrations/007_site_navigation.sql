-- EuroWerken: each workshop chooses its customer site's navigation. Safe to re-run.
--   tabbar   the liquid-glass tab bar docked at the bottom (default)
--   classic  the full menu in the header

alter table public.workshop_sites
  add column if not exists nav_style text not null default 'tabbar';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workshop_sites'::regclass and conname = 'workshop_sites_nav_style_check'
  ) then
    alter table public.workshop_sites
      add constraint workshop_sites_nav_style_check check (nav_style in ('tabbar', 'classic'));
  end if;
end $$;

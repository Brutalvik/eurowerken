-- EuroWerken: the customer website's design, and "Deploy your website". Safe to re-run.
--
--   workshop_sites.theme               { preset, font, radius, mode } (see packages/shared/src/siteDesign.ts)
--   workshop_sites.sections            the home page's sections in order: [{ id, enabled }]
--   workshop_sites.hero_image_url      the hero's background photo (https), or null for the built-in picture
--   workshop_sites.setup_completed_at  when the shop finished the setup; null means the site was never deployed,
--                                      and the ERP offers "Deploy your website" instead of the settings form
--
-- Sites that are already live count as set up. Editing stays with staff who have Settings (full), through the
-- existing workshop_sites policy and grants. The public reads only published sites, as before.

alter table public.workshop_sites add column if not exists theme jsonb not null default '{}'::jsonb;
alter table public.workshop_sites add column if not exists sections jsonb not null default '[]'::jsonb;
alter table public.workshop_sites add column if not exists hero_image_url text;
alter table public.workshop_sites add column if not exists setup_completed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.workshop_sites'::regclass and conname = 'workshop_sites_theme_check') then
    alter table public.workshop_sites add constraint workshop_sites_theme_check
      check (jsonb_typeof(theme) = 'object' and pg_column_size(theme) < 2000);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.workshop_sites'::regclass and conname = 'workshop_sites_sections_check') then
    alter table public.workshop_sites add constraint workshop_sites_sections_check
      check (jsonb_typeof(sections) = 'array' and jsonb_array_length(sections) <= 30);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.workshop_sites'::regclass and conname = 'workshop_sites_hero_image_url_check') then
    alter table public.workshop_sites add constraint workshop_sites_hero_image_url_check
      check (hero_image_url is null or (hero_image_url ~ '^https://' and length(hero_image_url) <= 500));
  end if;
end $$;

-- Live sites are set up already.
update public.workshop_sites set setup_completed_at = coalesce(setup_completed_at, updated_at, now())
where published and setup_completed_at is null;

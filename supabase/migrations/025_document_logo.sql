-- EuroWerken: the shop's logo on PDF documents (invoices, service history, and quotes when they come). Safe to re-run.
--
--   workshop_sites.document_logo_url   a PNG made in the ERP from the uploaded image, in the public workshop-public
--                                      bucket (<workshop>/documents/...). Empty: documents use the website logo if it is
--                                      a PNG or JPEG, else no logo.
--   workshop_sites.document_show_logo  the shop's switch: logo on documents, or none.
-- Changed in Settings by staff with Settings full (the existing workshop_sites update policy and grants cover it).

alter table public.workshop_sites add column if not exists document_logo_url text;
alter table public.workshop_sites add column if not exists document_show_logo boolean not null default true;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.workshop_sites'::regclass and conname = 'workshop_sites_document_logo_url_check') then
    alter table public.workshop_sites add constraint workshop_sites_document_logo_url_check
      check (document_logo_url is null or (document_logo_url ~ '^https://' and length(document_logo_url) <= 500));
  end if;
end $$;

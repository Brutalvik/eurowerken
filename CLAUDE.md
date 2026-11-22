# EuroWerken

A platform for European auto repair workshops, made by EuroWerken and operated by 2607521 Alberta Inc. One repository (npm workspaces) with:

- `apps/erp`: the staff ERP (port 5174). Branded EuroWerken.
- `apps/customer`: the customer-facing website (port 5175). One app serves every workshop's site at `/<slug>`, in that workshop's own branding, which its Manager edits in the ERP (Settings, Customer website).
- `packages/shared`: code both apps use: workshop site types, branding helpers, legal texts and company details, the Tailwind preset.
- `supabase/migrations`: the shared database (Supabase: auth, Postgres, RLS). Both apps talk to it with the publishable key.

## Commands

```bash
npm install                  # at the repo root, installs every workspace
cp .env.example .env.local   # at the root; both apps read it (envDir)
npm run db:migrate           # apply new supabase/migrations to the database
npm run dev:erp              # http://localhost:5174 (npm run dev does the same)
npm run dev:customer         # http://localhost:5175, then open /<workshop-slug>
npm run typecheck            # all workspaces
npm run build                # all workspaces
```

## Stack

- React 18, TypeScript (strict), Vite, Tailwind CSS v3 with CSS-variable tokens (`dark` class), shared preset in `packages/shared/tailwind-preset.js`
- react-router-dom v6, lucide-react; recharts in the ERP
- Supabase (`@supabase/supabase-js`): email, Google
- Fonts: Poppins (display), Inter (body). Path alias `@/` is each app's `src/`

## Product context

- Backend work follows `docs/backend-plan.md` (phases 1 to 5: catalogue and customer identity, customer accounts, bookings, repair orders, orders and Stripe Connect payments with pay-in-store). Phase 1 is built: services, team and parts are real data (managed in the ERP: Settings > Services and Team, Inventory), with photos in the `workshop-public` storage bucket.
- The customer site is built from the design screenshots: home, services, experts, parts shop, part details, cart and checkout, booking, repair tracking, repair case details, reviews, customer garage. Services, experts and parts read Supabase (`apps/customer/src/api/catalogue.ts`); reviews, repair cases and the garage still use sample data (`apps/customer/src/data/catalog.ts`); flows that need the backend (checkout payment, booking confirmation, estimate approval, messages, reviews, garage accounts) work on the page and show a notice that they are not connected yet. Card fields at checkout are layout only and are never read.
- Data flow: customer books online, appointment lands in the ERP, technician updates repair status, customer sees it live, parts used decrement inventory, invoice is generated, payment is recorded in sales and reports.
- ERP brand name lives in `apps/erp/src/config/brand.ts`. Company name and legal entity live in `packages/shared/src/legal.ts` (`COMPANY`).

## Structure

```
apps/erp/src/
  auth/        rbac.ts, AuthContext (Supabase session, profile, workshop), RequireAuth, RequireAccess
  components/  layout/ (AppLayout, Sidebar, Header), ui/ (Badge, Button, Card, DataTable, KpiCard, PillTabs, SearchInput)
  config/      brand.ts
  data/        types.ts, mock.ts (static mock data, one export per future API resource)
  api/         catalogue.ts (services, team, parts, part costs, image upload)
  lib/         format.ts (CAD), status.ts, supabase.ts, invites.ts
  pages/       one file per module; auth/ (login, register, onboarding, invite, reset, setup), users/, settings/ (WebsiteCard, ServicesCard, TeamCard),
               inventory/ (PartForm, Dialog, ConfirmDialog), legal/ (Terms, Privacy)
  theme/       ThemeProvider, chartPalette (hex per mode for recharts)
apps/customer/src/
  site/        SiteContext: loads the published workshop_sites row for /:slug, applies the workshop's colour to --accent and --accent-fg
  cart/        CartContext: cart per site in localStorage, synced across tabs
  components/  layout/ (SiteLayout, SiteHeader, SiteFooter, nav), ui/ (PageHero, Breadcrumbs, Stars, Pill, StepCard, QuantityStepper, DemoNotice), Photo, Wordmark
  api/         catalogue.ts (services, team, parts hooks, cached per workshop)
  data/        catalog.ts (sample reviews, repair cases, garage, vehicle lists until later phases), landing.ts
  lib/         supabase.ts, format.ts (CAD)
  pages/       HomePage, ServicesPage, ExpertsPage, parts/ (shop, details), CartPage, BookPage, track/ (lookup, case details),
               ReviewsPage, GaragePage, LegalPage, RootPage (/), SiteNotFound; page-local helpers in folders next to them
apps/customer/public/images/   drop-in photos; README lists the file names
packages/shared/src/   site.ts, brand.ts, legal.ts
supabase/migrations/   001 profiles, 002 registration and role_permissions, 003 workshops and invites, 004 workshop_sites,
                       005 customers, services, team, parts, part_costs, workshop-public bucket
docs/backend-plan.md   phased plan for accounts, bookings, repairs, orders, Stripe
scripts/db-migrate.sh  applies unapplied migrations with psql
```

## Customer site and branding

- `public.workshop_sites` (one per workshop, created with it): slug, display name, tagline, hero headline and highlighted word, intro, logo URL, brand colour, contact, hours, social links, published. Signed-out visitors read only published sites; only full Settings access in that workshop edits it.
- The customer app sets `--accent` from the brand colour (lifted in dark mode) and `--accent-fg` to white or near-black, whichever reads better on it. Text on `bg-accent` is `text-accent-fg`, never `text-white`. Never use the workshop's hex directly. `--ink` is the dark button and heading colour and flips in dark mode.
- Glass: `.glass`, `.glass-strong` (cards, floating badges, sticky summaries on light areas) and `.glass-dark` (on dark bands) in `apps/customer/src/index.css`. Use lightly.
- Light by default, with a dark toggle. Desktop menu from 1280 px (`xl`); a full-screen menu below.
- Photos: `<Photo name="..." />` loads `public/images/<name>.jpg` or `.png` and falls back to a styled placeholder. Per-workshop uploads (Supabase Storage) come later.
- `VITE_DEFAULT_SITE_SLUG` sends the bare address to one workshop (single-workshop deployment). Custom domains per workshop are a later step.

## Legal

- Terms and Conditions and Privacy Policy texts are in `packages/shared/src/legal.ts`, shown at `/terms` and `/privacy` in the ERP (public, also linked from sign-in, register and the sidebar), and at `/terms`, `/privacy` and `/<slug>/terms`, `/<slug>/privacy` on the customer site (footer).
- Every app shows "EuroWerken is operated by 2607521 Alberta Inc." (`MADE_BY_NOTICE`). Use `endSentence()` when a sentence ends with the legal name, which already ends in a full stop.
- The texts are drafts (`LEGAL_DRAFT = true` shows a notice). Before launch: lawyer review (Alberta PIPA, PIPEDA), fill in `COMPANY.contactEmail`, set `LEGAL_DRAFT` to false.

## Conventions

- Colors come from Tailwind token classes (`bg-surface`, `text-fg`, `border-line`, `text-accent`, `text-ok`, `text-bad`, `text-warn`, `text-violet`). Never hardcode hex in components. Both themes must work for every new component.
- Recharts cannot read CSS variables reliably. Chart colors come from `chartPalette(mode)`. If you change a token in `index.css`, update `chartPalette.ts` too.
- Customer site: tokens are the same names; also `bg-ink`/`text-ink` and the `.btn-ink`, `.btn-outline`, `.container-site`, `.eyebrow` classes in `apps/customer/src/index.css`.
- Tables use `DataTable` with a typed `Column<T>[]`. Status-to-color mapping goes in `lib/status.ts`, not inline.
- Permissions: use `useAuth().can(module, 'view' | 'full')` to show or hide actions. Navigation hides modules with `none` access, and `RequireAccess` blocks direct URL access.
- The RBAC matrix in `src/auth/rbac.ts` is a UI mirror only. The backend must enforce the same rules; never rely on the client.
- No emoji in UI copy or code comments. Currency is CAD via `lib/format.ts`.
- Commits: conventional commits.

## RBAC matrix

| Module | Manager | Service Advisor | Parts Staff | Accountant |
|---|---|---|---|---|
| Dashboard | full | view | view | view |
| Parts Inventory | full | none | full | view |
| Repair Orders | full | full | view | view |
| Customers (read-only list) | full | full | view | view |
| Sales | full | view | view | full |
| Invoices | full | full | none | full |
| Reports | full | none | none | full |
| Users & Roles | full | none | none | none |
| Settings | full | none | none | none |

## Responsive design and future apps

Every screen must work at phone, tablet and desktop widths. Check each new page at 375, 768 and 1280 px.

| Width | Navigation | Tables | Layout |
|---|---|---|---|
| Phone, under 768 (`< md`) | Slide-out drawer from the header menu button | Cards | Single column, KPI tiles two across, filter tabs scroll sideways |
| Tablet, 768 to 1023 (`md`) | Icon rail, labels as tooltips and for screen readers | Cards for tables of 7+ columns, table otherwise | Two-column grids |
| Desktop, 1024 and up (`lg`) | Full sidebar | Table | Full grids |

- Tables: `DataTable` turns rows into cards below `md` (below `lg` for 7+ columns, override with `cardsBelow`). Give each column a `mobile` slot: `title`, `corner` (status, total), `footer` (actions), `hide`, or unset (label and value).
- Touch: the `coarse:` Tailwind variant targets touch screens (phones and tablets of any width). Buttons, inputs and selects are at least 40 to 44 px tall there. Touch-screen fields are 16 px so iOS does not zoom on focus.
- Use `h-[100dvh]`, not `h-screen`. The `pt-safe`, `pb-safe` and `pl-safe` utilities keep content clear of notches; `viewport-fit=cover` is set in `index.html`.
- The app installs to a home screen (`public/manifest.webmanifest`, standalone, any orientation), which covers the workshop tablet use for now.

### Room for the planned apps

- Planned: a customer mobile app (track repairs, approve estimates, pay) and a workshop tablet or technician app (assigned jobs, status, inspection photos). The customer web app lives in its own repo.
- Keep logic and data access out of components. When data moves off `data/mock.ts`, put typed calls in `src/api/` and shared types in `src/data/types.ts`, so both can move into a shared package that a React Native (Expo) app imports.
- Likely monorepo later: `apps/erp-web`, `apps/customer-web`, `apps/customer-mobile`, `apps/workshop-tablet`, `packages/api-client`, `packages/types`, `packages/design-tokens` (the colour tokens in `index.css` and `chartPalette.ts` become the single source).
- Backend: the architecture diagram shows a shared Node/Express API. Today Supabase provides auth, Postgres and RLS directly. Plan: Supabase stays the system of record (auth, database, storage); the Node API (or Supabase Edge Functions) handles workflows such as invoicing, purchase orders, payments and notifications, verifying the Supabase session token. Web and mobile clients all use the same sign-in and the same API.
- Open decisions: customers were planned on MSAL (Azure AD) while staff are on Supabase Auth (Supabase can add Azure as a provider, so one system is possible). The diagram says the ERP is dark only; the app keeps the light and dark toggle.

## Workshops, authentication and access control

- Multi-workshop (multi-tenant) on one Supabase database. `public.workshops` has a public 6-digit `number`. Each account belongs to at most one workshop (`profiles.workshop_id`). Workshops are walled off by RLS: every workshop-owned table carries `workshop_id` and its policies check `workshop_id = public.my_workshop()`.
- Supabase Auth: email and password, and Google. Ways into a workshop:
  - Register and create a workshop: you become its Manager (the default permission matrix is seeded for it).
  - Register with an existing workshop number: you join with no role ("Waiting for approval") until someone with full Users & Roles access assigns one. You can cancel the request.
  - Invite link `/invite/<token>`: made on the Users & Roles page for one email and a preset role; single use, 7 days. Joins with that role, no approval. Links are not emailed; the manager copies and sends them.
  - Google sign-ups (and anyone not in a workshop) land on `/onboarding` to join or create. A pending invite token is kept in localStorage across sign-up, email confirmation and the Google redirect.
- Email sign-up passes `workshop_action` (`create` or `join`) and its value in the auth metadata; the `handle_new_user` trigger applies it.
- Membership only changes through the functions `create_workshop`, `request_join`, `cancel_join_request`, `accept_invite` (they set a transaction flag the profile trigger checks). Public functions: `invite_preview(token)` and `workshop_number_exists(number)`.
- Permissions live in `public.role_permissions` per workshop (workshop x role x module, none/view/full), seeded from the defaults in `src/auth/rbac.ts`. AuthContext loads the user's workshop matrix; `rbac.ts` ACCESS is only the fallback. Managers edit it on the Users & Roles page; the Manager role is fixed at full.
- Database enforcement: `public.has_access(module, level)` checks the caller's role in the caller's workshop. Every new workshop-owned table must have `workshop_id uuid not null references workshops`, enable RLS, and use both, for example `using (workshop_id = public.my_workshop() and public.has_access('inventory', 'view'))` for select and `'full'` for writes.
- Profile rules: only users with Users & Roles full access change role, active, email or department, and only within their workshop; nobody changes their own role or status; only a Manager grants or removes the Manager role or invites a Manager.
- Migrations: `supabase/migrations/*.sql`. `npm run db:migrate` applies the ones not yet recorded in `eurowerken_meta.migrations` (needs `DATABASE_URL` in `.env.local` and `psql`). Never re-run an old migration by hand: later ones replace its functions and policies.
- Keys: the browser uses only the publishable key (`VITE_SUPABASE_PUBLISHABLE_KEY`). Never put the secret key (`sb_secret_...`) in the frontend or the repo. `DATABASE_URL` is read by the migration script only; Vite never exposes non-`VITE_` variables.
- Supabase dashboard setup:
  - Authentication, URL Configuration: Site URL = app URL; Redirect URLs include `http://localhost:5174/**` and the production URL.
  - Authentication, Providers, Google: enable with a Google Cloud OAuth client (Web application) whose authorised redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`.
- Without `.env.local` the app shows a setup screen instead of failing.

## Current state

Real registration and sign-in through Supabase (email and Google), multiple workshops with per-workshop RBAC, join by number with approval, and invite links. The Users and Roles page shows the workshop number, creates and revokes invites, lists the team (awaiting approval first), assigns roles, deactivates accounts, and lets Managers edit the permission matrix. Every other module still uses mock data: Dashboard, Inventory, Repair Orders, Sales, Invoices, Reports, Settings. Action buttons (Add part, New invoice, and so on) render but are not wired to anything.

## Next steps

1. Purchase Orders module: raise POs to suppliers, receive stock, increment inventory on delivery. Add `purchase-orders` to `ModuleId`, the RBAC matrix (Manager full, Parts Staff full, Accountant view, Service Advisor none), nav icons, and routes.
2. Invoice detail page and PDF generation: preview, email, download.
3. POS quick sale flow for walk-in parts purchases.
4. Part detail page (history, reorder) and add/edit part forms.
5. Repair order detail page linked to customer bookings and tracking IDs.
6. Notifications centre: low stock, overdue invoices, repair status changes.
7. Profile page to change your own name and password; workshop rename in Settings; email the invite link and notify managers of join requests (needs SMTP or an Edge Function).
8. Every business table (parts, repair orders, invoices, ...) gets `workshop_id` and RLS with `has_access` when it moves off mock data.
9. API client layer in `src/api/`, replace `data/mock.ts` imports with data fetching (TanStack Query recommended), add loading and error states.
10. Settings persistence, tax and invoice numbering.

## Roadmap

- Supplier management (contacts, pricing, lead times) and automatic reorder triggers at minimum stock.
- Technician scheduling calendar and labour time tracking per repair order.
- Digital vehicle inspection forms (photos and condition ratings) shared with the customer app.
- Accounting export (QuickBooks, Xero), email and SMS notifications, Stripe payment links on invoices.
- Reporting: forecasting, parts demand, margin per job type.
- Mobile views or app for technicians (assigned jobs, status updates, inspection photos).

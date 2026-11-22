# EuroWerken ERP

Internal staff platform for an auto repair workshop (European specialist, services all makes). Separate app from the customer-facing EuroWerken site, same design language, talks to the same shared backend (not yet built).

## Commands

```bash
npm install
cp .env.example .env.local   # then fill in the Supabase URL, publishable key, DATABASE_URL
npm run db:migrate           # apply supabase/migrations to the database
npm run dev        # http://localhost:5174
npm run typecheck
npm run build      # typecheck + production build
```

## Stack

- React 18, TypeScript (strict), Vite
- Tailwind CSS v3 with CSS-variable design tokens, `dark` class strategy
- react-router-dom v6, recharts, lucide-react
- Supabase Auth (`@supabase/supabase-js`), email and password
- Fonts: Poppins (display), Inter (body)
- Path alias: `@/` maps to `src/`

## Product context

- Customer app (already built, separate repo): landing, services, experts, parts shop, cart and checkout, booking, repair tracking, case details, reviews. React, Tailwind, shadcn/ui, MSAL.
- This ERP and the customer app share one backend (planned: Node/Express, PostgreSQL, Prisma, Azure). Data flow: customer books online, appointment lands in the ERP, technician updates repair status, customer sees it live, parts used decrement inventory, invoice is generated, payment is recorded in sales and reports.
- Brand name lives in `src/config/brand.ts`. Change it there only.

## Structure

```
src/
  auth/        rbac.ts (role/module matrix), AuthContext (Supabase session + profile role),
               RequireAuth (signed-in guard), RequireAccess (per-module guard)
  components/
    layout/    AppLayout, Sidebar, Header
    ui/        Badge, Button, Card, DataTable, KpiCard, PillTabs, SearchInput
  config/      brand.ts
  data/        types.ts, mock.ts (static mock data, one export per future API resource)
  lib/         format.ts (CAD currency), status.ts (status to badge tone maps), supabase.ts (client)
  pages/       one file per module; pages/auth/ holds login, register, onboarding, invite, reset password and setup screens; pages/users/ holds Users page parts
supabase/
  migrations/  001 profiles and roles, 002 registration and role_permissions, 003 workshops and invites
scripts/
  db-migrate.sh  applies the migrations with psql
  theme/       ThemeProvider (light/dark, persisted), chartPalette (hex values per mode for recharts)
```

## Conventions

- Colors come from Tailwind token classes (`bg-surface`, `text-fg`, `border-line`, `text-accent`, `text-ok`, `text-bad`, `text-warn`, `text-violet`). Never hardcode hex in components. Both themes must work for every new component.
- Recharts cannot read CSS variables reliably. Chart colors come from `chartPalette(mode)`. If you change a token in `index.css`, update `chartPalette.ts` too.
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

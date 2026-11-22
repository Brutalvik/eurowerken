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
  pages/       one file per module; pages/auth/ holds login, register, reset password and setup screens
supabase/
  migrations/  001 profiles and roles, 002 registration and role_permissions (RBAC); all re-runnable
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

## Authentication and access control

- Supabase Auth: email and password, and Google. Anyone can register at `/register` (or "Continue with Google" on `/login`). Email sign-ups must confirm their address first (Supabase "Confirm email" is on).
- Each account has a row in `public.profiles` (created by a trigger, with name and picture from Google when available). A new account has no role: it can sign in but sees a "Waiting for approval" screen until someone with full Users & Roles access assigns a role.
- Bootstrap: while there is no active Manager, the next account created becomes Manager. Register yourself first.
- Permissions live in `public.role_permissions` (role x module x none/view/full), seeded with the defaults in `src/auth/rbac.ts`. AuthContext loads it after sign-in; `rbac.ts` ACCESS is only the fallback. Managers edit it on the Users & Roles page; the Manager role itself is fixed at full.
- Database enforcement: `public.has_access(module, level)` for RLS policies. Every new table must enable RLS and use it, for example `using (public.has_access('inventory', 'view'))` for select and `'full'` for writes.
- Profile rules (trigger + RLS): only users with Users & Roles full access change role, active, email or department; nobody changes their own role or status; only a Manager grants or removes the Manager role.
- Migrations: `supabase/migrations/*.sql`, all re-runnable. Apply with `npm run db:migrate` (needs `DATABASE_URL` in `.env.local` and `psql`).
- Keys: the browser uses only the publishable key (`VITE_SUPABASE_PUBLISHABLE_KEY`). Never put the secret key (`sb_secret_...`) in the frontend or the repo. `DATABASE_URL` is read by the migration script only; Vite never exposes non-`VITE_` variables.
- Supabase dashboard setup:
  - Authentication, URL Configuration: Site URL = app URL; Redirect URLs include `http://localhost:5174/**` and the production URL.
  - Authentication, Providers, Google: enable with a Google Cloud OAuth client (Web application) whose authorised redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`.
- Without `.env.local` the app shows a setup screen instead of failing.

## Current state

Real registration and sign-in through Supabase (email and Google), with database-backed RBAC. The Users and Roles page lists real accounts (awaiting approval first), assigns roles, deactivates accounts, and lets Managers edit the permission matrix. Every other module still uses mock data: Dashboard, Inventory, Repair Orders, Sales, Invoices, Reports, Settings. Action buttons (Add part, New invoice, and so on) render but are not wired to anything.

## Next steps

1. Purchase Orders module: raise POs to suppliers, receive stock, increment inventory on delivery. Add `purchase-orders` to `ModuleId`, the RBAC matrix (Manager full, Parts Staff full, Accountant view, Service Advisor none), nav icons, and routes.
2. Invoice detail page and PDF generation: preview, email, download.
3. POS quick sale flow for walk-in parts purchases.
4. Part detail page (history, reorder) and add/edit part forms.
5. Repair order detail page linked to customer bookings and tracking IDs.
6. Notifications centre: low stock, overdue invoices, repair status changes.
7. Profile page to change your own name and password; email notification to managers when someone registers.
8. API client layer in `src/api/`, replace `data/mock.ts` imports with data fetching (TanStack Query recommended), add loading and error states.
9. Settings persistence, tax and invoice numbering.

## Roadmap

- Supplier management (contacts, pricing, lead times) and automatic reorder triggers at minimum stock.
- Technician scheduling calendar and labour time tracking per repair order.
- Digital vehicle inspection forms (photos and condition ratings) shared with the customer app.
- Accounting export (QuickBooks, Xero), email and SMS notifications, Stripe payment links on invoices.
- Reporting: forecasting, parts demand, margin per job type.
- Mobile views or app for technicians (assigned jobs, status updates, inspection photos).

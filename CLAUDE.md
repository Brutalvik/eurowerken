# EuroWerken ERP

Internal staff platform for an auto repair workshop (European specialist, services all makes). Separate app from the customer-facing EuroWerken site, same design language, talks to the same shared backend (not yet built).

## Commands

```bash
npm install
cp .env.example .env.local   # then fill in the Supabase URL and anon key
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
  pages/       one file per module; pages/auth/ holds login, reset password and setup screens
supabase/
  schema.sql   profiles table, staff_role enum, triggers, row level security (run in the SQL editor)
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

## Authentication

- Supabase Auth, email and password. No public sign-up: staff are added from the Supabase dashboard (Authentication, Users, Add user, with a temporary password or Invite user). To set or change a password, staff use "Forgot your password?" on the sign-in page; the reset email links to `/reset-password`.
- Each account has a row in `public.profiles` (created by a trigger). The role lives there and starts as null; a Manager assigns it on the Users and Roles page. A user with no role, or a deactivated one, can sign in but sees no modules.
- Only Managers can change role, active, email or department (enforced by RLS and a trigger in `supabase/schema.sql`). Managers cannot change their own role or status. Staff read only their own profile; Managers read all.
- First Manager: create your account in the Supabase dashboard, then run the `update public.profiles set role = 'Manager'` snippet at the bottom of `schema.sql`.
- Supabase dashboard settings: Authentication, URL Configuration: set Site URL to the app URL and add `http://localhost:5174/reset-password` (and the production equivalent) to Redirect URLs. Turn off "Allow new users to sign up".
- Only the anon key belongs in the frontend. Never the service_role key.
- Without `.env.local` the app shows a setup screen instead of failing.

## Current state

Real sign-in through Supabase; the Users and Roles team list reads `profiles` and lets Managers change roles and deactivate accounts. Every other module still uses mock data: Dashboard, Inventory, Repair Orders, Sales, Invoices, Reports, Settings. Action buttons (Add part, New invoice, Invite member, and so on) render but are not wired to anything.

## Next steps

1. Purchase Orders module: raise POs to suppliers, receive stock, increment inventory on delivery. Add `purchase-orders` to `ModuleId`, the RBAC matrix (Manager full, Parts Staff full, Accountant view, Service Advisor none), nav icons, and routes.
2. Invoice detail page and PDF generation: preview, email, download.
3. POS quick sale flow for walk-in parts purchases.
4. Part detail page (history, reorder) and add/edit part forms.
5. Repair order detail page linked to customer bookings and tracking IDs.
6. Notifications centre: low stock, overdue invoices, repair status changes.
7. In-app staff invites (needs a server-side function with the service role key, for example a Supabase Edge Function), and a profile page to change your own name and password.
8. API client layer in `src/api/`, replace `data/mock.ts` imports with data fetching (TanStack Query recommended), add loading and error states.
9. Settings persistence, tax and invoice numbering.

## Roadmap

- Supplier management (contacts, pricing, lead times) and automatic reorder triggers at minimum stock.
- Technician scheduling calendar and labour time tracking per repair order.
- Digital vehicle inspection forms (photos and condition ratings) shared with the customer app.
- Accounting export (QuickBooks, Xero), email and SMS notifications, Stripe payment links on invoices.
- Reporting: forecasting, parts demand, margin per job type.
- Mobile views or app for technicians (assigned jobs, status updates, inspection photos).

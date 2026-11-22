# Backend plan: accounts, bookings, repairs, orders, payments

Decisions (November 22, 2026):

- **Stripe Connect.** Each workshop connects its own Stripe account (Express) from the ERP. Customers pay the workshop directly. EuroWerken takes a platform fee as a percentage (`application_fee_amount`), stored in `platform_settings` and overridable per workshop. **The percentage is still to be decided.**
- **Pay in store.** At checkout and on invoices the customer can choose "Pay at the workshop". Staff record the payment in the ERP (cash, debit, credit card on the shop's own terminal, e-transfer, cheque). Stripe is not involved, and EuroWerken takes no fee on these.
- **Server code: Supabase Edge Functions** (Deno) for anything that needs a secret: Stripe, webhooks and emails. Secrets live in Supabase function secrets, never in the frontend or the repo.
- **One customer login across workshops.** `customer_accounts` is global (one per auth user). `workshop_customers` links a customer to each workshop they deal with, and each workshop sees only its own customers' records. Staff and customer accounts are separate; one person can have both.
- **Isolation:** every workshop-owned row has `workshop_id`, and RLS uses `my_workshop()` and `has_access()` for staff, and `auth.uid()` ownership for customers.

## Phase 1: catalogue, team, parts, photos, customer identity (this round)

- `customer_accounts`, `workshop_customers`, `customer_vehicles`, and the `ensure_customer_account()` function.
- `services` (per workshop, public when active and the site is published).
- `team_members` (public technician profiles, optionally linked to a staff profile).
- `parts` (public catalogue) and `part_costs` (staff-only unit cost, kept in a separate table because RLS cannot hide columns).
- Storage bucket `workshop-public` (logos, service, team and part photos), written only by that workshop's staff.
- ERP: manage services, team and parts with photo upload. Inventory moves off mock data.
- Customer site: services, experts and parts read real data, with an empty state when a workshop has none.

## Phase 2: customer accounts on the customer site

- Sign up and sign in (email, Google) on the customer site, plus a password reset.
- The Garage works on real data: vehicles, history and reminders.
- In the ERP, a Customers list for each workshop.

## Phase 3: real bookings

- `appointments` (customer, vehicle, services, slot, technician, notes, status).
- Booking availability from the workshop's opening hours and existing appointments.
- In the ERP: an appointments list and calendar, plus confirm, reschedule and cancel, and "convert to repair order".
- Email confirmation through an Edge Function.

## Phase 4: real repair orders and tracking

- `repair_orders`, `repair_order_items` (needs-approval workflow), `repair_events` (timeline), `repair_notes`, `repair_media` (private bucket, signed URLs) and `repair_messages` (Realtime).
- In the ERP: Repair Orders on real data, with status updates, notes, photos and video, line items and messaging.
- Customer side: tracking by ID and contact via a server-checked function, the case page, approve and decline, and messages.

## Phase 5: orders, invoices and payments

- `orders` and `order_items` (parts shop), `invoices` and `invoice_items`, and `payments` (method: stripe or in_store with a sub-type; status; amounts; fee).
- **Stripe Connect onboarding** in ERP Settings, with Edge Functions `stripe-connect-account` and `stripe-account-link`.
- **Checkout:** Edge Function `stripe-create-payment` creates a PaymentIntent on the connected account with the platform fee. The customer site uses Stripe Elements. Card data never touches our code.
- **Webhook:** Edge Function `stripe-webhook` verifies the signature, marks payments and invoices paid, and is idempotent.
- **Pay in store:** the order or invoice is marked "awaiting payment at workshop", and staff record the payment in the ERP.
- Stock is decremented when an order is paid or picked up. Sales and Reports move to real data.

## Open items

- The platform fee percentage.
- Stripe account for 2607521 Alberta Inc. (platform), and test-mode keys to start.
- Email provider for confirmations (for example Resend or SendGrid).

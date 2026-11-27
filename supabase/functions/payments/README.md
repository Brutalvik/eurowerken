# payments: card payments and refunds through Helcim

Customers pay invoices by card on the customer site (**Pay now**), and staff take card payments and refunds from the
repair order's Invoice card in the ERP. Cards are typed only into Helcim's own payment window (HelcimPay.js): card
numbers never touch EuroWerken's apps, database or this function.

How one payment works:

1. The browser asks this function to **start** a payment for an invoice. The database works out the amount (the
   invoice balance; staff may choose a smaller amount). The function asks Helcim for a checkout session with the
   shop's API token and keeps Helcim's secret token in the database. The browser gets only the checkout token.
2. The browser opens Helcim's window. The customer pays there.
3. The browser sends Helcim's answer back (**confirm**). The function checks Helcim's signature (a SHA-256 hash made
   with the secret token), reads the transaction again from Helcim (approved, purchase, CAD, exactly this amount) and
   records it once. The same transaction can never be recorded twice.

Refunds of card payments go back to the card through Helcim. Cash, cheque, e-transfer, debit and terminal payments are
recorded and refunded by hand in the ERP (no Helcim involved).

## 1. Run the migration

Run `supabase/migrations/030_payments.sql` in the Supabase SQL editor (or `npm run db:migrate`). It needs Supabase
Vault, which every Supabase project has (Database > Vault). The Helcim token is stored only there.

## 2. Deploy the function

The function checks every caller itself (staff and customers by their Supabase session; guests by tracking code plus
email or phone; confirmations by Helcim's signature), so it is deployed **without** Supabase's JWT gate. That is
required for guests, and for projects that use the new publishable keys (`sb_publishable_...`), which are not JWTs.

**Option A: dashboard.** Edge Functions > Deploy a new function > Via Editor, name it exactly `payments`, paste
`index.ts`, deploy. Then open the function's settings and turn **off** "Verify JWT with legacy secret" (Enforce JWT
verification).

**Option B: CLI.**
```
supabase functions deploy payments --no-verify-jwt --project-ref <your project ref>
```

## 3. Secrets

Supabase dashboard > Edge Functions > Secrets:

- `ALLOWED_ORIGINS` (required): the addresses of the ERP and the customer site, comma separated, exactly as the browser
  shows them (scheme, host and port, no path), for example
  `https://erp.example.com,https://book.example.com,http://localhost:5174,http://localhost:5175`.
  Requests from any other website are refused.
- `HELCIM_API_BASE` (optional): defaults to `https://api.helcim.com/v2`. Leave it unset unless Helcim tells you
  otherwise.

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` are provided by Supabase. No Helcim token goes in
the secrets: each shop pastes its own in the ERP.

## 4. Each shop connects its Helcim account

In Helcim: **All Tools > Integrations > API Access Configurations > New API Access**
(https://devdocs.helcim.com/docs/authentication-with-the-helcim-api-and-helcimpayjs).

- Name it, for example, "EuroWerken".
- Tick the **checkout integration** (HelcimPay.js) box and enter the addresses where the payment window opens: the
  ERP and the customer site, the same as `ALLOWED_ORIGINS`.
- Access restrictions: **Transaction Processing: Admin** (Admin is needed for refunds and reversals; Positive
  Transaction would allow payments only, and then Refund to card fails). General and Settings can stay at
  **No access**. If Helcim refuses to read transactions with that, set General to **Read**.
- Create it and copy the API token.

In the ERP: **Settings > Payments**, paste the token, press **Connect**, then **Test connection**. The token is stored
in Supabase Vault and never shown again (only its last 4 characters). **Disconnect** deletes it.

## 5. Test mode

Helcim test payments need a Helcim **developer test account** (ask Helcim support,
https://devdocs.helcim.com/docs/developer-testing). Use that account's API token in Settings > Payments, and pay with
Helcim's test card numbers (https://devdocs.helcim.com/docs/test-credit-card-numbers). Test cards are declined on a
live account. When you go live, disconnect and paste the live account's token.

## What happens when something goes wrong

- The customer closes the tab right after paying, so the browser never confirms: the browser keeps Helcim's answer
  and confirms when the page is opened again. Staff can also record it in the ERP from the Helcim transaction number
  (**Card paid but not showing?** on the Invoice card); it must be an approved CAD purchase of exactly the amount of a
  payment started for that invoice.
- A refund where Helcim's answer was lost stays **Processing**. Press **Refund to card** again with the same amount:
  the same idempotency key is sent, so Helcim never refunds twice.
- Helcim refunds only transactions in a closed batch (usually overnight). Until then the function reverses the whole
  payment instead; a partial refund has to wait for the batch to close.
- A card payment approved after the balance went down (for example cash was recorded meanwhile) is still recorded:
  the invoice then shows a credit to refund.

Never logged: API tokens, checkout or secret tokens, card data, customer contact details.

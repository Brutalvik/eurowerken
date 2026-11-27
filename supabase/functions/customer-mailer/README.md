# customer-mailer: automatic customer emails, invoice PDFs and purchase orders to suppliers

The database queues a message in `customer_outbox` for every repair status change. At **Ready for pickup** it
creates the invoice; the ERP then makes the invoice PDF, stores it in the private `invoices` bucket and queues the
invoice email. This Edge Function sends the queue through your shop's email account (SMTP, with nodemailer),
attaching the stored PDF to invoice emails.

It also sends **purchase orders to suppliers** (migration 031): when someone presses **Email to supplier** on a
purchase order, the ERP makes the PO PDF, stores it in the private `documents` bucket
(`<workshop id>/po/<po id>.pdf`) and queues a job in `supplier_outbox` (kind `purchase_order`). The function emails
the supplier from the shop's account, with the shop's name, the PO number, the lines, the notes and the date needed,
and the PDF attached. Replies go to the shop's email address (Settings > Website > contact email). A job for an order
that was cancelled before it went out is skipped.

Until these steps are done, nothing is lost: messages wait in the queue, and the ERP shows them as "Waiting to send".

## 1. Run the migrations

In the Supabase SQL editor, run `supabase/migrations/023_customer_emails_invoices.sql`, then
`supabase/migrations/024_invoice_privacy_and_pdf.sql`. For purchase orders also run
`supabase/migrations/031_purchasing.sql` (the function keeps sending customer emails without it).

## 2. Get your email account's SMTP settings

Use the mailbox the shop sends from. Common settings:

| Provider | SMTP_HOST | SMTP_PORT | SMTP_USER | SMTP_PASS |
| --- | --- | --- | --- | --- |
| Gmail / Google Workspace | smtp.gmail.com | 465 | the full address | an **App Password** (Google Account > Security > App passwords; needs 2-step verification) |
| Microsoft 365 / Outlook | smtp.office365.com | 587 | the full address | the mailbox password (SMTP AUTH must be allowed for the mailbox) |
| Zoho Mail | smtp.zoho.com | 465 | the full address | the password or an app password |

Port 25 is blocked on Supabase. Use 465 or 587.

## 3. Deploy the function

**Option A: in the dashboard (no tools needed)**
1. Supabase dashboard > **Edge Functions** > **Deploy a new function** > **Via Editor**.
2. Name it `customer-mailer`.
3. Create two files with exactly these names, and paste in the contents of the files in this folder:
   `index.ts` and `content.ts`.
4. Press **Deploy**.

If the editor only lets you have one file: paste `content.ts` at the top of `index.ts`, then delete the lines
of `index.ts` that import from `'./content.ts'`.

The function name must be exactly `customer-mailer` (lowercase, with the hyphen).

**Option B: with the Supabase CLI**
```
brew install supabase/tap/supabase
supabase login
supabase functions deploy customer-mailer --project-ref <your project ref>
```

## 4. Add the secrets

Supabase dashboard > **Edge Functions** > **Secrets** (or **Manage secrets**). Add these names and values:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`: from step 2.
- `SMTP_FROM` (optional): the address to send from, if it differs from `SMTP_USER`.
- `CUSTOMER_SITE_URL` (optional but recommended): your customer website's address, for example
  `https://book.yourdomain.com`. Emails then include a "Track your repair" button.

Never put these values in the code, the repo, or the frontend.

## 5. Connect the queue to the function

Supabase dashboard > **Database** > **Webhooks** > **Create a new hook**:
- Name: `customer-mailer`
- Table: `customer_outbox`
- Events: **Insert** only
- Type: **Supabase Edge Functions**, function `customer-mailer`, method POST
- Turn on **Add auth header with service key**, if it is offered.

For purchase orders, create a second hook the same way: name `supplier-mailer`, table `supplier_outbox`, events
**Insert** only, function `customer-mailer`. (One function serves both queues; each run sends whatever is waiting in
either.)

## 6. (Recommended) Retry every 5 minutes

A message that fails (for example the mail server is briefly down) is retried the next time the function runs.
Run it on a schedule as well: dashboard > **Integrations** > **Cron** > create a job every 5 minutes that invokes
the Edge Function `customer-mailer`. After 5 failed attempts a message is marked **Failed** in the ERP.

## 7. Try it

Mark a repair order **Ready for pickup** in the ERP. Within a few seconds:
- the repair order's **Customer emails** list shows the invoice email as **Sent**;
- the **Invoice** card's **PDF** button opens the invoice;
- the customer receives the email with the PDF attached.

To try a purchase order: add a supplier with an email address under **Purchasing > Suppliers**, create an order,
add a line and press **Email to supplier**. The order's **Emails** list shows **Sent** within a few seconds.

## Text messages (SMS)

Not connected yet. The ERP shows the switch turned off. Adding a provider (for example Twilio) later only needs
a sender for `channel = 'sms'` in this function.

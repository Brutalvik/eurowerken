import { useId, useState } from 'react';
import { BellOff, MessageSquareText } from 'lucide-react';
import { useCustomerEmailSettings } from '@/api/invoices';
import { useMessageMutes } from '@/api/messageMutes';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { CheckRow, ErrorNote } from '../inventory/PartForm';

/**
 * Settings, Notifications: mute customer message notifications for everyone, the list of muted customers, and
 * the emails the shop sends its customers (progress steps and the invoice).
 */
export function NotificationsCard() {
  return (
    <div className="space-y-4">
      <MutesCard />
      <CustomerEmailsCard />
    </div>
  );
}

function MutesCard() {
  const id = useId();
  const { can } = useAuth();
  const mutes = useMessageMutes();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const canAll = can('settings', 'full');
  const canOne = can('repair-orders', 'full') || can('customers', 'full');
  const state = mutes.state;
  const emails = state ? [...state.emails].sort() : [];

  return (
    <Card className="p-4 md:p-5">
      <CardHeader
        title="Notifications"
        subtitle="What the bell tells your team about. Muting only stops the notification: messages still arrive in the repair order. Approvals and bookings always notify."
      />
      {mutes.error && <ErrorNote errors={mutes.error} />}
      {!state && !mutes.error && <p className="text-xs text-fg2">Loading...</p>}
      {state && (
        <div className="space-y-4">
          {canAll ? (
            <CheckRow
              id={`${id}-all`}
              label="Notify the team when a customer sends a message"
              hint={
                state.all
                  ? 'Off: no customer message makes a notification. Check the Messages card of each repair order.'
                  : 'On: each customer message shows in the bell, except from customers muted below.'
              }
              checked={!state.all}
              onChange={async (on) => {
                setBusy('all');
                setError(null);
                setError(await mutes.toggleAll(!on));
                setBusy(null);
              }}
            />
          ) : (
            <p className="rounded-lg border border-line bg-surface2 p-3 text-xs text-fg2">
              Customer message notifications are <strong className="text-fg">{state.all ? 'off' : 'on'}</strong> for this shop. Only staff
              with full access to Settings can change this.
            </p>
          )}

          <div>
            <h3 className="text-xs font-semibold text-fg">Muted customers</h3>
            <p className="mt-0.5 text-[11px] text-fg2">
              Mute a customer from the Messages card of their repair order, or from their details in Customers.
            </p>
            {emails.length === 0 ? (
              <p className="mt-2 rounded-lg border border-dashed border-line px-3 py-4 text-xs text-fg2">No customers are muted.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                {emails.map((email) => (
                  <li key={email} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2 text-xs text-fg">
                      <BellOff className="h-3.5 w-3.5 shrink-0 text-warn" aria-hidden />
                      <span className="break-all">{email}</span>
                    </span>
                    {canOne && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy === email}
                        aria-label={`Turn notifications back on for ${email}`}
                        onClick={async () => {
                          setBusy(email);
                          setError(null);
                          setError(await mutes.toggleCustomer(email, false));
                          setBusy(null);
                        }}
                      >
                        {busy === email ? 'Saving...' : 'Unmute'}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <ErrorNote errors={error} />
        </div>
      )}
    </Card>
  );
}

const PRIVACY_HINT =
  'Phone shows as 403 471 xxxx and email as vixxx0@gmail.com. This is the starting choice when printing and in the emailed copy; staff can still choose each time they print.';

/** Settings, Notifications: progress and invoice emails to customers, and invoice privacy. SMS waits for a provider. */
function CustomerEmailsCard() {
  const id = useId();
  const { can } = useAuth();
  const emails = useCustomerEmailSettings();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = can('settings', 'full');
  const s = emails.settings;

  async function save(progress: boolean, invoice: boolean) {
    setBusy(true);
    setError(null);
    setError(await emails.save(progress, invoice));
    setBusy(false);
  }

  async function savePrivacy(hide: boolean) {
    setBusy(true);
    setError(null);
    setError(await emails.savePrivacy(hide));
    setBusy(false);
  }

  return (
    <Card className="p-4 md:p-5">
      <CardHeader
        title="Customer emails"
        subtitle="What your customers are told about their repair, by email. Progress emails follow each customer's own email choice."
      />
      {emails.error && <ErrorNote errors={emails.error} />}
      {!s && !emails.error && <p className="text-xs text-fg2">Loading...</p>}
      {s && (
        <div className="space-y-3" aria-busy={busy}>
          {canEdit ? (
            <>
              <CheckRow
                id={`${id}-progress`}
                label="Email customers at every progress step"
                hint={
                  s.email_progress
                    ? 'On: the customer gets an email each time the repair moves to a new step. Approval requests are always emailed.'
                    : 'Off: no progress emails are sent. Approval requests are still emailed, because the work cannot go ahead without an answer.'
                }
                checked={s.email_progress}
                onChange={(on) => {
                  if (!busy) void save(on, s.email_invoice);
                }}
              />
              <CheckRow
                id={`${id}-invoice`}
                label="Email the invoice as a PDF when a repair is ready for pickup"
                hint={
                  s.email_invoice
                    ? 'On: the invoice is emailed with the PDF attached. It is always created and kept in Invoices.'
                    : 'Off: the invoice is still created and kept in Invoices, but not emailed. Use Send again to email it.'
                }
                checked={s.email_invoice}
                onChange={(on) => {
                  if (!busy) void save(s.email_progress, on);
                }}
              />
              <CheckRow
                id={`${id}-privacy`}
                label="Hide customer phone and email on invoices"
                hint={PRIVACY_HINT}
                checked={s.invoice_hide_contact}
                onChange={(hide) => {
                  if (!busy) void savePrivacy(hide);
                }}
              />
            </>
          ) : (
            <p className="rounded-lg border border-line bg-surface2 p-3 text-xs text-fg2">
              Progress emails are <strong className="text-fg">{s.email_progress ? 'on' : 'off'}</strong> and invoice emails are{' '}
              <strong className="text-fg">{s.email_invoice ? 'on' : 'off'}</strong> for this shop. Approval requests are always emailed. Invoices{' '}
              <strong className="text-fg">{s.invoice_hide_contact ? 'hide' : 'show'}</strong> the customer&apos;s phone and email by default
              (you can still choose each time you print). Only staff with full access to Settings can change this.
            </p>
          )}

          <div className="flex items-start gap-3 rounded-lg border border-line bg-surface2 p-3 opacity-60">
            <input
              id={`${id}-sms`}
              type="checkbox"
              checked={false}
              disabled
              aria-describedby={`${id}-sms-hint`}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-not-allowed coarse:h-5 coarse:w-5"
            />
            <label htmlFor={`${id}-sms`} className="min-w-0">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
                Text customers (SMS)
              </span>
              <span id={`${id}-sms-hint`} className="block text-[11px] text-fg2">
                Needs an SMS provider. Coming later.
              </span>
            </label>
          </div>

          <p className="text-[11px] text-fg3">Emails are sent from the shop&apos;s email account set up in Supabase (see the setup guide).</p>
          {busy && (
            <p role="status" className="text-[11px] text-fg2">
              Saving...
            </p>
          )}
          <ErrorNote errors={error} />
        </div>
      )}
    </Card>
  );
}

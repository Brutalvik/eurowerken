import { useCallback, useEffect, useId, useState } from 'react';
import { CheckCircle2, ExternalLink, PlugZap } from 'lucide-react';
import {
  connectHelcim,
  disconnectHelcim,
  getPaymentSettings,
  HELCIM_PRICING_URL,
  paymentErrorMessage,
  setOnlinePayments,
  testHelcimConnection,
} from '@/api/payments';
import type { PaymentSettings } from '@/api/payments';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { CheckRow, ConfirmDialog, ErrorNote, inputClass, Labeled } from '../inventory/PartForm';

/**
 * Settings, Payments: connect the shop's Helcim account (its API token goes into Supabase Vault and is never shown
 * again; only its last 4 characters are), test it, disconnect, and choose whether customers may pay online.
 */
export function PaymentsCard() {
  const id = useId();
  const { user, can } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const canEdit = can('settings', 'full');
  const [s, setS] = useState<PaymentSettings | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<'connect' | 'test' | 'disconnect' | 'online' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [askDisconnect, setAskDisconnect] = useState(false);

  const load = useCallback(async () => {
    if (!workshopId) return;
    try {
      setS(await getPaymentSettings(workshopId));
      setError(null);
    } catch (e) {
      setError(paymentErrorMessage(e, 'The payment settings could not be loaded.'));
    }
  }, [workshopId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function test() {
    setBusy('test');
    setResult(null);
    try {
      setResult(await testHelcimConnection());
    } catch (e) {
      setResult({ ok: false, message: paymentErrorMessage(e, 'The connection could not be tested.') });
    } finally {
      setBusy(null);
    }
  }

  async function connect() {
    const t = token.trim();
    if (!t || busy) return;
    setBusy('connect');
    setError(null);
    setResult(null);
    try {
      await connectHelcim(t);
      setToken('');
      await load();
    } catch (e) {
      setError(paymentErrorMessage(e, 'The token could not be saved.'));
      setBusy(null);
      return;
    }
    setBusy(null);
    await test();
  }

  async function disconnect() {
    setBusy('disconnect');
    setError(null);
    try {
      await disconnectHelcim();
      setAskDisconnect(false);
      setResult(null);
      await load();
    } catch (e) {
      setError(paymentErrorMessage(e, 'Payments could not be disconnected.'));
    } finally {
      setBusy(null);
    }
  }

  async function toggleOnline(v: boolean) {
    setBusy('online');
    setError(null);
    try {
      await setOnlinePayments(v);
      setS((cur) => (cur ? { ...cur, online_payments_enabled: v } : cur));
    } catch (e) {
      setError(paymentErrorMessage(e, 'The change could not be saved.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <CardHeader
        title="Payments"
        subtitle="Take card payments through Helcim, in the ERP and on your customer website. Cash, cheque and e-transfer are recorded on each invoice."
      />
      <div className="space-y-4 text-xs">
        {!s && !error && <p className="text-fg2">Loading...</p>}
        {s && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl glass-field p-3">
            {s.connected ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-ok" aria-hidden />
                <span className="font-semibold text-fg">Helcim connected</span>
                {s.token_hint && <span className="text-fg2">API token ending {s.token_hint}</span>}
              </>
            ) : (
              <>
                <PlugZap className="h-4 w-4 text-fg3" aria-hidden />
                <span className="font-semibold text-fg">Not connected</span>
                <span className="text-fg2">Card payments are off until a Helcim API token is added.</span>
              </>
            )}
          </div>
        )}

        {s && canEdit && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void connect();
            }}
          >
            <Labeled
              id={`${id}-token`}
              label={s.connected ? 'Replace the Helcim API token' : 'Helcim API token'}
              hint="In Helcim: All Tools > Integrations > API Access Configurations > New API Access. Tick the checkout (HelcimPay.js) box, add this site's addresses, and set Transaction Processing to Admin (needed for refunds). The token is stored encrypted and never shown again."
            >
              <input
                id={`${id}-token`}
                type="password"
                autoComplete="off"
                spellCheck={false}
                className={inputClass}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste the token"
              />
            </Labeled>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!token.trim() || !!busy}>
                {busy === 'connect' ? 'Saving...' : s.connected ? 'Replace token' : 'Connect'}
              </Button>
              {s.connected && (
                <>
                  <Button variant="ghost" onClick={() => void test()} disabled={!!busy}>
                    {busy === 'test' ? 'Testing...' : 'Test connection'}
                  </Button>
                  <Button variant="ghost" onClick={() => setAskDisconnect(true)} disabled={!!busy}>
                    Disconnect
                  </Button>
                </>
              )}
            </div>
          </form>
        )}
        {s && !canEdit && <p className="text-fg2">Only staff with full access to Settings can connect or change payments.</p>}

        <div aria-live="polite">
          {result && (
            <p className={`rounded-lg border px-3 py-2 ${result.ok ? 'border-ok/30 bg-ok/10 text-ok' : 'border-bad/30 bg-bad/10 text-bad'}`}>{result.message}</p>
          )}
        </div>
        <ErrorNote errors={error} />

        {s && canEdit && (
          <CheckRow
            id={`${id}-online`}
            label="Customers can pay invoices online"
            hint={
              s.connected
                ? 'Shows Pay now on invoices on your customer website (tracking page and account).'
                : 'Takes effect once Helcim is connected.'
            }
            checked={s.online_payments_enabled}
            onChange={(v) => busy !== 'online' && void toggleOnline(v)}
          />
        )}

        <div className="space-y-1 rounded-lg border border-line p-3 text-fg2">
          <p className="font-semibold text-fg">Fees</p>
          <p>
            Helcim charges its own processing fee on each card payment (interchange plus pricing: the card network's cost plus Helcim's margin), and pays
            out the rest to your bank account. Your Helcim agreement and Helcim's pricing page set the rates, including how refunds are charged.
            EuroWerken adds nothing to card payments. Cash, cheque and e-transfer recorded here cost nothing.
          </p>
          <a href={HELCIM_PRICING_URL} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-accent hover:underline coarse:min-h-11">
            Helcim's published pricing
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </div>
      </div>

      <ConfirmDialog
        open={askDisconnect}
        title="Disconnect Helcim?"
        message="The API token is deleted. Card payments and card refunds stop until a token is added again. Payments already recorded stay."
        confirmLabel="Disconnect"
        busy={busy === 'disconnect'}
        error={error}
        onConfirm={() => void disconnect()}
        onCancel={() => setAskDisconnect(false)}
      />
    </Card>
  );
}

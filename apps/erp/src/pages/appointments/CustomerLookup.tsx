import { useEffect, useRef, useState } from 'react';
import { Car, Check, Loader2, PencilLine, Plus, UserCheck, UserPlus } from 'lucide-react';
import { findCustomer, knownCarLabel } from '@/api/appointments';
import type { KnownCar, KnownCustomer } from '@/api/appointments';
import { Button } from '@/components/ui/Button';
import { Dialog } from '../inventory/PartForm';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** What to look up from the typed email and phone: a complete email, or a phone with at least 10 digits. */
export function lookupKey(email: string, phone: string): { email: string; phone: string; key: string } | null {
  const e = email.trim().toLowerCase();
  const digits = phone.replace(/\D/g, '');
  const okEmail = EMAIL.test(e);
  const okPhone = digits.length >= 10;
  if (!okEmail && !okPhone) return null;
  return { email: okEmail ? e : '', phone: okPhone ? digits.slice(-10) : '', key: `${okEmail ? e : ''}|${okPhone ? digits.slice(-10) : ''}` };
}

export type LookupState =
  | { status: 'idle' }
  | { status: 'looking' }
  | { status: 'none' }
  | { status: 'error'; message: string }
  | { status: 'found'; customer: KnownCustomer; key: string };

/** Looks the customer up shortly after the email or phone is typed. */
export function useCustomerLookup(email: string, phone: string): LookupState {
  const [state, setState] = useState<LookupState>({ status: 'idle' });
  const last = useRef<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const k = lookupKey(email, phone);
    if (!k) {
      last.current = null;
      setState({ status: 'idle' });
      return;
    }
    if (k.key === last.current) return;
    const timer = window.setTimeout(async () => {
      last.current = k.key;
      const mine = ++seq.current;
      setState({ status: 'looking' });
      try {
        const customer = await findCustomer(k.email, k.phone);
        if (mine !== seq.current) return;
        setState(customer ? { status: 'found', customer, key: k.key } : { status: 'none' });
      } catch (err) {
        if (mine !== seq.current) return;
        last.current = null;
        setState({ status: 'error', message: err instanceof Error ? err.message : 'The customer could not be looked up.' });
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [email, phone]);

  return state;
}

/** One line under the contact fields: looking, found (with the account and car count), or a new customer. */
export function LookupNote({ state }: { state: LookupState }) {
  if (state.status === 'idle') {
    return <p className="text-[11px] text-fg3">Type the customer's email or phone to fill in their details and car.</p>;
  }
  return (
    <p role="status" className="flex items-center gap-1.5 text-[11px] text-fg2">
      {state.status === 'looking' && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-fg3" aria-hidden />
          Looking for this customer...
        </>
      )}
      {state.status === 'none' && (
        <>
          <UserPlus className="h-3.5 w-3.5 text-fg3" aria-hidden />
          New customer: no earlier bookings with this email or phone.
        </>
      )}
      {state.status === 'error' && <span className="text-bad">{state.message}</span>}
      {state.status === 'found' && (
        <>
          <UserCheck className="h-3.5 w-3.5 text-ok" aria-hidden />
          <span>
            Found <strong className="text-fg">{state.customer.name || 'this customer'}</strong>
            {state.customer.has_account ? ' (has an account)' : ' (earlier visits)'} · {state.customer.vehicles.length}{' '}
            {state.customer.vehicles.length === 1 ? 'car' : 'cars'} on file
          </span>
        </>
      )}
    </p>
  );
}

/** The pop-up to pick one of the customer's cars, start a new car, or type the details by hand. */
export function CarPicker({
  open,
  customer,
  selected,
  onPick,
  onNewCar,
  onManual,
}: {
  open: boolean;
  customer: KnownCustomer;
  /** The key of the car now in the form, to mark it. */
  selected: string | null;
  onPick: (car: KnownCar) => void;
  onNewCar: () => void;
  onManual: () => void;
}) {
  return (
    <Dialog open={open} size="sm" title={`Which car${customer.name ? ` for ${customer.name}` : ''}?`} onClose={onManual}>
      <div className="space-y-3 text-xs">
        <p className="text-fg2">
          {customer.vehicles.length} {customer.vehicles.length === 1 ? 'car is' : 'cars are'} on file. Pick one to fill in the car, or add a different car.
          You can still change any detail afterwards.
        </p>
        <ul className="space-y-1.5">
          {customer.vehicles.map((car, i) => {
            const key = carKey(car);
            const isSel = key === selected;
            return (
              <li key={`${key}-${i}`}>
                <button
                  type="button"
                  onClick={() => onPick(car)}
                  data-autofocus={i === 0 ? true : undefined}
                  className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition hover:bg-surface2 coarse:min-h-11 ${
                    isSel ? 'border-accent bg-accent/10' : 'border-line bg-surface'
                  }`}
                >
                  <Car className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-fg">{knownCarLabel(car)}</span>
                    <span className="block text-[11px] text-fg2">
                      {[car.plate && `Plate ${car.plate}`, car.vin && `VIN ${car.vin}`].filter(Boolean).join(' · ') || 'No plate or VIN on file'}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-fg3">{car.from_garage ? 'In their garage on your website' : 'From an earlier visit'}</span>
                  </span>
                  {isSel && <Check className="h-4 w-4 shrink-0 text-accent" aria-label="In the form now" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          <Button variant="ghost" onClick={onNewCar}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Enter a new car
          </Button>
          <Button variant="ghost" onClick={onManual}>
            <PencilLine className="h-3.5 w-3.5" aria-hidden />
            Keep what's typed
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** A stable identity for a car, to mark the one in the form. */
export function carKey(car: Pick<KnownCar, 'vehicle_id' | 'vin' | 'plate' | 'make' | 'model' | 'year'>): string {
  return car.vehicle_id ?? `${car.vin ?? ''}|${(car.plate ?? '').toUpperCase()}|${car.make ?? ''}|${car.model ?? ''}|${car.year ?? ''}`;
}

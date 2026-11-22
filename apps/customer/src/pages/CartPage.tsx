import { useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, CreditCard, Info, Lock, PackageSearch, RotateCcw, ShieldCheck, ShoppingCart, Trash2, Wallet, X } from 'lucide-react';
import { Photo } from '@/components/Photo';
import { Breadcrumbs, DemoNotice, LoadError, QuantityStepper, SkeletonGrid, StepCard } from '@/components/ui';
import { useCart, useResolvedCart } from '@/cart/CartContext';
import type { CartLine } from '@/cart/CartContext';
import { formatMoney } from '@/lib/format';
import { sitePath, useSite } from '@/site/SiteContext';

const GST_RATE = 0.05;
const PROMO_CODE = 'WELCOME10';
const PROMO_RATE = 0.1;

const SHIPPING = [
  { id: 'standard', label: 'Standard Delivery', note: '3 to 5 business days', price: 0 },
  { id: 'express', label: 'Express Delivery', note: '1 to 2 business days', price: 15 },
] as const;
type ShippingId = (typeof SHIPPING)[number]['id'];

const PAYMENT_METHODS = [
  { id: 'card', label: 'Credit / Debit Card' },
  { id: 'paypal', label: 'PayPal' },
  { id: 'apple', label: 'Apple Pay' },
] as const;
type PaymentId = (typeof PAYMENT_METHODS)[number]['id'];

const PROVINCES = [
  ['AB', 'Alberta'],
  ['BC', 'British Columbia'],
  ['MB', 'Manitoba'],
  ['NB', 'New Brunswick'],
  ['NL', 'Newfoundland and Labrador'],
  ['NS', 'Nova Scotia'],
  ['NT', 'Northwest Territories'],
  ['NU', 'Nunavut'],
  ['ON', 'Ontario'],
  ['PE', 'Prince Edward Island'],
  ['QC', 'Quebec'],
  ['SK', 'Saskatchewan'],
  ['YT', 'Yukon'],
] as const;

/** Shipping fields: the only fields checked and kept. Card fields are layout only and never read. */
interface Shipping {
  firstName: string;
  lastName: string;
  email: string;
  street: string;
  city: string;
  province: string;
  postal: string;
}
type ShippingErrors = Partial<Record<keyof Shipping, string>>;

const EMPTY_SHIPPING: Shipping = { firstName: '', lastName: '', email: '', street: '', city: '', province: '', postal: '' };
const FIELD_ORDER: (keyof Shipping)[] = ['firstName', 'lastName', 'email', 'street', 'city', 'province', 'postal'];

function validate(s: Shipping): ShippingErrors {
  const e: ShippingErrors = {};
  if (!s.firstName.trim()) e.firstName = 'Enter your first name.';
  if (!s.lastName.trim()) e.lastName = 'Enter your last name.';
  if (!s.email.trim()) e.email = 'Enter your email address.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email.trim())) e.email = 'Enter an email address like name@example.com.';
  if (!s.street.trim()) e.street = 'Enter your street address.';
  if (!s.city.trim()) e.city = 'Enter your city.';
  if (!s.province) e.province = 'Choose your province or territory.';
  if (!s.postal.trim()) e.postal = 'Enter your postal code.';
  else if (!/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(s.postal.trim())) e.postal = 'Enter a postal code like A1A 1A1.';
  return e;
}

interface Totals {
  itemCount: number;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
}

function computeTotals(lines: CartLine[], subtotal: number, promo: boolean, shippingId: ShippingId): Totals {
  const discount = promo ? Math.round(subtotal * PROMO_RATE * 100) / 100 : 0;
  const shipping = SHIPPING.find((s) => s.id === shippingId)?.price ?? 0;
  const tax = Math.round((subtotal - discount + shipping) * GST_RATE * 100) / 100;
  return {
    itemCount: lines.reduce((n, l) => n + l.qty, 0),
    subtotal,
    discount,
    shipping,
    tax,
    total: subtotal - discount + shipping + tax,
  };
}

interface PlacedOrder {
  number: string;
  lines: CartLine[];
  totals: Totals;
  shipping: Shipping;
  shippingLabel: string;
}

export function CartPage() {
  const site = useSite();
  const cart = useCart();
  const resolved = useResolvedCart();
  const [order, setOrder] = useState<PlacedOrder | null>(null);

  return (
    <>
      <Breadcrumbs items={[{ label: 'Parts Shop', to: sitePath(site, 'parts') }, { label: order ? 'Order received' : 'Cart & Checkout' }]} />
      <div className="container-site pb-20 pt-6">
        {!order && cart.removedCount > 0 && <RemovedNotice count={cart.removedCount} onDismiss={cart.dismissRemoved} />}
        {order ? (
          <OrderConfirmation order={order} />
        ) : resolved.loading ? (
          <>
            <h1 className="sr-only">Cart and checkout</h1>
            <SkeletonGrid label="Loading your cart" count={2} className="grid max-w-3xl gap-4" card="h-32" />
          </>
        ) : resolved.error ? (
          <>
            <h1 className="sr-only">Cart and checkout</h1>
            <LoadError what="parts in your cart" onRetry={resolved.retry} className="mx-auto max-w-lg" />
          </>
        ) : resolved.lines.length === 0 ? (
          <EmptyCart />
        ) : (
          <Checkout
            lines={resolved.lines}
            subtotal={resolved.subtotal}
            onPlaced={(o) => {
              setOrder(o);
              cart.clear();
              window.scrollTo({ top: 0 });
            }}
          />
        )}
      </div>
    </>
  );
}

function RemovedNotice({ count, onDismiss }: { count: number; onDismiss: () => void }) {
  return (
    <div role="status" className="glass mb-6 flex items-start gap-3 rounded-2xl px-4 py-3 text-sm text-fg">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
      <p className="min-w-0 flex-1">
        {count === 1 ? 'One item was' : `${count} items were`} removed from your cart because{' '}
        {count === 1 ? 'it is' : 'they are'} no longer available.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notice"
        className="-my-1 -mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg3 transition hover:bg-surface2 hover:text-fg coarse:h-11 coarse:w-11"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function EmptyCart() {
  const site = useSite();
  return (
    <div className="glass mx-auto max-w-lg rounded-3xl px-6 py-14 text-center">
      <ShoppingCart className="mx-auto h-10 w-10 text-fg3" aria-hidden />
      <h1 className="mt-4 font-display text-2xl font-bold text-ink">Your cart is empty</h1>
      <p className="mt-2 text-sm text-fg2">Find exact-fit OEM and performance parts for your vehicle.</p>
      <Link to={sitePath(site, 'parts')} className="btn-ink mt-8">
        Browse the Parts Shop
      </Link>
    </div>
  );
}

// Checkout ----------------------------------------------------------------------------------

function Checkout({ lines, subtotal, onPlaced }: { lines: CartLine[]; subtotal: number; onPlaced: (o: PlacedOrder) => void }) {
  const [shipping, setShipping] = useState<Shipping>(EMPTY_SHIPPING);
  const [errors, setErrors] = useState<ShippingErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [shippingId, setShippingId] = useState<ShippingId>('standard');
  const [payment, setPayment] = useState<PaymentId>('card');
  const [billingSame, setBillingSame] = useState(true);
  const [businessInvoice, setBusinessInvoice] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoError, setPromoError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const totals = computeTotals(lines, subtotal, promoApplied, shippingId);

  function setField(key: keyof Shipping, value: string) {
    const next = { ...shipping, [key]: value };
    setShipping(next);
    // After the first attempt, errors update as the customer fixes them.
    if (submitted) setErrors(validate(next));
  }

  function applyPromo() {
    if (promoInput.trim().toUpperCase() === PROMO_CODE) {
      setPromoApplied(true);
      setPromoError('');
      setPromoInput('');
    } else {
      setPromoError(promoInput.trim() ? 'Code not recognised' : 'Enter a promo code.');
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const found = validate(shipping);
    setErrors(found);
    const first = FIELD_ORDER.find((k) => found[k]);
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`#ship-${first}`)?.focus();
      return;
    }
    onPlaced({
      number: `EW-${Date.now().toString(36).toUpperCase().slice(-6)}`,
      lines,
      totals,
      shipping,
      shippingLabel: SHIPPING.find((s) => s.id === shippingId)?.label ?? '',
    });
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate aria-label="Checkout">
      <h1 className="sr-only">Cart and checkout</h1>
      {/* Phones: cart, summary, shipping, payment. Desktop: form left, sticky summary right. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
        <CartSection lines={lines} />

        <aside aria-label="Order summary" className="lg:col-start-2 lg:row-span-3 lg:row-start-1">
          <div className="glass-strong rounded-2xl p-5 sm:p-6 lg:sticky lg:top-24">
            <h2 className="font-display text-lg font-semibold text-fg">Order Summary</h2>

            {promoApplied ? (
              <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-ok/10 px-3.5 py-2.5 text-sm text-ok">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  {PROMO_CODE} applied: 10% off
                </span>
                <button type="button" onClick={() => setPromoApplied(false)} className="text-xs font-semibold underline coarse:min-h-11">
                  Remove
                </button>
              </div>
            ) : (
              <div className="mt-5">
                <label htmlFor="promo" className="sr-only">
                  Promo code
                </label>
                <div className="flex gap-2">
                  <input
                    id="promo"
                    value={promoInput}
                    onChange={(e) => {
                      setPromoInput(e.target.value);
                      setPromoError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        applyPromo();
                      }
                    }}
                    placeholder="Promo code"
                    autoComplete="off"
                    aria-invalid={promoError ? true : undefined}
                    aria-describedby={promoError ? 'promo-error' : undefined}
                    className="input min-w-0 flex-1 uppercase placeholder:normal-case"
                  />
                  <button type="button" onClick={applyPromo} className="btn-ink px-4 py-2.5">
                    Apply
                  </button>
                </div>
                {promoError && (
                  <p id="promo-error" role="alert" className="mt-1.5 text-xs text-bad">
                    {promoError}
                  </p>
                )}
              </div>
            )}

            <dl className="mt-5 space-y-2.5 text-sm">
              <SummaryRow label={`Subtotal (${totals.itemCount} ${totals.itemCount === 1 ? 'item' : 'items'})`} value={formatMoney(totals.subtotal)} />
              {totals.discount > 0 && <SummaryRow label="Discount (WELCOME10)" value={`-${formatMoney(totals.discount)}`} tone="text-ok" />}
              <SummaryRow
                label="Shipping"
                value={totals.shipping === 0 ? 'Free' : formatMoney(totals.shipping)}
                tone={totals.shipping === 0 ? 'text-ok' : undefined}
              />
              <SummaryRow label="Estimated tax (5% GST)" value={formatMoney(totals.tax)} />
            </dl>
            <div className="mt-5 flex items-baseline justify-between border-t border-line pt-5">
              <span className="font-semibold text-fg">Total</span>
              <span className="font-display text-2xl font-bold text-accent">{formatMoney(totals.total)}</span>
            </div>

            <button type="submit" className="btn-ink mt-6 w-full py-3.5 text-base">
              <Lock className="h-4 w-4" aria-hidden />
              Pay Securely
            </button>
            <TermsNote />
            <ul className="mt-5 flex justify-center gap-5 text-[11px] text-fg3">
              <li className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" aria-hidden /> Secure checkout
              </li>
              <li className="flex items-center gap-1.5">
                <RotateCcw className="h-4 w-4" aria-hidden /> 90-day returns
              </li>
            </ul>
          </div>
        </aside>

        <StepCard step={2} title="Shipping Details" className="lg:col-start-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="firstName" label="First name" autoComplete="given-name" shipping={shipping} errors={errors} onChange={setField} />
            <Field id="lastName" label="Last name" autoComplete="family-name" shipping={shipping} errors={errors} onChange={setField} />
            <Field id="email" label="Email address" type="email" autoComplete="email" shipping={shipping} errors={errors} onChange={setField} className="sm:col-span-2" />
            <Field id="street" label="Street address" autoComplete="street-address" shipping={shipping} errors={errors} onChange={setField} className="sm:col-span-2" />
            <Field id="city" label="City" autoComplete="address-level2" shipping={shipping} errors={errors} onChange={setField} />
            <div className="grid grid-cols-2 gap-4">
              <FieldShell id="province" label="Province" error={errors.province}>
                <select
                  id="ship-province"
                  value={shipping.province}
                  onChange={(e) => setField('province', e.target.value)}
                  autoComplete="address-level1"
                  aria-invalid={errors.province ? true : undefined}
                  aria-describedby={errors.province ? 'ship-province-error' : undefined}
                  className="input"
                >
                  <option value="">Select</option>
                  {PROVINCES.map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </FieldShell>
              <Field id="postal" label="Postal code" autoComplete="postal-code" shipping={shipping} errors={errors} onChange={setField} />
            </div>
          </div>

          <fieldset className="mt-7">
            <legend className="text-sm font-semibold text-fg">Shipping method</legend>
            <div className="mt-3 space-y-3">
              {SHIPPING.map((s) => (
                <RadioCard key={s.id} name="shipping" checked={shippingId === s.id} onChange={() => setShippingId(s.id)}>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-fg">{s.label}</span>
                    <span className="block text-xs text-fg3">{s.note}</span>
                  </span>
                  <span className={`text-sm font-semibold ${s.price === 0 ? 'text-ok' : 'text-fg'}`}>{s.price === 0 ? 'Free' : formatMoney(s.price)}</span>
                </RadioCard>
              ))}
            </div>
          </fieldset>
        </StepCard>

        <StepCard step={3} title="Payment Information" className="lg:col-start-1">
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center gap-3 text-sm text-fg coarse:min-h-11">
              <input type="checkbox" checked={billingSame} onChange={(e) => setBillingSame(e.target.checked)} className="h-4 w-4 accent-accent" />
              Billing address same as shipping
            </label>
            {!billingSame && <p className="pl-7 text-xs text-fg3">We will ask for your billing address when we contact you to arrange payment.</p>}
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface2/60 p-4 text-sm">
              <input type="checkbox" checked={businessInvoice} onChange={(e) => setBusinessInvoice(e.target.checked)} className="mt-0.5 h-4 w-4 accent-accent" />
              <span>
                <span className="block font-semibold text-fg">I need a VAT / business invoice</span>
                <span className="mt-0.5 block text-xs text-fg3">You will be asked for your company details after checkout.</span>
              </span>
            </label>
          </div>

          <fieldset className="mt-6">
            <legend className="text-sm font-semibold text-fg">Payment method</legend>
            <div className="mt-3 space-y-3">
              {PAYMENT_METHODS.map((m) => (
                <div key={m.id} className={`rounded-xl border transition ${payment === m.id ? 'border-ink bg-surface' : 'border-line'}`}>
                  <RadioCard name="payment" checked={payment === m.id} onChange={() => setPayment(m.id)} bare>
                    <span className="flex-1 text-sm font-semibold text-fg">{m.label}</span>
                    {m.id === 'card' ? <CreditCard className="h-5 w-5 text-fg3" aria-hidden /> : <Wallet className="h-5 w-5 text-fg3" aria-hidden />}
                  </RadioCard>
                  {payment === m.id && m.id === 'card' && <CardFields />}
                  {payment === m.id && m.id !== 'card' && (
                    <p className="px-4 pb-4 text-xs text-fg3">The workshop will contact you to arrange payment with {m.label}.</p>
                  )}
                </div>
              ))}
            </div>
          </fieldset>
        </StepCard>
      </div>
    </form>
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-fg2">{label}</dt>
      <dd className={`font-medium tabular-nums ${tone ?? 'text-fg'}`}>{value}</dd>
    </div>
  );
}

function TermsNote() {
  const site = useSite();
  return (
    <p className="mt-4 text-center text-xs leading-relaxed text-fg3">
      By placing your order, you agree to the{' '}
      <Link to={sitePath(site, 'terms')} className="font-medium text-fg2 underline hover:text-fg">
        Terms and Conditions
      </Link>{' '}
      and{' '}
      <Link to={sitePath(site, 'privacy')} className="font-medium text-fg2 underline hover:text-fg">
        Privacy Policy
      </Link>
      .
    </p>
  );
}

function CartSection({ lines }: { lines: CartLine[] }) {
  const site = useSite();
  const { setQty, remove } = useCart();
  return (
    <StepCard step={1} title="Your Cart" className="lg:col-start-1">
      <ul className="divide-y divide-line">
        {lines.map(({ part, qty }) => (
          <li key={part.id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
            <Link to={sitePath(site, `parts/${part.slug}`)} tabIndex={-1} aria-hidden className="shrink-0">
              <Photo src={part.image} alt="" icon={PackageSearch} fit="contain" className="h-20 w-20 rounded-xl border border-line bg-surface sm:h-24 sm:w-24" />
            </Link>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link to={sitePath(site, `parts/${part.slug}`)} className="text-sm font-semibold text-fg hover:text-accent">
                    {part.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-fg3">
                    {[part.brand, part.quality, part.partNumber && `Part # ${part.partNumber}`].filter(Boolean).join(' \u00b7 ')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(part.id)}
                  aria-label={`Remove ${part.name} from cart`}
                  className="-mr-2 -mt-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fg3 transition hover:bg-bad/10 hover:text-bad coarse:h-11 coarse:w-11"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <QuantityStepper value={qty} onChange={(v) => setQty(part.id, v)} label={`Quantity of ${part.name}`} />
                <p className="font-display font-bold text-fg tabular-nums">{formatMoney(part.price * qty)}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </StepCard>
  );
}

// Form pieces --------------------------------------------------------------------------------

function FieldShell({ id, label, error, className = '', children }: { id: keyof Shipping; label: string; error?: string; className?: string; children: ReactNode }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={`ship-${id}`} className="label">
        {label}
      </label>
      {children}
      {error && (
        <p id={`ship-${id}-error`} className="mt-1 text-xs text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  type = 'text',
  autoComplete,
  shipping,
  errors,
  onChange,
  className,
}: {
  id: keyof Shipping;
  label: string;
  type?: string;
  autoComplete: string;
  shipping: Shipping;
  errors: ShippingErrors;
  onChange: (key: keyof Shipping, value: string) => void;
  className?: string;
}) {
  const error = errors[id];
  return (
    <FieldShell id={id} label={label} error={error} className={className}>
      <input
        id={`ship-${id}`}
        type={type}
        value={shipping[id]}
        onChange={(e) => onChange(id, e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `ship-${id}-error` : undefined}
        className={`input ${error ? 'border-bad' : ''}`}
      />
    </FieldShell>
  );
}

function RadioCard({ name, checked, onChange, bare, children }: { name: string; checked: boolean; onChange: () => void; bare?: boolean; children: ReactNode }) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 p-4 transition ${
        bare ? '' : `rounded-xl border ${checked ? 'border-ink bg-surface' : 'border-line hover:border-fg3'}`
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="h-4 w-4 shrink-0 accent-accent" />
      {children}
    </label>
  );
}

/**
 * Card fields are layout only: online payment is not connected yet. They are
 * uncontrolled, have no name, autocomplete is off, and their values are never
 * read, stored, logged or sent.
 */
function CardFields() {
  return (
    <div className="grid gap-4 border-t border-line p-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="card-number" className="label">
          Card number
        </label>
        <input id="card-number" type="text" inputMode="numeric" autoComplete="off" placeholder="0000 0000 0000 0000" className="input" />
      </div>
      <div>
        <label htmlFor="card-expiry" className="label">
          Expiry date
        </label>
        <input id="card-expiry" type="text" inputMode="numeric" autoComplete="off" placeholder="MM/YY" className="input" />
      </div>
      <div>
        <label htmlFor="card-cvc" className="label">
          CVC
        </label>
        <input id="card-cvc" type="text" inputMode="numeric" autoComplete="off" placeholder="123" className="input" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="card-name" className="label">
          Name on card
        </label>
        <input id="card-name" type="text" autoComplete="off" className="input" />
      </div>
    </div>
  );
}

// Confirmation ---------------------------------------------------------------------------------

function OrderConfirmation({ order }: { order: PlacedOrder }) {
  const site = useSite();
  const { totals, shipping } = order;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section className="glass-strong rounded-3xl p-6 text-center sm:p-10">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ok/15 text-ok">
          <CheckCircle2 className="h-7 w-7" aria-hidden />
        </span>
        <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-ink">Order received</h1>
        <p className="mt-2 text-sm text-fg2">
          Thank you, {shipping.firstName}. Your order number is <span className="font-semibold text-fg">{order.number}</span>. We will email{' '}
          <span className="font-medium text-fg">{shipping.email}</span> with updates.
        </p>
      </section>

      <DemoNotice>
        Online payment is not connected yet, so no card was charged. {site.display_name} will contact you to arrange payment before your parts
        are shipped.
      </DemoNotice>

      <section className="glass rounded-3xl p-5 sm:p-7" aria-labelledby="ordered-title">
        <h2 id="ordered-title" className="font-display text-lg font-semibold text-fg">
          What you ordered
        </h2>
        <ul className="mt-4 divide-y divide-line">
          {order.lines.map(({ part, qty }) => (
            <li key={part.id} className="flex items-center gap-4 py-3">
              <Photo src={part.image} alt="" icon={PackageSearch} fit="contain" className="h-14 w-14 shrink-0 rounded-xl border border-line bg-surface" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg">{part.name}</p>
                <p className="text-xs text-fg3">Quantity {qty}</p>
              </div>
              <p className="text-sm font-semibold tabular-nums text-fg">{formatMoney(part.price * qty)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
          <SummaryRow label="Subtotal" value={formatMoney(totals.subtotal)} />
          {totals.discount > 0 && <SummaryRow label="Discount (WELCOME10)" value={`-${formatMoney(totals.discount)}`} tone="text-ok" />}
          <SummaryRow label={`Shipping (${order.shippingLabel})`} value={totals.shipping === 0 ? 'Free' : formatMoney(totals.shipping)} />
          <SummaryRow label="Estimated tax (5% GST)" value={formatMoney(totals.tax)} />
          <div className="flex justify-between gap-4 border-t border-line pt-3">
            <dt className="font-semibold text-fg">Total</dt>
            <dd className="font-display text-lg font-bold tabular-nums text-fg">{formatMoney(totals.total)}</dd>
          </div>
        </dl>
        <div className="mt-5 rounded-xl bg-surface2/60 p-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg3">Ship to</p>
          <p className="mt-1 text-fg">
            {shipping.firstName} {shipping.lastName}
            <br />
            {shipping.street}
            <br />
            {shipping.city}, {shipping.province} {shipping.postal.toUpperCase()}
          </p>
        </div>
      </section>

      <div className="flex flex-col justify-center gap-3 sm:flex-row">
        <Link to={sitePath(site, 'parts')} className="btn-ink">
          Continue shopping
        </Link>
        <Link to={sitePath(site)} className="btn-outline">
          Back to home
        </Link>
      </div>
    </div>
  );
}

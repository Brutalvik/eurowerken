import { Link } from 'react-router-dom';
import { Car, Info, LogIn } from 'lucide-react';
import type { CustomerVehicleRow } from '@eurowerken/shared';
import { VEHICLE_MAKES, VEHICLE_YEARS } from '@/data/catalog';
import type { Errors, FormState } from '../model';
import { CheckBadge, ErrorText, GroupLabel, chipClass, errorProps, tileClass } from '../ui';

export interface SavedVehicles {
  loading: boolean;
  list: CustomerVehicleRow[];
}

function savedTitle(v: CustomerVehicleRow): string {
  return v.nickname?.trim() || [v.year, v.make, v.model].filter(Boolean).join(' ');
}

export function VehicleStep({
  form,
  set,
  shown,
  signedIn,
  offerSignIn,
  saved,
  onPickSaved,
  loginHref,
}: {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  shown: Errors;
  signedIn: boolean;
  /** Signed out (not while the session is still being checked). */
  offerSignIn: boolean;
  saved: SavedVehicles;
  onPickSaved: (v: CustomerVehicleRow) => void;
  loginHref: string;
}) {
  const makes = Object.keys(VEHICLE_MAKES);
  // A saved car may be a make, model or year outside the lists: show it too.
  if (form.make && !makes.includes(form.make)) makes.push(form.make);
  const models = [...(VEHICLE_MAKES[form.make] ?? [])];
  if (form.model && !models.includes(form.model)) models.push(form.model);
  const years = [...VEHICLE_YEARS];
  if (form.year && !years.includes(form.year)) years.push(form.year);

  return (
    <div className="space-y-8">
      {signedIn && (saved.loading || saved.list.length > 0) && (
        <div role="group" aria-labelledby="saved-label" aria-busy={saved.loading || undefined}>
          <GroupLabel id="saved-label">From your garage</GroupLabel>
          {saved.loading ? (
            <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
              {[0, 1].map((i) => (
                <span key={i} className="glass h-[4.5rem] animate-pulse rounded-2xl motion-reduce:animate-none" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {saved.list.map((v) => {
                const on = form.savedVehicleId === v.id;
                const detail = [v.nickname?.trim() ? [v.year, v.make, v.model].filter(Boolean).join(' ') : '', v.plate].filter(Boolean).join(' · ');
                return (
                  <button key={v.id} type="button" aria-pressed={on} onClick={() => onPickSaved(v)} className={`${tileClass(on)} flex items-center gap-3 p-4`}>
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${on ? 'bg-accent text-accent-fg' : 'bg-accent/10 text-accent'}`}
                    >
                      <Car className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg">{savedTitle(v)}</span>
                      {detail && <span className="block truncate text-xs text-fg3">{detail}</span>}
                    </span>
                    <CheckBadge on={on} />
                  </button>
                );
              })}
            </div>
          )}
          <p className="mt-6 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-fg3">
            <span className="h-px flex-1 bg-line" />
            Or choose another vehicle
            <span className="h-px flex-1 bg-line" />
          </p>
        </div>
      )}

      {offerSignIn && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg2">
          <LogIn className="h-4 w-4 text-accent" aria-hidden />
          Have an account?
          <Link to={loginHref} className="font-semibold text-accent underline-offset-2 hover:underline">
            Sign in to use your saved vehicles and details
          </Link>
        </p>
      )}

      <div role="group" aria-labelledby="make-label" aria-describedby={shown.make ? 'make-error' : undefined}>
        <GroupLabel id="make-label">Make</GroupLabel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {makes.map((m, i) => {
            const on = form.make === m;
            return (
              <button
                key={m}
                id={`book-make-${i}`}
                type="button"
                aria-pressed={on}
                onClick={() => set('make', m)}
                className={`${tileClass(on, !!shown.make)} flex min-h-[4.25rem] items-center gap-3 p-3 sm:p-4`}
              >
                <span
                  aria-hidden
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold transition ${
                    on ? 'bg-accent text-accent-fg' : 'bg-fg/5 text-fg2'
                  }`}
                >
                  {m.charAt(0)}
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold leading-tight text-fg">{m}</span>
                <CheckBadge on={on} className="hidden sm:flex" />
              </button>
            );
          })}
        </div>
        <ErrorText field="make" error={shown.make} />
      </div>

      {form.make && (
        <div key={form.make} className="book-reveal" role="group" aria-labelledby="model-label" aria-describedby={shown.model ? 'model-error' : undefined}>
          <GroupLabel id="model-label">{form.make} model</GroupLabel>
          <div className="flex flex-wrap gap-2">
            {models.map((m, i) => (
              <button
                key={m}
                id={`book-model-${i}`}
                type="button"
                aria-pressed={form.model === m}
                onClick={() => set('model', m)}
                className={chipClass(form.model === m, !!shown.model)}
              >
                {m}
              </button>
            ))}
          </div>
          <ErrorText field="model" error={shown.model} />
        </div>
      )}

      {(form.model || form.year) && (
        <div className="book-reveal" role="group" aria-labelledby="year-label" aria-describedby={shown.year ? 'year-error' : undefined}>
          <GroupLabel id="year-label">Year</GroupLabel>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-8">
            {years.map((y, i) => (
              <button
                key={y}
                id={`book-year-${i}`}
                type="button"
                aria-pressed={form.year === y}
                onClick={() => set('year', y)}
                className={`${chipClass(form.year === y, !!shown.year)} px-2`}
              >
                {y}
              </button>
            ))}
          </div>
          <ErrorText field="year" error={shown.year} />
        </div>
      )}

      {(form.year || form.vin) && (
        <div className="book-reveal">
          <label htmlFor="book-vin" className="mb-3 flex items-baseline gap-2 text-sm font-semibold text-fg">
            VIN <span className="text-xs font-normal text-fg3">Optional</span>
          </label>
          <input
            id="book-vin"
            className="input font-mono uppercase tracking-wide placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
            value={form.vin}
            onChange={(e) => set('vin', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            maxLength={17}
            placeholder="17-character VIN"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            {...errorProps(shown, 'vin', 'vin-hint')}
          />
          <ErrorText field="vin" error={shown.vin} />
          <p id="vin-hint" className="mt-3 flex items-start gap-2 rounded-2xl border border-accent/15 bg-accent/5 px-3.5 py-3 text-xs leading-relaxed text-fg2">
            <Info className="mt-px h-4 w-4 shrink-0 text-accent" aria-hidden />
            Providing your VIN helps us make sure we have the exact right parts ready for your vehicle's configuration. It is on your registration and at
            the base of the windscreen.
          </p>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Car, ChevronDown, Info, LogIn, Plus } from 'lucide-react';
import type { CustomerVehicleRow } from '@eurowerken/shared';
import { VEHICLE_MAKES, VEHICLE_YEARS } from '@/data/catalog';
import type { Errors, FormState } from '../model';
import { CheckMark, ErrorText, GroupLabel, choiceClass, errorProps } from '../ui';

export interface SavedVehicles {
  loading: boolean;
  list: CustomerVehicleRow[];
}

function savedTitle(v: CustomerVehicleRow): string {
  return v.nickname?.trim() || [v.year, v.make, v.model].filter(Boolean).join(' ');
}

const selectClass = 'input appearance-none bg-surface/70 pr-10 backdrop-blur-md disabled:cursor-not-allowed disabled:text-fg3';

function Select({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  shown,
  field,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  disabled?: boolean;
  shown: Errors;
  field: 'make' | 'model' | 'year';
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <select id={id} className={selectClass} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} {...errorProps(shown, field)}>
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg3" aria-hidden />
      </div>
      <ErrorText field={field} error={shown[field]} />
    </div>
  );
}

export function VehicleStep({
  form,
  set,
  shown,
  signedIn,
  offerSignIn,
  saved,
  onPickSaved,
  onDifferentCar,
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
  /** "A different car": clears a saved car so the selects start empty. */
  onDifferentCar: () => void;
  loginHref: string;
}) {
  const hasSaved = signedIn && (saved.loading || saved.list.length > 0);
  const pickedSaved = saved.list.some((v) => v.id === form.savedVehicleId);
  const [different, setDifferent] = useState(() => !form.savedVehicleId && !!form.make);
  const differentOn = !pickedSaved && (different || !!form.make);
  const showManual = !hasSaved || differentOn;
  const [vinOpen, setVinOpen] = useState(() => !!form.vin);
  const vinShown = vinOpen || !!shown.vin;

  const makes = Object.keys(VEHICLE_MAKES);
  // A saved car may be a make, model or year outside the lists: offer it too.
  if (form.make && !makes.includes(form.make)) makes.push(form.make);
  const models = [...(VEHICLE_MAKES[form.make] ?? [])];
  if (form.model && !models.includes(form.model)) models.push(form.model);
  const years = [...VEHICLE_YEARS];
  if (form.year && !years.includes(form.year)) years.push(form.year);

  return (
    <div className="space-y-7">
      {hasSaved && (
        <fieldset aria-busy={saved.loading || undefined} aria-describedby={shown.make && !showManual ? 'make-error' : undefined}>
          <GroupLabel as="legend">Your saved cars</GroupLabel>
          {saved.loading ? (
            <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
              {[0, 1].map((i) => (
                <span key={i} className="glass h-20 animate-pulse rounded-2xl motion-reduce:animate-none" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {saved.list.map((v, i) => {
                const on = form.savedVehicleId === v.id;
                const detail = [v.nickname?.trim() ? [v.year, v.make, v.model].filter(Boolean).join(' ') : '', v.plate].filter(Boolean).join(' · ');
                return (
                  <label key={v.id} className={`${choiceClass(on, !!shown.make && !showManual)} items-center gap-4 p-4 sm:p-5`}>
                    <input
                      id={`book-car-${i}`}
                      type="radio"
                      name="book-car"
                      className="sr-only"
                      checked={on}
                      onChange={() => {
                        setDifferent(false);
                        onPickSaved(v);
                      }}
                    />
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-accent text-accent-fg' : 'bg-accent/10 text-accent'}`}>
                      <Car className="h-6 w-6" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-fg">{savedTitle(v)}</span>
                      {detail && <span className="block truncate text-sm text-fg2">{detail}</span>}
                    </span>
                    <CheckMark on={on} radio />
                  </label>
                );
              })}
              <label className={`${choiceClass(differentOn, !!shown.make && !showManual)} items-center gap-4 p-4 sm:p-5`}>
                <input
                  id={`book-car-${saved.list.length}`}
                  type="radio"
                  name="book-car"
                  className="sr-only"
                  checked={differentOn}
                  onChange={() => {
                    setDifferent(true);
                    onDifferentCar();
                  }}
                />
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${differentOn ? 'bg-accent text-accent-fg' : 'bg-fg/5 text-fg2'}`}>
                  <Plus className="h-6 w-6" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-fg">A different car</span>
                  <span className="block text-sm text-fg2">Enter the make, model and year</span>
                </span>
                <CheckMark on={differentOn} radio />
              </label>
            </div>
          )}
          {!showManual && <ErrorText field="make" error={shown.make ? 'Pick one of your cars, or A different car.' : undefined} />}
        </fieldset>
      )}

      {offerSignIn && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg2">
          <LogIn className="h-4 w-4 text-accent" aria-hidden />
          Have an account?
          <Link to={loginHref} className="inline-flex min-h-11 items-center font-semibold text-accent underline-offset-2 hover:underline">
            Sign in to use your saved cars and details
          </Link>
        </p>
      )}

      {showManual && (
        <fieldset className={hasSaved ? 'book-reveal' : undefined}>
          <GroupLabel as="legend">{hasSaved ? 'The other car' : 'Which car is it?'}</GroupLabel>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select id="book-make" field="make" label="Make" value={form.make} onChange={(v) => set('make', v)} options={makes} placeholder="Choose a make" shown={shown} />
            <Select
              id="book-model"
              field="model"
              label="Model"
              value={form.model}
              onChange={(v) => set('model', v)}
              options={models}
              placeholder={form.make ? 'Choose a model' : 'Choose a make first'}
              disabled={!form.make}
              shown={shown}
            />
            <Select id="book-year" field="year" label="Year" value={form.year} onChange={(v) => set('year', v)} options={years} placeholder="Choose a year" shown={shown} />
          </div>

          <div className="mt-5">
            {!vinShown ? (
              <button
                type="button"
                aria-expanded={false}
                onClick={() => setVinOpen(true)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-semibold text-accent underline-offset-2 hover:underline"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add VIN (optional)
              </button>
            ) : (
              <div id="book-vin-panel" className="book-reveal">
                <label htmlFor="book-vin" className="label">
                  VIN <span className="font-normal text-fg3">(optional)</span>
                </label>
                <input
                  id="book-vin"
                  className="input bg-surface/70 font-mono uppercase tracking-wide backdrop-blur-md placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
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
                <p id="vin-hint" className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-fg3">
                  <Info className="mt-px h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                  Helps us have the exact parts ready. It is on your registration and at the base of the windscreen.
                </p>
              </div>
            )}
          </div>
        </fieldset>
      )}
    </div>
  );
}

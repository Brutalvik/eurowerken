import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import type { CustomerVehicleRow } from '@eurowerken/shared';
import type { VehicleInput } from '@/api/vehicles';
import { VEHICLE_MAKES } from '@/data/catalog';
import { Field, FormAlert, SubmitButton, focusFirstError } from '@/pages/account/AccountUI';

const MAKES = Object.keys(VEHICLE_MAKES);
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR + 2 - 1950 }, (_, i) => String(THIS_YEAR + 1 - i));

/** VINs are 17 characters, letters and digits, never I, O or Q (matches the database check). */
export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

export function normalizeVin(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

export function vinError(value: string): string | undefined {
  const vin = normalizeVin(value);
  if (!vin) return undefined;
  if (vin.length !== 17) return `A VIN has 17 characters; this one has ${vin.length}.`;
  if (/[IOQ]/.test(vin)) return 'A VIN never contains the letters I, O or Q. Check for 1 and 0 instead.';
  if (!VIN_PATTERN.test(vin)) return 'Use letters and digits only.';
  return undefined;
}

type Key = 'make' | 'model' | 'year' | 'plate' | 'vin' | 'nickname';
type Errors = Partial<Record<Key, string>>;
const ORDER: Key[] = ['make', 'model', 'year', 'plate', 'vin', 'nickname'];

/** Add or edit a vehicle. Saving is done by the caller, which returns an error message or null. */
export function VehicleForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: CustomerVehicleRow;
  onSave: (input: VehicleInput) => Promise<string | null>;
  onCancel: () => void;
}) {
  const uid = useId();
  const id = (k: Key) => `${uid}-${k}`;
  const [make, setMake] = useState(initial?.make ?? '');
  const [model, setModel] = useState(initial?.model ?? '');
  const [year, setYear] = useState(initial?.year ? String(initial.year) : '');
  const [plate, setPlate] = useState(initial?.plate ?? '');
  const [vin, setVin] = useState(initial?.vin ?? '');
  const [nickname, setNickname] = useState(initial?.nickname ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const models = VEHICLE_MAKES[make] ?? [];

  useEffect(() => {
    document.getElementById(`${uid}-make`)?.focus();
  }, [uid]);

  function validate(): Errors {
    const e: Errors = {};
    if (!make.trim()) e.make = 'Enter the make, for example BMW.';
    else if (make.trim().length > 40) e.make = 'Use 40 characters or fewer.';
    if (!model.trim()) e.model = 'Enter the model, for example X5.';
    else if (model.trim().length > 60) e.model = 'Use 60 characters or fewer.';
    if (plate.trim().length > 15) e.plate = 'Use 15 characters or fewer.';
    const v = vinError(vin);
    if (v) e.vin = v;
    if (nickname.trim().length > 40) e.nickname = 'Use 40 characters or fewer.';
    return e;
  }

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setFormError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstError(ORDER.map(id), Object.fromEntries(ORDER.map((k) => [id(k), found[k]])));
      return;
    }
    setBusy(true);
    const err = await onSave({
      make: make.trim(),
      model: model.trim(),
      year: year ? Number(year) : null,
      plate: plate.trim().toUpperCase() || null,
      vin: normalizeVin(vin) || null,
      nickname: nickname.trim() || null,
    });
    setBusy(false);
    if (err) setFormError(err);
  }

  const editing = Boolean(initial);

  return (
    <form onSubmit={submit} noValidate aria-label={editing ? 'Edit vehicle' : 'Add a vehicle'} className="glass mt-5 rounded-2xl p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field
          id={id('make')}
          label="Make"
          list={`${uid}-makes`}
          autoComplete="off"
          maxLength={40}
          value={make}
          error={errors.make}
          onChange={(e) => setMake(e.target.value)}
        />
        <datalist id={`${uid}-makes`}>
          {MAKES.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <Field
          id={id('model')}
          label="Model"
          list={models.length ? `${uid}-models` : undefined}
          autoComplete="off"
          maxLength={60}
          value={model}
          error={errors.model}
          onChange={(e) => setModel(e.target.value)}
        />
        {models.length > 0 && (
          <datalist id={`${uid}-models`}>
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        )}
        <div>
          <label htmlFor={id('year')} className="label">
            Year (optional)
          </label>
          <select id={id('year')} value={year} onChange={(e) => setYear(e.target.value)} className="input">
            <option value="">Not set</option>
            {YEARS.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </div>
        <Field
          id={id('plate')}
          label="Licence plate (optional)"
          autoComplete="off"
          maxLength={15}
          value={plate}
          error={errors.plate}
          onChange={(e) => setPlate(e.target.value)}
          placeholder="ABC 1234"
          className="uppercase"
        />
        <Field
          id={id('vin')}
          label="VIN (optional)"
          autoComplete="off"
          spellCheck={false}
          maxLength={20}
          value={vin}
          hint="17 characters, on the dashboard by the windscreen or on your registration."
          error={errors.vin}
          onChange={(e) => setVin(e.target.value)}
          className="font-mono uppercase"
        />
        <Field
          id={id('nickname')}
          label="Nickname (optional)"
          autoComplete="off"
          maxLength={40}
          value={nickname}
          error={errors.nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Weekend car"
        />
      </div>
      {formError && (
        <div className="mt-4">
          <FormAlert>{formError}</FormAlert>
        </div>
      )}
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="btn-outline">
          Cancel
        </button>
        <SubmitButton busy={busy} busyLabel="Saving..." className="sm:w-auto">
          {editing ? 'Save changes' : 'Add vehicle'}
        </SubmitButton>
      </div>
    </form>
  );
}

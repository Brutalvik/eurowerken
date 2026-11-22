import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { VEHICLE_MAKES, VEHICLE_YEARS } from '@/data/catalog';

const MAKES = Object.keys(VEHICLE_MAKES);

export interface NewVehicle {
  make: string;
  model: string;
  year: string;
  plate: string;
}

/** Small inline form for adding a vehicle to the garage (local state only for now). */
export function AddVehicleForm({ onAdd, onCancel }: { onAdd: (v: NewVehicle) => void; onCancel: () => void }) {
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [plate, setPlate] = useState('');
  const firstRef = useRef<HTMLSelectElement>(null);
  const models = make ? (VEHICLE_MAKES[make] ?? []) : [];

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onAdd({ make, model, year, plate: plate.trim().toUpperCase() });
  }

  return (
    <form onSubmit={submit} aria-label="Add a vehicle" className="glass mt-5 rounded-2xl p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="add-make" className="label">
            Make
          </label>
          <select
            ref={firstRef}
            id="add-make"
            required
            value={make}
            onChange={(e) => {
              setMake(e.target.value);
              setModel('');
            }}
            className="input"
          >
            <option value="">Select make</option>
            {MAKES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="add-model" className="label">
            Model
          </label>
          <select id="add-model" required disabled={!make} value={model} onChange={(e) => setModel(e.target.value)} className="input disabled:opacity-60">
            <option value="">{make ? 'Select model' : 'Choose a make first'}</option>
            {models.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="add-year" className="label">
            Year
          </label>
          <select id="add-year" required value={year} onChange={(e) => setYear(e.target.value)} className="input">
            <option value="">Select year</option>
            {VEHICLE_YEARS.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="add-plate" className="label">
            Licence plate
          </label>
          <input
            id="add-plate"
            required
            maxLength={10}
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="ABC 1234"
            autoComplete="off"
            className="input uppercase"
          />
        </div>
      </div>
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="btn-outline">
          Cancel
        </button>
        <button type="submit" className="btn-ink">
          Add vehicle
        </button>
      </div>
    </form>
  );
}

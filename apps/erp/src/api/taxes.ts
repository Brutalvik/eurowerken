/**
 * The shop's sales taxes (supabase/migrations/029_canadian_taxes.sql): province, the taxes it charges and its
 * registration numbers. Every staff member of the workshop can read them (totals everywhere use them); only
 * set_tax_settings() changes them, and it checks Settings full and every value in the database.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  FALLBACK_TAX_COMPONENTS,
  normalizeRegistration,
  parseTaxSettings,
  registrationProblem,
  taxComponentsProblem,
} from '@eurowerken/shared';
import type { ProvinceCode, TaxComponent, TaxRegistration, TaxSettings } from '@eurowerken/shared';
import { useAuth } from '@/auth/AuthContext';
import { supabase } from '@/lib/supabase';

export const TAX_SETUP_MESSAGE = 'Apply migration 029 (npm run db:migrate).';

interface DbError {
  message: string;
  code?: string;
  details?: string | null;
}

function isMissing(err: DbError): boolean {
  const text = `${err.message} ${err.details ?? ''}`;
  return (
    err.code === '42P01' ||
    err.code === '42883' ||
    err.code === 'PGRST202' ||
    err.code === 'PGRST205' ||
    /workshop_tax_settings|set_tax_settings|schema cache|could not find the (table|function)|does not exist/i.test(text)
  );
}

function toError(err: DbError, fallback: string): Error {
  if (isMissing(err)) return new Error(`Taxes are not set up in the database yet. ${TAX_SETUP_MESSAGE}`);
  if (err.code === 'P0001') return new Error(err.message);
  if (err.code === '23514') return new Error('One of the tax values is not allowed. Check the rates, labels and numbers.');
  if (err.code === '42501' || /permission denied/i.test(err.message)) return new Error('You need full access to Settings to change taxes.');
  return new Error(err.message || fallback);
}

/** The workshop's tax settings. Throws with a sentence when they cannot be read. */
export async function loadTaxSettings(workshopId: string): Promise<TaxSettings> {
  const { data, error } = await supabase.from('workshop_tax_settings').select('*').eq('workshop_id', workshopId).maybeSingle();
  if (error) throw toError(error, 'The tax settings could not be loaded.');
  if (!data) throw new Error(`No tax settings were found for this workshop. ${TAX_SETUP_MESSAGE}`);
  const parsed = parseTaxSettings(data as Record<string, unknown>);
  if (!parsed) throw new Error('The saved tax settings could not be read. Open Settings, Taxes and save them again.');
  return parsed;
}

export interface TaxSettingsInput {
  province: ProvinceCode;
  components: TaxComponent[];
  registration: TaxRegistration;
}

/** Checks the settings before saving; the first problem, or null. The database checks the same again. */
export function taxSettingsProblem(input: TaxSettingsInput): string | null {
  return taxComponentsProblem(input.components) ?? registrationProblem(input.registration);
}

/** Saves the settings (Settings full). Returns what the database stored. */
export async function saveTaxSettings(workshopId: string, input: TaxSettingsInput): Promise<TaxSettings> {
  const components = input.components.map((c) => ({ code: c.code, label: c.label.trim() || c.code, rate: c.rate }));
  const registration = normalizeRegistration(input.registration);
  const problem = taxSettingsProblem({ ...input, components, registration });
  if (problem) throw new Error(problem);
  const { data, error } = await supabase.rpc('set_tax_settings', {
    p_province: input.province,
    p_components: components,
    p_registration: registration,
  });
  if (error) throw toError(error, 'The tax settings could not be saved.');
  const parsed = parseTaxSettings((data ?? null) as Record<string, unknown> | null);
  if (!parsed) throw new Error('The tax settings were saved, but could not be read back. Reload the page.');
  remember(workshopId, parsed);
  return parsed;
}

// Cache shared by every screen that shows totals ---------------------------------------------------------------------

const cache = new Map<string, Promise<TaxSettings>>();
const listeners = new Set<(workshopId: string, s: TaxSettings) => void>();

function remember(workshopId: string, s: TaxSettings) {
  cache.set(workshopId, Promise.resolve(s));
  for (const l of listeners) l(workshopId, s);
}

/** Cached load: one request per workshop for the whole session (refreshed when saved here). */
export function getTaxSettings(workshopId: string, fresh = false): Promise<TaxSettings> {
  let p = fresh ? undefined : cache.get(workshopId);
  if (!p) {
    p = loadTaxSettings(workshopId);
    cache.set(workshopId, p);
    p.catch(() => cache.delete(workshopId));
  }
  return p;
}

export interface TaxSettingsHook {
  /** Null while loading or when it failed. */
  settings: TaxSettings | null;
  /** The components to compute with: the shop's, or GST 5% while loading or when they cannot be read. */
  components: TaxComponent[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Replaces the cached settings after a save. */
  setSettings: (s: TaxSettings) => void;
}

/** The signed-in staff member's workshop tax settings, cached. */
export function useTaxSettings(): TaxSettingsHook {
  const { user } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const [settings, setLocal] = useState<TaxSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!workshopId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    getTaxSettings(workshopId, tick > 0)
      .then((s) => {
        if (!active) return;
        setLocal(s);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : 'The tax settings could not be loaded.');
      })
      .finally(() => active && setLoading(false));
    const onChange = (w: string, s: TaxSettings) => {
      if (w === workshopId && active) setLocal(s);
    };
    listeners.add(onChange);
    return () => {
      active = false;
      listeners.delete(onChange);
    };
  }, [workshopId, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setSettings = useCallback(
    (s: TaxSettings) => {
      if (workshopId) remember(workshopId, s);
      setLocal(s);
      setError(null);
    },
    [workshopId],
  );

  return { settings, components: settings?.components ?? FALLBACK_TAX_COMPONENTS, loading, error, reload, setSettings };
}

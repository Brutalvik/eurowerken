/**
 * The workshop's sales taxes on the customer site (supabase/migrations/029_canadian_taxes.sql). Anyone can read the
 * taxes of a published site; signed-in customers of the workshop can also read them. When they cannot be read (an
 * older database, a network error) estimates fall back to GST 5%, the same as before taxes could be set.
 */
import { useEffect, useState } from 'react';
import { FALLBACK_TAX_COMPONENTS, parseTaxSettings } from '@eurowerken/shared';
import type { TaxComponent, TaxSettings } from '@eurowerken/shared';
import { supabase } from '@/lib/supabase';
import { useSite } from '@/site/SiteContext';

const cache = new Map<string, Promise<TaxSettings | null>>();

/** The workshop's tax settings, or null when they cannot be read. Never throws. */
export function getWorkshopTaxes(workshopId: string): Promise<TaxSettings | null> {
  let p = cache.get(workshopId);
  if (!p) {
    p = (async () => {
      try {
        const { data, error } = await supabase.from('workshop_tax_settings').select('*').eq('workshop_id', workshopId).maybeSingle();
        if (error || !data) return null;
        return parseTaxSettings(data as Record<string, unknown>);
      } catch {
        return null;
      }
    })();
    cache.set(workshopId, p);
    // Retry on the next use when it failed.
    void p.then((s) => {
      if (!s) cache.delete(workshopId);
    });
  }
  return p;
}

export interface WorkshopTaxes {
  /** The taxes to show: the workshop's, or GST 5% while loading or when they cannot be read. */
  components: TaxComponent[];
  settings: TaxSettings | null;
  /** True once the workshop's own taxes are loaded (false while loading and on the fallback). */
  ready: boolean;
}

/** The current site's workshop taxes. */
export function useWorkshopTaxes(): WorkshopTaxes {
  const site = useSite();
  const workshopId = site.workshop_id;
  const [settings, setSettings] = useState<TaxSettings | null>(null);

  useEffect(() => {
    if (!workshopId) return;
    let active = true;
    void getWorkshopTaxes(workshopId).then((s) => {
      if (active) setSettings(s);
    });
    return () => {
      active = false;
    };
  }, [workshopId]);

  return { components: settings?.components ?? FALLBACK_TAX_COMPONENTS, settings, ready: settings !== null };
}

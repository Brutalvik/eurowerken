/**
 * Vehicle inspection reports (supabase/migrations/032). Only reports the workshop has sent are returned, by the same
 * check as repair tracking: tracking code + the email or phone the repair was booked with, or the signed-in owner.
 * No staff data is included. The contact is never put in a URL or logged.
 */
import { useCallback, useEffect, useState } from 'react';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { RepairMedia } from './repairs';

export type Condition = 'good' | 'attention' | 'urgent' | 'na';

export interface ReportItem {
  id: string;
  section: string;
  label: string;
  kind: 'condition' | 'measurement';
  condition: Condition | null;
  measurement: number | null;
  unit: string | null;
  note: string | null;
  /** The recommended work on the estimate, if the workshop added it. */
  estimate: { description: string; approval: 'approved' | 'pending' | 'declined' } | null;
  media: RepairMedia[];
}

export interface InspectionReport {
  id: string;
  name: string;
  completed_at: string | null;
  sent_at: string | null;
  summary: string | null;
  items: ReportItem[];
}

type Result<T> = { data: T; error: null } | { data: null; error: string };

function parse(data: unknown): InspectionReport[] {
  if (!Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? 'Vehicle inspection'),
    completed_at: (r.completed_at as string | null) ?? null,
    sent_at: (r.sent_at as string | null) ?? null,
    summary: (r.summary as string | null) ?? null,
    items: (Array.isArray(r.items) ? (r.items as Record<string, unknown>[]) : []).map((i) => {
      const m = i.measurement === null || i.measurement === undefined ? null : Number(i.measurement);
      const c = i.condition;
      return {
        id: String(i.id),
        section: String(i.section ?? ''),
        label: String(i.label ?? ''),
        kind: i.kind === 'measurement' ? 'measurement' : 'condition',
        condition: c === 'good' || c === 'attention' || c === 'urgent' || c === 'na' ? c : null,
        measurement: m !== null && Number.isFinite(m) ? m : null,
        unit: (i.unit as string | null) ?? null,
        note: (i.note as string | null) ?? null,
        estimate: i.estimate && typeof i.estimate === 'object' ? (i.estimate as ReportItem['estimate']) : null,
        media: Array.isArray(i.media) ? (i.media as RepairMedia[]) : [],
      };
    }),
  }));
}

export async function trackInspections(slug: string, code: string, contact: string): Promise<Result<InspectionReport[]>> {
  const { data, error } = await supabase.rpc('track_inspections', { p_slug: slug, p_code: code.trim().toUpperCase(), p_contact: contact.trim() });
  if (error) {
    if (/track_inspections|schema cache|does not exist/i.test(error.message)) return { data: [], error: null };
    return { data: null, error: friendlyError(error.message) };
  }
  return { data: parse(data), error: null };
}

export interface InspectionsState {
  reports: InspectionReport[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** The sent reports of a repair; reloads when refreshKey changes (for example the repair's updated_at). */
export function useInspections(slug: string, code: string, contact: string | null, refreshKey?: string): InspectionsState {
  const [reports, setReports] = useState<InspectionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!slug || !code || !contact) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void trackInspections(slug, code, contact).then((res) => {
      if (!active) return;
      if (res.data === null) setError(res.error);
      else {
        setReports(res.data);
        setError(null);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [slug, code, contact, refreshKey, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { reports, loading, error, reload };
}

import { useCallback, useEffect, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ClipboardCheck, Play } from 'lucide-react';
import { errorMessage, formatDateTime } from '@/api/appointments';
import { STATUS_LABEL, inspectionPath, listInspections, listTemplates, startInspection, subscribeInspections } from '@/api/inspections';
import type { InspectionStatus, InspectionSummary, InspectionTemplate } from '@/api/inspections';
import type { RepairOrder } from '@/api/repairOrders';
import { Badge } from '@/components/ui/Badge';
import type { Tone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dialog, ErrorNote } from '../inventory/PartForm';
import { SectionTitle } from './common';

export const INSPECTION_STATUS_TONE: Record<InspectionStatus, Tone> = { in_progress: 'info', completed: 'violet', sent: 'ok' };

interface InspectionCardProps {
  order: RepairOrder;
  tz: string;
  /** Repair Orders full. */
  canEdit: boolean;
  announce: (message: string) => void;
}

/** The inspections of a repair order: progress and findings, start a new one, continue or view. */
export function InspectionCard({ order, tz, canEdit, announce }: InspectionCardProps) {
  const id = useId();
  const navigate = useNavigate();
  const [list, setList] = useState<InspectionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<InspectionTemplate[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState<string>('');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await listInspections(order.id));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'The inspections could not be loaded.'));
    }
  }, [order.id]);

  useEffect(() => {
    void load();
    const off = subscribeInspections(order.id, () => void load());
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      off();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [order.id, load]);

  const closed = order.status === 'completed' || order.status === 'cancelled';

  async function openStart() {
    setStartError(null);
    let t = templates;
    if (!t) {
      try {
        t = await listTemplates(order.workshop_id);
        setTemplates(t);
      } catch (err) {
        setStartError(errorMessage(err, 'The inspection templates could not be loaded.'));
        setChoosing(true);
        return;
      }
    }
    if (t.length === 1) {
      void start(t[0].id);
      return;
    }
    setChosen((t.find((x) => x.is_default) ?? t[0])?.id ?? '');
    setChoosing(true);
  }

  async function start(templateId: string) {
    if (starting) return;
    setStarting(true);
    setStartError(null);
    try {
      const newId = await startInspection(order.id, templateId || null);
      announce('Inspection started.');
      setChoosing(false);
      navigate(inspectionPath(order.id, newId));
    } catch (err) {
      setStartError(errorMessage(err, 'The inspection could not be started.'));
      setChoosing(true);
    } finally {
      setStarting(false);
    }
  }

  return (
    <Card className="p-4 md:p-5">
      <section aria-labelledby={`${id}-title`} className="space-y-4">
        <SectionTitle
          id={`${id}-title`}
          title="Inspections"
          subtitle="Multi-point checks with photos. Send the report to the customer when it is done."
          action={
            canEdit && !closed ? (
              <Button onClick={() => void openStart()} disabled={starting}>
                <Play className="h-3.5 w-3.5" aria-hidden />
                {starting ? 'Starting...' : 'Start inspection'}
              </Button>
            ) : undefined
          }
        />
        <ErrorNote errors={error} />
        {!choosing && <ErrorNote errors={startError} />}

        {list === null && !error ? (
          <p role="status" className="text-xs text-fg2">
            Loading inspections...
          </p>
        ) : list && list.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-xs text-fg2">
            No inspections yet.{canEdit && !closed ? ' Press Start inspection to begin the checklist.' : ''}
          </p>
        ) : (
          <ul className="space-y-2">
            {(list ?? []).map((i) => {
              const pct = i.counts.total ? Math.round((i.counts.checked / i.counts.total) * 100) : 0;
              const open = i.status === 'in_progress';
              return (
                <li key={i.id} className="rounded-xl glass-field p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                        <ClipboardCheck className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                        <span className="break-words">{i.name}</span>
                        <Badge tone={INSPECTION_STATUS_TONE[i.status]}>{STATUS_LABEL[i.status]}</Badge>
                      </p>
                      <p className="text-[11px] text-fg3">
                        Started {formatDateTime(i.created_at, tz)}
                        {i.sent_at && i.status === 'sent' ? ` · sent ${formatDateTime(i.sent_at, tz)}` : ''}
                        {i.completed_at && i.status === 'completed' ? ` · completed ${formatDateTime(i.completed_at, tz)}` : ''}
                      </p>
                    </div>
                    <Link
                      to={inspectionPath(order.id, i.id)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-xs font-semibold text-fg transition hover:bg-surface2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent coarse:min-h-11"
                    >
                      {open && canEdit ? 'Continue' : 'View'}
                      <span className="sr-only"> {i.name}</span>
                    </Link>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-fg2">
                      <span>
                        {i.counts.checked} of {i.counts.total} checked
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface2" role="progressbar" aria-valuemin={0} aria-valuemax={i.counts.total} aria-valuenow={i.counts.checked} aria-label={`${i.name} progress`}>
                      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {i.counts.urgent > 0 && <Badge tone="bad">{i.counts.urgent} urgent</Badge>}
                      {i.counts.attention > 0 && <Badge tone="warn">{i.counts.attention} attention</Badge>}
                      {i.counts.good > 0 && <Badge tone="ok">{i.counts.good} good</Badge>}
                      {i.counts.na > 0 && <Badge>{i.counts.na} N/A</Badge>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Dialog
        open={choosing}
        title="Start inspection"
        onClose={() => setChoosing(false)}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setChoosing(false)}>
              Cancel
            </Button>
            <Button onClick={() => void start(chosen)} disabled={starting || !templates || templates.length === 0}>
              {starting ? 'Starting...' : 'Start'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <ErrorNote errors={startError} />
          {templates && templates.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-xs font-medium text-fg2">Checklist</legend>
              {templates.map((t) => (
                <label
                  key={t.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm coarse:min-h-11 ${chosen === t.id ? 'border-accent bg-accent/10 text-fg' : 'border-line text-fg2'}`}
                >
                  <input type="radio" name={`${id}-template`} value={t.id} checked={chosen === t.id} onChange={() => setChosen(t.id)} className="h-4 w-4 accent-[rgb(var(--accent))]" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{t.name}</span>
                    <span className="block text-[11px] text-fg3">
                      {t.items.length} items{t.is_default ? ' · default' : ''}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : (
            templates && <p className="text-xs text-fg2">There are no inspection templates yet. A Manager can add one in Settings.</p>
          )}
        </div>
      </Dialog>
    </Card>
  );
}

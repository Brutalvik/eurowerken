import { AlertOctagon, AlertTriangle, CheckCircle2, ClipboardCheck, RotateCcw } from 'lucide-react';
import { useInspections } from '@/api/inspections';
import type { Condition, InspectionReport as Report, ReportItem } from '@/api/inspections';
import { Pill } from '@/components/ui';
import { MediaGrid, formatDay } from './repairUi';

interface InspectionReportProps {
  /** The site slug (site.slug), the tracking code and the verified contact, as CaseDetailsPage has them. */
  slug: string;
  code: string;
  contact: string | null;
  /** The workshop's time zone (repairTimeZone(repair)). */
  timeZone: string;
  /** Changes when the repair changes (for example repair.updated_at), so a newly sent report shows up. */
  refreshKey?: string;
  /** Where the work order with the approve buttons is on the page, for example "#work-order". */
  workOrderHref?: string;
}

const CONDITION_TEXT: Record<Condition, string> = { good: 'Good', attention: 'Needs attention', urgent: 'Urgent', na: 'Not applicable' };

/**
 * The vehicle inspection reports the workshop sent: counts of urgent, attention and good, the findings with urgent
 * first (notes, measurements, photos), then what was checked and fine. Read-only; nothing shows until a report is sent.
 */
export function InspectionReport({ slug, code, contact, timeZone, refreshKey, workOrderHref }: InspectionReportProps) {
  const { reports, loading, error, reload } = useInspections(slug, code, contact, refreshKey);

  if (error) {
    return (
      <section aria-labelledby="inspection-title" className="glass min-w-0 rounded-2xl p-5 sm:p-6">
        <h2 id="inspection-title" className="flex items-center gap-2 font-display text-base font-semibold text-fg">
          <ClipboardCheck className="h-4 w-4 text-accent" aria-hidden />
          Inspection report
        </h2>
        <p role="alert" className="mt-3 text-sm text-bad">
          {error}
        </p>
        <button type="button" onClick={reload} className="btn-outline mt-3 min-h-11 px-3 py-2">
          <RotateCcw className="h-4 w-4" aria-hidden />
          Try again
        </button>
      </section>
    );
  }
  if (loading || reports.length === 0) return null;

  return (
    <>
      {reports.map((r) => (
        <ReportCard key={r.id} report={r} timeZone={timeZone} workOrderHref={workOrderHref} />
      ))}
    </>
  );
}

function ReportCard({ report, timeZone, workOrderHref }: { report: Report; timeZone: string; workOrderHref?: string }) {
  const titleId = `inspection-${report.id}-title`;
  const urgent = report.items.filter((i) => i.condition === 'urgent');
  const attention = report.items.filter((i) => i.condition === 'attention');
  const good = report.items.filter((i) => i.condition === 'good');
  const na = report.items.filter((i) => i.condition === 'na').length;
  const unchecked = report.items.filter((i) => i.condition === null).length;
  const recommended = [...urgent, ...attention].filter((i) => i.estimate?.approval === 'pending').length;

  return (
    <section id={`inspection-${report.id}`} aria-labelledby={titleId} className="glass min-w-0 scroll-mt-24 rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="flex items-center gap-2 font-display text-base font-semibold text-fg">
            <ClipboardCheck className="h-4 w-4 text-accent" aria-hidden />
            {report.name}
          </h2>
          {report.sent_at && <p className="mt-0.5 text-xs text-fg3">Inspection report from {formatDay(report.sent_at, timeZone)}</p>}
        </div>
        <ul className="flex flex-wrap gap-1.5" aria-label="Summary">
          <li>
            <Pill tone="bad">{urgent.length} urgent</Pill>
          </li>
          <li>
            <Pill tone="warn">{attention.length} attention</Pill>
          </li>
          <li>
            <Pill tone="ok">{good.length} good</Pill>
          </li>
        </ul>
      </div>

      {report.summary && <p className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-surface2/60 px-4 py-3 text-sm text-fg">{report.summary}</p>}

      {(urgent.length > 0 || attention.length > 0) && (
        <p className="mt-4 text-sm text-fg2">
          {recommended > 0 ? (
            <>
              Recommended work from this inspection is on your{' '}
              {workOrderHref ? (
                <a href={workOrderHref} className="font-semibold text-accent underline-offset-2 hover:underline">
                  work order
                </a>
              ) : (
                'work order'
              )}
              , where you can approve or decline it.
            </>
          ) : (
            'Questions about these findings? Send us a message below and we will explain the options.'
          )}
        </p>
      )}

      {urgent.length > 0 && <FindingList title="Urgent" items={urgent} tone="urgent" />}
      {attention.length > 0 && <FindingList title="Needs attention" items={attention} tone="attention" />}

      {good.length > 0 && (
        <details className="group mt-5 rounded-xl border border-line">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 text-sm font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-ok" aria-hidden />
              Checked and good ({good.length})
            </span>
            <span className="text-xs font-normal text-fg3 group-open:hidden">Show</span>
            <span className="hidden text-xs font-normal text-fg3 group-open:inline">Hide</span>
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {good.map((i) => (
              <li key={i.id} className="space-y-2 px-4 py-2.5 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-fg">
                    {i.label}
                    <span className="ml-2 text-xs text-fg3">{i.section}</span>
                  </span>
                  {measurementText(i) && <span className="text-xs font-medium text-fg2">{measurementText(i)}</span>}
                </div>
                {i.note && <p className="break-words text-xs text-fg2">{i.note}</p>}
                {i.media.length > 0 && <MediaGrid media={i.media} columns="sm:grid-cols-3" />}
              </li>
            ))}
          </ul>
        </details>
      )}

      {(na > 0 || unchecked > 0) && (
        <p className="mt-3 text-xs text-fg3">
          {[na > 0 ? `${na} not applicable to your vehicle` : '', unchecked > 0 ? `${unchecked} not checked this time` : ''].filter(Boolean).join(' · ')}.
        </p>
      )}
    </section>
  );
}

function measurementText(i: ReportItem): string {
  if (i.measurement === null) return '';
  return `${i.measurement.toLocaleString(undefined, { maximumFractionDigits: 2 })}${i.unit ? ` ${i.unit}` : ''}`;
}

const APPROVAL_TEXT = { pending: 'Recommended, waiting for your approval', approved: 'Approved', declined: 'Declined' } as const;

function FindingList({ title, items, tone }: { title: string; items: ReportItem[]; tone: 'urgent' | 'attention' }) {
  const Icon = tone === 'urgent' ? AlertOctagon : AlertTriangle;
  const color = tone === 'urgent' ? 'text-bad' : 'text-warn';
  const border = tone === 'urgent' ? 'border-l-bad' : 'border-l-warn';
  return (
    <div className="mt-5">
      <h3 className={`flex items-center gap-2 text-sm font-semibold ${color}`}>
        <Icon className="h-4 w-4" aria-hidden />
        {title} ({items.length})
      </h3>
      <ul className="mt-2 space-y-3">
        {items.map((i) => (
          <li key={i.id} className={`space-y-2 rounded-xl border border-line border-l-4 ${border} bg-surface2/40 p-4`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-fg">{i.label}</p>
                <p className="text-xs text-fg3">
                  {i.section}
                  <span className="sr-only">. {CONDITION_TEXT[i.condition ?? 'na']}</span>
                </p>
              </div>
              {measurementText(i) && (
                <span className={`rounded-lg bg-surface px-2.5 py-1 text-sm font-semibold ${color}`}>
                  <span className="sr-only">Measured </span>
                  {measurementText(i)}
                </span>
              )}
            </div>
            {i.note && <p className="whitespace-pre-wrap break-words text-sm text-fg2">{i.note}</p>}
            {i.estimate && (
              <p className="text-xs">
                <Pill tone={i.estimate.approval === 'approved' ? 'ok' : i.estimate.approval === 'declined' ? 'neutral' : 'warn'}>{APPROVAL_TEXT[i.estimate.approval]}</Pill>
                <span className="ml-2 text-fg2">{i.estimate.description}</span>
              </p>
            )}
            {i.media.length > 0 && <MediaGrid media={i.media} columns="sm:grid-cols-3" />}
          </li>
        ))}
      </ul>
    </div>
  );
}

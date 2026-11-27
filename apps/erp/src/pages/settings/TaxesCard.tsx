import { useEffect, useId, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  MAX_PST_NUMBER,
  MAX_TAX_COMPONENTS,
  MAX_TAX_LABEL,
  PROVINCES,
  TAX_CODES,
  TAX_CODE_NAME,
  computeTaxes,
  defaultTaxComponents,
  formatRegistrationNumber,
  formatTaxLabel,
  formatTaxRate,
  gstHstNumberProblem,
  isProvinceCode,
  pstNumberProblem,
  qstNumberProblem,
  sumTaxes,
  taxComponentsProblem,
} from '@eurowerken/shared';
import type { ProvinceCode, TaxCode, TaxComponent, TaxSettings } from '@eurowerken/shared';
import { saveTaxSettings, useTaxSettings } from '@/api/taxes';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/format';
import { ErrorNote, Labeled, inputClass } from '../inventory/PartForm';

/** One tax row as typed: the rate stays text until it is saved. */
interface DraftTax {
  key: string;
  code: TaxCode;
  label: string;
  percent: string;
}

interface Draft {
  province: ProvinceCode;
  taxes: DraftTax[];
  gst_hst_number: string;
  pst_number: string;
  qst_number: string;
}

let nextKey = 0;
const newKey = () => `tax-${++nextKey}`;

/** 0.09975 -> "9.975" */
function percentText(rate: number): string {
  return formatTaxRate(rate).replace('%', '');
}

/** "9.975" -> 0.09975; null when it is not a percentage with at most 4 decimals. */
function parsePercent(text: string): number | null {
  const t = text.trim().replace(',', '.').replace(/%$/, '').trim();
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(t)) return null;
  return Math.round(Number(t) * 10_000) / 1_000_000;
}

function toDraftTaxes(components: TaxComponent[]): DraftTax[] {
  return components.map((c) => ({ key: newKey(), code: c.code, label: c.label, percent: percentText(c.rate) }));
}

function toDraft(s: TaxSettings): Draft {
  return {
    province: s.province,
    taxes: toDraftTaxes(s.components),
    gst_hst_number: formatRegistrationNumber(s.registration.gst_hst_number),
    pst_number: s.registration.pst_number ?? '',
    qst_number: formatRegistrationNumber(s.registration.qst_number),
  };
}

/** The draft as components, or the first problem with a rate. */
function draftComponents(d: Draft): { components: TaxComponent[]; problem: string | null } {
  const components: TaxComponent[] = [];
  for (const t of d.taxes) {
    const rate = parsePercent(t.percent);
    const label = t.label.trim() || t.code;
    if (rate === null) return { components, problem: `Enter the rate of ${label} as a percentage, for example 5 or 9.975.` };
    components.push({ code: t.code, label, rate });
  }
  return { components, problem: null };
}

function sameDraft(a: Draft, b: Draft): boolean {
  const strip = (d: Draft) => ({ ...d, taxes: d.taxes.map(({ code, label, percent }) => ({ code, label: label.trim(), percent: percent.trim() })) });
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

/** Settings, Taxes: the province, the taxes the shop charges and its registration numbers (migration 029). */
export function TaxesCard() {
  const id = useId();
  const { user, can } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const canEdit = can('settings', 'full');
  const tax = useTaxSettings();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [announce, setAnnounce] = useState('');

  // Start from the saved settings (and again after someone saves them here).
  useEffect(() => {
    if (!tax.settings) return;
    const d = toDraft(tax.settings);
    setSaved(d);
    setDraft((cur) => (cur && saved && !sameDraft(cur, saved) ? cur : d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tax.settings]);

  const parsed = useMemo(() => (draft ? draftComponents(draft) : null), [draft]);
  const componentsProblem = parsed ? (parsed.problem ?? taxComponentsProblem(parsed.components)) : null;
  const gstProblem = draft ? gstHstNumberProblem(draft.gst_hst_number) : null;
  const pstProblem = draft ? pstNumberProblem(draft.pst_number) : null;
  const qstProblem = draft ? qstNumberProblem(draft.qst_number) : null;
  const dirty = draft !== null && saved !== null && !sameDraft(draft, saved);

  const example = useMemo(() => {
    if (!parsed || parsed.problem || parsed.components.length === 0) return null;
    const lines = computeTaxes(100, parsed.components);
    const parts = lines.map((l) => `${l.label} ${formatCurrency(l.amount)}`).join(', ');
    return `On ${formatCurrency(100)} of work: ${parts}, total ${formatCurrency(100 + sumTaxes(lines))}.`;
  }, [parsed]);

  if (!workshopId) return null;

  function update(patch: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setError(null);
  }

  function updateTax(key: string, patch: Partial<DraftTax>) {
    setDraft((d) => {
      if (!d) return d;
      return {
        ...d,
        taxes: d.taxes.map((t) => {
          if (t.key !== key) return t;
          const next = { ...t, ...patch };
          // A label still equal to the old code follows the new code.
          if (patch.code && (t.label.trim() === '' || t.label.trim() === t.code)) next.label = patch.code;
          return next;
        }),
      };
    });
    setError(null);
  }

  function chooseProvince(code: string) {
    if (!draft || !isProvinceCode(code)) return;
    const components = defaultTaxComponents(code);
    update({ province: code, taxes: toDraftTaxes(components) });
    const name = PROVINCES.find((p) => p.code === code)?.name ?? code;
    setAnnounce(`${name}: ${components.map((c) => formatTaxLabel(c)).join(' and ')} filled in. Check them and save.`);
  }

  function addTax() {
    if (!draft || draft.taxes.length >= MAX_TAX_COMPONENTS) return;
    const used = new Set(draft.taxes.map((t) => t.code));
    const code = TAX_CODES.find((c) => !used.has(c) && c !== 'HST') ?? TAX_CODES.find((c) => !used.has(c)) ?? 'PST';
    update({ taxes: [...draft.taxes, { key: newKey(), code, label: code, percent: '' }] });
  }

  function removeTax(key: string) {
    if (!draft || draft.taxes.length <= 1) return;
    update({ taxes: draft.taxes.filter((t) => t.key !== key) });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft || !parsed || !workshopId || !canEdit) return;
    const problem = componentsProblem ?? gstProblem ?? pstProblem ?? qstProblem;
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const s = await saveTaxSettings(workshopId, {
        province: draft.province,
        components: parsed.components,
        registration: { gst_hst_number: draft.gst_hst_number, pst_number: draft.pst_number, qst_number: draft.qst_number },
      });
      const d = toDraft(s);
      setSaved(d);
      setDraft(d);
      tax.setSettings(s);
      setAnnounce('Taxes saved. New estimates and invoices use them; invoices already issued keep their taxes.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The taxes could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  const codes = draft ? new Set(draft.taxes.map((t) => t.code)) : new Set<TaxCode>();
  const showPst = draft !== null && (codes.has('PST') || codes.has('RST') || draft.pst_number.trim() !== '');
  const showQst = draft !== null && (codes.has('QST') || draft.qst_number.trim() !== '');

  return (
    <Card className="p-4 md:p-5">
      <CardHeader
        title="Taxes"
        subtitle="The sales taxes on estimates, the tracking page and invoices. Each tax is charged on the taxable work (no tax on tax). Invoices already issued keep the taxes they were issued with."
      />
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {tax.loading && !draft && <p className="text-xs text-fg2">Loading...</p>}
      {!draft && tax.error && (
        <div className="space-y-2">
          <ErrorNote errors={tax.error} />
          <Button variant="ghost" onClick={tax.reload}>
            Try again
          </Button>
        </div>
      )}
      {draft && (
        <form onSubmit={(e) => void submit(e)} className="space-y-4" aria-describedby={`${id}-example`}>
          {!canEdit && <p className="text-xs text-fg2">You can see the taxes. Changing them needs full access to Settings.</p>}

          <div className="max-w-xs">
            <Labeled id={`${id}-province`} label="Province or territory" hint="Choosing one fills in its usual taxes. You can change them before saving.">
              <select id={`${id}-province`} value={draft.province} disabled={!canEdit || saving} onChange={(e) => chooseProvince(e.target.value)} className={inputClass}>
                {PROVINCES.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Labeled>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-medium text-fg2">Taxes charged ({draft.taxes.length} of {MAX_TAX_COMPONENTS} at most)</legend>
            <ul className="space-y-2">
              {draft.taxes.map((t, i) => (
                <li key={t.key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_6.5rem_auto] items-end gap-2">
                  <Labeled id={`${id}-${t.key}-code`} label={i === 0 ? 'Type' : ''}>
                    <select
                      id={`${id}-${t.key}-code`}
                      value={t.code}
                      disabled={!canEdit || saving}
                      onChange={(e) => updateTax(t.key, { code: e.target.value as TaxCode })}
                      aria-label={`Type of tax ${i + 1}`}
                      className={inputClass}
                    >
                      {TAX_CODES.map((c) => (
                        <option key={c} value={c} title={TAX_CODE_NAME[c]}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Labeled>
                  <Labeled id={`${id}-${t.key}-label`} label={i === 0 ? 'Label on documents' : ''}>
                    <input
                      id={`${id}-${t.key}-label`}
                      value={t.label}
                      maxLength={MAX_TAX_LABEL}
                      disabled={!canEdit || saving}
                      onChange={(e) => updateTax(t.key, { label: e.target.value })}
                      aria-label={`Label of tax ${i + 1}`}
                      placeholder={t.code}
                      className={inputClass}
                    />
                  </Labeled>
                  <Labeled id={`${id}-${t.key}-rate`} label={i === 0 ? 'Rate (%)' : ''}>
                    <input
                      id={`${id}-${t.key}-rate`}
                      inputMode="decimal"
                      value={t.percent}
                      disabled={!canEdit || saving}
                      onChange={(e) => updateTax(t.key, { percent: e.target.value })}
                      aria-label={`Rate of tax ${i + 1} in percent`}
                      aria-invalid={parsePercent(t.percent) === null}
                      placeholder="5"
                      className={`${inputClass} tabular-nums`}
                    />
                  </Labeled>
                  <div className="pb-0.5">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => removeTax(t.key)}
                        disabled={draft.taxes.length <= 1 || saving}
                        aria-label={`Remove ${t.label || t.code}`}
                        className="rounded-lg p-2 text-fg3 transition hover:bg-surface2 hover:text-bad disabled:cursor-not-allowed disabled:opacity-40 coarse:min-h-11 coarse:min-w-11"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {canEdit && draft.taxes.length < MAX_TAX_COMPONENTS && (
              <Button variant="ghost" size="sm" onClick={addTax} disabled={saving}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add a tax
              </Button>
            )}
            <p className="text-[11px] text-fg3">
              GST is federal. HST combines GST and the provincial tax (Ontario and the Atlantic provinces). PST, QST and RST are provincial taxes charged
              next to GST. Rates are a percentage with up to 4 decimals, from 0 to 25.
            </p>
            {componentsProblem && (
              <p className="text-[11px] text-bad" role="status">
                {componentsProblem}
              </p>
            )}
          </fieldset>

          <p id={`${id}-example`} className="rounded-xl glass-field px-3 py-2 text-xs text-fg" aria-live="polite">
            {example ?? 'Fix the rates above to see an example.'}
          </p>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-xs font-medium text-fg2">Registration numbers (printed on invoices)</legend>
            <div>
              <Labeled id={`${id}-gst`} label="GST/HST number" hint="9 digits, RT and 4 digits, for example 123456789 RT0001.">
                <input
                  id={`${id}-gst`}
                  value={draft.gst_hst_number}
                  maxLength={20}
                  disabled={!canEdit || saving}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => update({ gst_hst_number: e.target.value })}
                  aria-invalid={gstProblem !== null}
                  className={inputClass}
                />
              </Labeled>
              {gstProblem && <p className="mt-1 text-[11px] text-bad">{gstProblem}</p>}
            </div>
            {showPst && (
              <div>
                <Labeled id={`${id}-pst`} label={codes.has('RST') ? 'RST / PST number' : 'PST number'} hint={`As your province issued it, at most ${MAX_PST_NUMBER} characters.`}>
                  <input
                    id={`${id}-pst`}
                    value={draft.pst_number}
                    maxLength={MAX_PST_NUMBER}
                    disabled={!canEdit || saving}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => update({ pst_number: e.target.value })}
                    aria-invalid={pstProblem !== null}
                    className={inputClass}
                  />
                </Labeled>
                {pstProblem && <p className="mt-1 text-[11px] text-bad">{pstProblem}</p>}
              </div>
            )}
            {showQst && (
              <div>
                <Labeled id={`${id}-qst`} label="QST number" hint="10 digits, TQ and 4 digits, for example 1234567890 TQ0001.">
                  <input
                    id={`${id}-qst`}
                    value={draft.qst_number}
                    maxLength={22}
                    disabled={!canEdit || saving}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => update({ qst_number: e.target.value })}
                    aria-invalid={qstProblem !== null}
                    className={inputClass}
                  />
                </Labeled>
                {qstProblem && <p className="mt-1 text-[11px] text-bad">{qstProblem}</p>}
              </div>
            )}
          </fieldset>

          <ErrorNote errors={error} />

          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={saving || !dirty}>
                {saving ? 'Saving...' : 'Save taxes'}
              </Button>
              {dirty && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (saved) setDraft(saved);
                    setError(null);
                  }}
                  disabled={saving}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  Undo changes
                </Button>
              )}
              {!dirty && tax.settings?.updated_at && <span className="text-[11px] text-fg3">Saved.</span>}
            </div>
          )}
        </form>
      )}
    </Card>
  );
}

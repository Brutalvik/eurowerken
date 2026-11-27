import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Car, CheckCircle2, Download, FileUp, History, Pause, Play, Users, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Dialog, ErrorNote, inputClass } from '../../inventory/PartForm';
import { saveBlob } from '@/api/dataExport';
import {
  PRESETS,
  addSummary,
  autoMap,
  batches,
  checkRows,
  detectSource,
  emptySummary,
  fieldsFor,
  forgetMapping,
  guessDateOrder,
  importBatch,
  problemRowsCsv,
  readCsvFile,
  requiredFor,
  saveMapping,
} from '@/api/dataImport';
import type { CheckedRow, DateOrder, FieldKey, ImportKind, ImportOptions, ImportSummary, Mapping, ParsedCsv, SourceId } from '@/api/dataImport';
import { ProgressBar } from './ProgressBar';

const STEPS = ['Choose what', 'Upload', 'Source', 'Columns', 'Preview', 'Dry run', 'Import'] as const;
type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const KINDS: { id: ImportKind; title: string; body: string; icon: typeof Users }[] = [
  { id: 'customers', title: 'Customers and their vehicles', body: 'A customer list. Rows may also hold a vehicle (one row per car is fine).', icon: Users },
  { id: 'vehicles', title: 'Vehicles only', body: 'A separate vehicle file that points to customers by their old id, email or phone.', icon: Car },
  { id: 'history', title: 'Service history', body: 'Past repair orders or invoices: date, RO number, work done, mileage, total.', icon: History },
];

type Run =
  | { status: 'idle' }
  | { status: 'running'; next: number; acc: ImportSummary }
  | { status: 'paused'; next: number; acc: ImportSummary; reason: string }
  | { status: 'done'; acc: ImportSummary };

const MAX_SHOWN = 100;

/**
 * The import wizard: choose what, upload a CSV, confirm the source system, map columns, preview, dry run, import.
 * Nothing is written before the user confirms after the dry run. The import runs in batches of at most 500 rows,
 * can be paused and resumed, and pauses by itself when the server cannot be reached or a batch reports a problem the
 * dry run did not. Re-sending a batch is safe: the database merges instead of duplicating.
 */
export function ImportWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>(0);
  const [kind, setKind] = useState<ImportKind>('customers');
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [source, setSource] = useState<SourceId>('generic');
  const [detected, setDetected] = useState<SourceId>('generic');
  const [customName, setCustomName] = useState('');
  const [mapping, setMapping] = useState<Mapping>({});
  const [opts, setOpts] = useState<ImportOptions>({ dateOrder: 'MDY', unit: 'km' });
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [dry, setDry] = useState<Run>({ status: 'idle' });
  const [real, setReal] = useState<Run>({ status: 'idle' });
  const [confirmed, setConfirmed] = useState(false);
  const pauseRef = useRef(false);

  const preset = PRESETS.find((p) => p.id === source) ?? PRESETS[PRESETS.length - 1];
  const sourceLabel = source === 'generic' ? customName.trim() || 'CSV' : preset.label;

  const checked = useMemo(() => (parsed ? checkRows(parsed, kind, mapping, opts) : []), [parsed, kind, mapping, opts]);
  const sendable = useMemo(() => checked.filter((c) => c.errors.length === 0), [checked]);
  const clientErrors = checked.length - sendable.length;
  const withWarnings = checked.filter((c) => c.errors.length === 0 && c.warnings.length > 0).length;
  const missingRequired = requiredFor(kind).filter((r) => !r.anyOf.some((f) => mapping[f]));
  const parts = useMemo(() => batches(sendable.map((c) => c.values)), [sendable]);

  const running = dry.status === 'running' || real.status === 'running';
  const imported = real.status !== 'idle';

  const reset = () => {
    setStep(0);
    setParsed(null);
    setFileName('');
    setFileError(null);
    setMapping({});
    setDry({ status: 'idle' });
    setReal({ status: 'idle' });
    setConfirmed(false);
    setSavedNote(null);
  };

  const close = () => {
    if (running) {
      pauseRef.current = true;
      return; // the run pauses after the batch in flight; closing again stops there
    }
    reset();
    onClose();
  };

  // A change to what is imported or how voids the dry run.
  const invalidate = () => {
    setDry({ status: 'idle' });
    setConfirmed(false);
  };

  const remap = (k: ImportKind, s: SourceId, p: ParsedCsv) => {
    setMapping(autoMap(p.headers, k, s));
    const presetUnit = PRESETS.find((x) => x.id === s)?.unit ?? 'km';
    setOpts((o) => ({ ...o, unit: presetUnit }));
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    if (file.size > 50 * 1024 * 1024) {
      setFileError('This file is over 50 MB. Split it into smaller files and import them one after the other.');
      return;
    }
    if (/\.(xlsx|xls|numbers)$/i.test(file.name)) {
      setFileError('This is a spreadsheet file, not a CSV. In Excel choose File > Save As > CSV UTF-8, then upload that file.');
      return;
    }
    try {
      const p = await readCsvFile(file);
      if (p.headers.length === 0 || p.rows.length === 0) {
        setFileError('No rows found. The file needs a header row and at least one row of data.');
        return;
      }
      setParsed(p);
      setFileName(file.name);
      const d = detectSource(p.headers).id;
      setDetected(d);
      setSource(d);
      remap(kind, d, p);
      const dateCol = p.headers.find((h) => /date/i.test(h));
      if (dateCol) {
        const i = p.headers.indexOf(dateCol);
        setOpts((o) => ({ ...o, dateOrder: guessDateOrder(p.rows.slice(0, 500).map((r) => r[i] ?? '')) }));
      }
      invalidate();
      setReal({ status: 'idle' });
    } catch (err) {
      setFileError(err instanceof Error ? `The file could not be read: ${err.message}` : 'The file could not be read.');
    }
  };

  const runBatches = async (dryRun: boolean, startAt: number, start: ImportSummary) => {
    const set = dryRun ? setDry : setReal;
    const dryErrorRows = new Set(dry.status === 'done' ? dry.acc.errors.map((e) => e.row) : []);
    pauseRef.current = false;
    let acc = start;
    set({ status: 'running', next: startAt, acc });
    for (let i = startAt; i < parts.length; i++) {
      if (pauseRef.current) {
        set({ status: 'paused', next: i, acc, reason: 'Paused. Nothing more is sent until you resume.' });
        return;
      }
      let r: ImportSummary;
      try {
        r = await importBatch(kind, parts[i], sourceLabel, dryRun);
      } catch (err) {
        set({
          status: 'paused',
          next: i,
          acc,
          reason: `Batch ${i + 1} of ${parts.length} did not go through: ${err instanceof Error ? err.message : 'unknown error'} Resume sends it again; rows already saved are merged, not doubled.`,
        });
        return;
      }
      acc = addSummary(acc, r);
      const fresh = dryRun ? [] : r.errors.filter((e) => !dryErrorRows.has(e.row));
      if (fresh.length > 0 && i + 1 < parts.length) {
        set({
          status: 'paused',
          next: i + 1,
          acc,
          reason: `Batch ${i + 1} had ${fresh.length} problem ${fresh.length === 1 ? 'row' : 'rows'} the dry run did not show (someone may have changed customers meanwhile). Check them below, then resume or stop here.`,
        });
        return;
      }
      set({ status: 'running', next: i + 1, acc });
    }
    set({ status: 'done', acc });
  };

  const startDry = () => {
    setConfirmed(false);
    void runBatches(true, 0, { ...emptySummary(), skipped: 0 });
  };

  const startImport = () => {
    if (!confirmed || dry.status !== 'done') return;
    void runBatches(false, 0, emptySummary());
  };

  const resume = () => {
    if (real.status === 'paused') void runBatches(false, real.next, real.acc);
    else if (dry.status === 'paused') void runBatches(true, dry.next, dry.acc);
  };

  const downloadProblems = () => {
    if (!parsed) return;
    const summary = real.status !== 'idle' ? real.acc : dry.status !== 'idle' ? dry.acc : null;
    const csv = problemRowsCsv(parsed, checked, summary);
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `problem-rows-${fileName.replace(/\.[^.]+$/, '') || 'import'}.csv`);
  };

  // Navigation ---------------------------------------------------------------------------------------------------

  const canNext: Record<Step, boolean> = {
    0: true,
    1: parsed !== null,
    2: true,
    3: missingRequired.length === 0,
    4: sendable.length > 0,
    5: dry.status === 'done' && confirmed,
    6: false,
  };

  const next = () => {
    if (step === 5) {
      setStep(6);
      startImport();
      return;
    }
    if (step < 6 && canNext[step]) setStep((step + 1) as Step);
  };
  const back = () => {
    if (step > 0 && !running && !imported) setStep((step - 1) as Step);
  };

  const nextLabel =
    step === 5 ? `Import ${sendable.length.toLocaleString('en-CA')} rows` : step === 4 ? 'Continue to the dry run' : 'Next';

  const footer = (
    <>
      {parsed && (step >= 4 || imported) && (clientErrors > 0 || withWarnings > 0 || dry.status === 'done' || imported) && (
        <Button variant="ghost" onClick={downloadProblems} className="mr-auto">
          <Download className="h-3.5 w-3.5" aria-hidden />
          Download problem rows
        </Button>
      )}
      {step > 0 && !imported && (
        <Button variant="ghost" onClick={back} disabled={running}>
          Back
        </Button>
      )}
      {step < 6 && (
        <Button onClick={next} disabled={!canNext[step] || running}>
          {nextLabel}
        </Button>
      )}
      {step === 6 && (real.status === 'done' || real.status === 'paused') && (
        <Button variant={real.status === 'done' ? 'primary' : 'ghost'} onClick={close}>
          {real.status === 'done' ? 'Done' : 'Stop here and close'}
        </Button>
      )}
    </>
  );

  return (
    <Dialog open={open} title={`Import: ${STEPS[step]}`} onClose={close} footer={footer}>
      <div className="space-y-4 text-xs">
        <Stepper step={step} />
        {running && <p className="sr-only">Working</p>}

        {step === 0 && (
          <div className="space-y-3">
            <p className="text-fg2">What is in the file? Import customers first, then vehicles or history from the same system, so they can be matched.</p>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="What to import">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.id}
                  onClick={() => {
                    setKind(k.id);
                    if (parsed) remap(k.id, source, parsed);
                    invalidate();
                  }}
                  className={`flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition hover:bg-surface2 coarse:min-h-11 ${
                    kind === k.id ? 'border-accent bg-accent/10' : 'border-line'
                  }`}
                >
                  <k.icon className="h-4 w-4 text-accent" aria-hidden />
                  <span className="font-semibold text-fg">{k.title}</span>
                  <span className="text-[11px] text-fg2">{k.body}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <label
              htmlFor="import-file"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void onFile(e.dataTransfer.files[0]);
              }}
              className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-line px-4 py-8 text-center hover:bg-surface2"
            >
              <FileUp className="h-6 w-6 text-fg3" aria-hidden />
              <span className="font-semibold text-fg">Choose a CSV file or drop it here</span>
              <span className="text-[11px] text-fg3">Comma or semicolon separated, UTF-8 or Excel. The file stays on this computer until you import.</span>
              <input id="import-file" type="file" accept=".csv,.txt,.tsv,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
            </label>
            <ErrorNote errors={fileError} />
            {parsed && (
              <div role="status" className="rounded-xl glass-field px-3 py-2 text-fg2">
                <p className="font-semibold text-fg">{fileName}</p>
                <p>
                  {parsed.rows.length.toLocaleString('en-CA')} rows, {parsed.headers.length} columns, {parsed.delimiter === ';' ? 'semicolon' : parsed.delimiter === '\t' ? 'tab' : 'comma'} separated, {parsed.encoding}.
                </p>
                <p className="mt-1 break-words text-[11px] text-fg3">Columns: {parsed.headers.join(', ')}</p>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-fg2">
              {detected !== 'generic'
                ? `This looks like an export from ${PRESETS.find((p) => p.id === detected)?.label}. Change it if that is wrong.`
                : 'Which system is the file from? This picks the column names to look for; you check every match next.'}
            </p>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Source system">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={source === p.id}
                  onClick={() => {
                    setSource(p.id);
                    if (parsed) remap(kind, p.id, parsed);
                    invalidate();
                  }}
                  className={`rounded-lg border p-3 text-left transition hover:bg-surface2 coarse:min-h-11 ${source === p.id ? 'border-accent bg-accent/10' : 'border-line'}`}
                >
                  <span className="flex items-center gap-2 font-semibold text-fg">
                    {p.label}
                    {p.id === detected && p.id !== 'generic' && <Badge tone="ok">Detected</Badge>}
                  </span>
                  <span className="mt-1 block text-[11px] text-fg2">{p.howTo}</span>
                </button>
              ))}
            </div>
            {source === 'generic' && (
              <div>
                <label htmlFor="import-source-name" className="mb-1 block font-medium text-fg2">
                  Name of the old system (shown as "Imported from ...")
                </label>
                <input
                  id="import-source-name"
                  className={inputClass}
                  value={customName}
                  maxLength={60}
                  placeholder="CSV"
                  onChange={(e) => {
                    setCustomName(e.target.value);
                    invalidate();
                  }}
                />
              </div>
            )}
            <p className="text-[11px] text-fg3">
              Use the same choice for every file from one system: customer and vehicle ids are matched within that system.
            </p>
          </div>
        )}

        {step === 3 && parsed && (
          <MappingStep
            kind={kind}
            parsed={parsed}
            mapping={mapping}
            opts={opts}
            missing={missingRequired.map((m) => m.label)}
            onMapping={(m) => {
              setMapping(m);
              setSavedNote(null);
              invalidate();
            }}
            onOpts={(o) => {
              setOpts(o);
              invalidate();
            }}
            presetLabel={sourceLabel}
            savedNote={savedNote}
            onSave={() => {
              saveMapping(source, kind, mapping);
              setSavedNote(`Saved. Files from ${sourceLabel} will use these matches next time.`);
            }}
            onReset={() => {
              forgetMapping(source, kind);
              setMapping(autoMap(parsed.headers, kind, source));
              setSavedNote('Back to the standard matches.');
              invalidate();
            }}
          />
        )}

        {step === 4 && parsed && (
          <PreviewStep kind={kind} rows={checked} total={checked.length} clientErrors={clientErrors} withWarnings={withWarnings} />
        )}

        {step === 5 && (
          <div className="space-y-3">
            <p className="text-fg2">
              The dry run asks the database exactly what would happen to each row, and saves nothing.
              {parts.length > 1 &&
                ` The file goes in ${parts.length} batches of up to 500 rows; each batch is checked on its own, so a customer repeated in two batches shows as new in both here but is merged when imported.`}
            </p>
            {dry.status === 'idle' && (
              <Button onClick={startDry} disabled={sendable.length === 0}>
                <Play className="h-3.5 w-3.5" aria-hidden />
                Run the dry run ({sendable.length.toLocaleString('en-CA')} rows)
              </Button>
            )}
            <RunStatus run={dry} batches={parts.length} dryRun onPause={() => (pauseRef.current = true)} onResume={resume} />
            {dry.status === 'done' && (
              <>
                <Summary kind={kind} s={dry.acc} clientErrors={clientErrors} dryRun />
                <label className="flex items-start gap-2 rounded-lg border border-line p-3 text-fg coarse:min-h-11">
                  <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                  <span>
                    I have checked this summary. Import {sendable.length.toLocaleString('en-CA')} rows from {sourceLabel} into EuroWerken.
                    {clientErrors + dry.acc.skipped > 0 && ` ${clientErrors + dry.acc.skipped} rows with problems will be left out.`}
                  </span>
                </label>
                <Button variant="ghost" size="sm" onClick={startDry}>
                  Run the dry run again
                </Button>
              </>
            )}
          </div>
        )}

        {step === 6 && (
          <div className="space-y-3">
            <RunStatus run={real} batches={parts.length} onPause={() => (pauseRef.current = true)} onResume={resume} />
            {real.status !== 'idle' && <Summary kind={kind} s={real.acc} clientErrors={clientErrors} done={real.status === 'done'} />}
            {real.status === 'done' && (
              <p className="flex items-center gap-1.5 font-semibold text-ok">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Import finished. Imported customers are on the Customers page; past visits are in Service history.
              </p>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function Stepper({ step }: { step: Step }) {
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label="Steps">
      {STEPS.map((s, i) => (
        <li
          key={s}
          aria-current={i === step ? 'step' : undefined}
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
            i === step ? 'bg-accent text-accent-fg' : i < step ? 'bg-accent/15 text-accent' : 'bg-surface2 text-fg3'
          }`}
        >
          {i + 1}. {s}
        </li>
      ))}
    </ol>
  );
}

function MappingStep({
  kind,
  parsed,
  mapping,
  opts,
  missing,
  onMapping,
  onOpts,
  presetLabel,
  savedNote,
  onSave,
  onReset,
}: {
  kind: ImportKind;
  parsed: ParsedCsv;
  mapping: Mapping;
  opts: ImportOptions;
  missing: string[];
  onMapping: (m: Mapping) => void;
  onOpts: (o: ImportOptions) => void;
  presetLabel: string;
  savedNote: string | null;
  onSave: () => void;
  onReset: () => void;
}) {
  const sample = (header: string | undefined) => {
    if (!header) return '';
    const i = parsed.headers.indexOf(header);
    return parsed.rows.map((r) => r[i]).find((v) => v && v.trim()) ?? '';
  };
  const used = new Set(Object.values(mapping));
  const unmapped = parsed.headers.filter((h) => !used.has(h));
  const fields = fieldsFor(kind);
  const groups = Array.from(new Set(fields.map((f) => f.group)));
  const required = new Set(requiredFor(kind).flatMap((r) => r.anyOf));
  const hasDates = kind === 'history';
  const hasMiles = fields.some((f) => (f.key === 'odometer_km' || f.key === 'mileage_km') && mapping[f.key]);

  return (
    <div className="space-y-4">
      <p className="text-fg2">Each EuroWerken field and the column of your file it comes from. Check the matches; change any that are wrong.</p>
      {missing.length > 0 ? (
        <div role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-bad">
          Still needed: {missing.join('; ')}.
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-ok">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          Every required field has a column.
        </p>
      )}
      {(hasDates || hasMiles) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {hasDates && (
            <div>
              <label htmlFor="import-date-order" className="mb-1 block font-medium text-fg2">
                Dates like 03/04/2021 are
              </label>
              <select
                id="import-date-order"
                className={inputClass}
                value={opts.dateOrder}
                onChange={(e) => onOpts({ ...opts, dateOrder: e.target.value as DateOrder })}
              >
                <option value="MDY">Month/Day/Year (US, Canada)</option>
                <option value="DMY">Day/Month/Year (Europe)</option>
                <option value="YMD">Year-Month-Day</option>
              </select>
            </div>
          )}
          {hasMiles && (
            <div>
              <label htmlFor="import-unit" className="mb-1 block font-medium text-fg2">
                Mileage in the file is in
              </label>
              <select id="import-unit" className={inputClass} value={opts.unit} onChange={(e) => onOpts({ ...opts, unit: e.target.value as 'km' | 'mi' })}>
                <option value="km">Kilometres</option>
                <option value="mi">Miles (turned into km)</option>
              </select>
            </div>
          )}
        </div>
      )}
      {groups.map((g) => (
        <fieldset key={g} className="space-y-2">
          <legend className="text-[10px] font-medium uppercase tracking-wider text-fg3">{g}</legend>
          <div className="divide-y divide-line/60 rounded-lg border border-line">
            {fields
              .filter((f) => f.group === g)
              .map((f) => (
                <div key={f.key} className="grid items-center gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <label htmlFor={`map-${f.key}`} className="min-w-0 font-medium text-fg">
                    {f.label}
                    {required.has(f.key) && <span className="ml-1 text-[10px] font-normal text-fg3">(one of the required)</span>}
                    {f.hint && <span className="block text-[10px] font-normal text-fg3">{f.hint}</span>}
                  </label>
                  <select
                    id={`map-${f.key}`}
                    className={inputClass}
                    value={mapping[f.key] ?? ''}
                    onChange={(e) => {
                      const m: Mapping = { ...mapping };
                      const v = e.target.value;
                      if (v) {
                        for (const k of Object.keys(m) as FieldKey[]) if (m[k] === v) delete m[k];
                        m[f.key] = v;
                      } else delete m[f.key];
                      onMapping(m);
                    }}
                  >
                    <option value="">Not in the file</option>
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                  <span className="min-w-0 truncate text-[11px] text-fg3" title={sample(mapping[f.key])}>
                    {mapping[f.key] ? sample(mapping[f.key]) || '(empty in the file)' : ''}
                  </span>
                </div>
              ))}
          </div>
        </fieldset>
      ))}
      {unmapped.length > 0 && (
        <p className="text-[11px] text-fg3">
          Not imported: {unmapped.join(', ')}. Map a column to a field above to import it, for example into the notes.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onSave}>
          Save these matches for {presetLabel}
        </Button>
        <Button variant="ghost" size="sm" onClick={onReset}>
          Reset to the standard matches
        </Button>
        {savedNote && (
          <span role="status" className="text-[11px] text-fg2">
            {savedNote}
          </span>
        )}
      </div>
    </div>
  );
}

const PREVIEW_COLUMNS: Record<ImportKind, FieldKey[]> = {
  customers: ['name', 'first_name', 'last_name', 'email', 'phone', 'make', 'model', 'vin', 'plate'],
  vehicles: ['customer_ref', 'email', 'phone', 'year', 'make', 'model', 'vin', 'plate'],
  history: ['service_date', 'ro_number', 'description', 'total', 'mileage_km', 'email', 'vin', 'plate'],
};

function PreviewStep({
  kind,
  rows,
  total,
  clientErrors,
  withWarnings,
}: {
  kind: ImportKind;
  rows: CheckedRow[];
  total: number;
  clientErrors: number;
  withWarnings: number;
}) {
  const labels = new Map(fieldsFor(kind).map((f) => [f.key, f.label]));
  const cols = PREVIEW_COLUMNS[kind].filter((k) => rows.some((r) => r.values[k]));
  const shown = rows.slice(0, 20);
  return (
    <div className="space-y-3">
      <p className="text-fg2">
        The first {shown.length} of {total.toLocaleString('en-CA')} rows as EuroWerken will read them.{' '}
        {clientErrors > 0 && <strong className="text-bad">{clientErrors} rows cannot be imported. </strong>}
        {withWarnings > 0 && <strong className="text-warn">{withWarnings} rows will be imported with a note. </strong>}
        {clientErrors === 0 && withWarnings === 0 && 'No problems found so far.'}
      </p>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[640px] text-left text-[11px]">
          <thead className="bg-surface2 text-fg3">
            <tr>
              <th className="px-2 py-1.5 font-medium">Line</th>
              {cols.map((c) => (
                <th key={c} className="px-2 py-1.5 font-medium">
                  {labels.get(c)}
                </th>
              ))}
              <th className="px-2 py-1.5 font-medium">Problems</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {shown.map((r) => (
              <tr key={r.line} className={r.errors.length ? 'bg-bad/5' : ''}>
                <td className="px-2 py-1.5 text-fg3">{r.line}</td>
                {cols.map((c) => (
                  <td key={c} className="max-w-[12rem] truncate px-2 py-1.5 text-fg" title={r.values[c]}>
                    {r.values[c] ?? ''}
                  </td>
                ))}
                <td className="px-2 py-1.5">
                  {r.errors.map((e) => (
                    <span key={e} className="flex items-start gap-1 text-bad">
                      <XCircle className="mt-px h-3 w-3 shrink-0" aria-hidden />
                      {e}
                    </span>
                  ))}
                  {r.warnings.map((w) => (
                    <span key={w} className="flex items-start gap-1 text-warn">
                      <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
                      {w}
                    </span>
                  ))}
                  {r.errors.length === 0 && r.warnings.length === 0 && <span className="text-ok">OK</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-fg3">Rows that cannot be imported are left out. Download them, fix them in the file and import that file again.</p>
    </div>
  );
}

function RunStatus({
  run,
  batches: total,
  dryRun,
  onPause,
  onResume,
}: {
  run: Run;
  batches: number;
  dryRun?: boolean;
  onPause: () => void;
  onResume: () => void;
}) {
  if (run.status === 'idle') return null;
  const done = run.status === 'done' ? total : run.next;
  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2 text-fg2">
        <span>
          {run.status === 'done'
            ? dryRun
              ? 'Dry run finished. Nothing was saved.'
              : 'All batches sent.'
            : `${dryRun ? 'Checking' : 'Importing'}: batch ${Math.min(done + 1, total)} of ${total}`}
        </span>
        {run.status === 'running' && !dryRun && (
          <Button variant="ghost" size="sm" onClick={onPause}>
            <Pause className="h-3.5 w-3.5" aria-hidden />
            Pause
          </Button>
        )}
        {run.status === 'paused' && (
          <Button size="sm" onClick={onResume}>
            <Play className="h-3.5 w-3.5" aria-hidden />
            Resume
          </Button>
        )}
      </div>
      <ProgressBar fraction={total ? done / total : 1} label={dryRun ? 'Dry run progress' : 'Import progress'} />
      {run.status === 'paused' && (
        <div role="alert" className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-fg">
          {run.reason}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-fg';
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <p className={`text-base font-semibold ${color}`}>{value.toLocaleString('en-CA')}</p>
      <p className="text-[11px] text-fg3">{label}</p>
    </div>
  );
}

function Summary({ kind, s, clientErrors, dryRun, done }: { kind: ImportKind; s: ImportSummary; clientErrors: number; dryRun?: boolean; done?: boolean }) {
  const will = dryRun ? 'will be ' : done ? '' : 'so far ';
  const noun = kind === 'history' ? 'visits' : kind === 'vehicles' ? 'vehicles' : 'customers';
  const secondary: ReactNode[] = [];
  if (kind !== 'customers' && s.contacts.created + s.contacts.merged > 0) {
    secondary.push(`${s.contacts.created} new customers ${will}added from these rows and ${s.contacts.merged} matched to existing ones`);
  }
  if (kind !== 'vehicles' && s.vehicles.created + s.vehicles.merged + s.vehicles.updated > 0) {
    secondary.push(`vehicles: ${s.vehicles.created} new, ${s.vehicles.merged + s.vehicles.updated} matched to cars on file`);
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={`new ${noun} ${dryRun ? 'to add' : 'added'}`} value={s.created} tone="ok" />
        <Stat label={`matched to ${noun} on file and completed`} value={s.merged + s.updated} />
        <Stat label="already up to date (nothing new)" value={s.unchanged} />
        <Stat label="rows left out (problems)" value={s.skipped + clientErrors} tone={s.skipped + clientErrors > 0 ? 'bad' : undefined} />
      </div>
      {s.linked > 0 && <p className="text-fg2">{s.linked} customers {dryRun ? 'will be' : 'were'} linked to their online account (same email or phone) instead of being copied.</p>}
      {secondary.length > 0 && <p className="text-fg2">Also: {secondary.join('; ')}.</p>}
      {s.errors.length > 0 && <ProblemList title="Rows the database refused" items={s.errors} tone="bad" />}
      {s.warnings.length > 0 && <ProblemList title="Notes (imported, with a change)" items={s.warnings} tone="warn" />}
    </div>
  );
}

function ProblemList({ title, items, tone }: { title: string; items: { row: number; message: string }[]; tone: 'bad' | 'warn' }) {
  return (
    <details className="rounded-lg border border-line px-3 py-2" open={tone === 'bad'}>
      <summary className={`cursor-pointer font-semibold ${tone === 'bad' ? 'text-bad' : 'text-warn'}`}>
        {title} ({items.length})
      </summary>
      <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-fg2">
        {items.slice(0, MAX_SHOWN).map((p, i) => (
          <li key={`${p.row}-${i}`}>
            <span className="text-fg3">Line {p.row}:</span> {p.message}
          </li>
        ))}
        {items.length > MAX_SHOWN && <li className="text-fg3">and {items.length - MAX_SHOWN} more. Download the problem rows to see them all.</li>}
      </ul>
    </details>
  );
}

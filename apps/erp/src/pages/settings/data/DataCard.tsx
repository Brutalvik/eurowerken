import { useState } from 'react';
import { Download, FileUp, Loader2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ErrorNote } from '../../inventory/PartForm';
import { exportAllData, saveBlob } from '@/api/dataExport';
import type { ExportProgress, ExportResult } from '@/api/dataExport';
import { ImportWizard } from './ImportWizard';
import { ProgressBar } from './ProgressBar';

/**
 * Settings > Data: download everything the shop has in EuroWerken (free, any time), and bring customers, vehicles
 * and service history over from another shop system.
 */
export function DataCard() {
  const { user, can } = useAuth();
  const workshop = user?.workshop ?? null;
  const canExport = can('settings', 'full') || user?.role === 'Manager';
  const canImport = can('customers', 'full') || can('settings', 'full');

  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const busy = progress !== null;

  const runExport = async () => {
    if (!workshop) return;
    setError(null);
    setResult(null);
    setProgress({ fraction: 0, label: 'Starting' });
    try {
      const r = await exportAllData({ id: workshop.id, name: workshop.name }, setProgress);
      saveBlob(r.blob, r.fileName);
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The export could not be made.');
    } finally {
      setProgress(null);
    }
  };

  const totalRows = result?.files.reduce((n, f) => n + f.rows, 0) ?? 0;

  return (
    <div className="max-w-3xl space-y-4">
      <Card className="p-4 sm:p-5">
        <CardHeader
          title="Download all your data"
          subtitle="Your data is yours. One .zip of spreadsheet (CSV) files, free, as often as you like."
        />
        <div className="space-y-3 text-xs">
          <p className="text-fg2">
            Customers (online accounts and imported contacts), vehicles, appointments, repair orders and their lines,
            approvals, messages, invoices, payments, parts, suppliers, purchase orders and inspections. A README.txt in
            the zip explains every file.
          </p>
          {!canExport && <p className="text-fg3">Only a Manager, or a role with full Settings access, can download the shop's data.</p>}
          {busy && progress && (
            <div role="status" aria-live="polite" className="space-y-1.5">
              <div className="flex items-center gap-2 text-fg2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Reading {progress.label}...
              </div>
              <ProgressBar fraction={progress.fraction} label="Export progress" />
            </div>
          )}
          <ErrorNote errors={error} />
          {result && (
            <div role="status" className="rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-fg">
              <p className="font-semibold">
                Downloaded {result.fileName}: {result.files.length} files, {totalRows.toLocaleString('en-CA')} rows.
              </p>
              {result.skipped.length > 0 && (
                <p className="mt-1 text-fg2">Not in this shop's database yet, so not included: {result.skipped.join('; ')}.</p>
              )}
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => saveBlob(result.blob, result.fileName)}>
                Download again
              </Button>
            </div>
          )}
          <Button onClick={() => void runExport()} disabled={!canExport || busy || !workshop}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            {busy ? 'Preparing...' : 'Download all your data'}
          </Button>
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <CardHeader
          title="Import from another shop system"
          subtitle="Shopmonkey, Tekmetric, AutoLeap, Protractor, Mitchell 1 or any spreadsheet"
        />
        <div className="space-y-3 text-xs">
          <p className="text-fg2">
            Bring over your customers, their vehicles and their past service history. You see a preview and a dry run
            before anything is saved. Nothing already in EuroWerken is overwritten, and importing the same file twice
            does not create duplicates.
          </p>
          <p className="text-fg3">Tip: download your data first, so you have a copy from before the import.</p>
          {!canImport && <p className="text-fg3">Importing needs full access to Customers or Settings.</p>}
          <Button onClick={() => setWizardOpen(true)} disabled={!canImport || !workshop}>
            <FileUp className="h-3.5 w-3.5" aria-hidden />
            Start an import
          </Button>
        </div>
      </Card>

      <ImportWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}

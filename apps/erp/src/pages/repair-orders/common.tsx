import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog, ErrorNote } from '../inventory/PartForm';

/** A small square icon button; 44 px on touch screens. */
export const iconButton =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg2 transition hover:bg-surface2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent coarse:h-11 coarse:w-11';

export const textLink =
  'inline-flex min-w-0 items-center gap-1.5 break-all rounded text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent coarse:min-h-11';

/** A card section heading with an optional action on the right. */
export function SectionTitle({ id, title, subtitle, action }: { id: string; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 id={id} className="font-display text-sm font-semibold text-fg">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-[11px] text-fg2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asks before something that cannot be undone. Cancel (keep) has the focus first. */
export function Confirm({ open, title, message, confirmLabel, busyLabel, busy, error, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      role="alertdialog"
      size="sm"
      closeOnBackdrop
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} data-autofocus>
            Keep it
          </Button>
          <Button onClick={onConfirm} disabled={busy} className="!bg-bad">
            {busy ? busyLabel : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-xs text-fg2">
        <div>{message}</div>
        <ErrorNote errors={error} />
      </div>
    </Dialog>
  );
}

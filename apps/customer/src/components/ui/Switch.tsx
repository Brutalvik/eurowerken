import { useId } from 'react';
import type { LucideIcon } from 'lucide-react';

/** On/off switch with a visible label. */
export function Switch({
  label,
  description,
  icon: Icon,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  icon?: LucideIcon;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3 py-1 coarse:min-h-11">
      <span className="min-w-0">
        <span id={`${id}-label`} className="flex items-center gap-2 text-sm text-fg">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-fg3" aria-hidden />}
          {label}
        </span>
        {description && (
          <span id={`${id}-desc`} className="mt-0.5 block text-xs text-fg3">
            {description}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="flex h-11 shrink-0 items-center rounded-full px-0.5 disabled:opacity-60"
      >
        <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${checked ? 'bg-accent' : 'bg-fg3/40'}`}>
          <span
            className={`inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
          />
        </span>
      </button>
    </div>
  );
}

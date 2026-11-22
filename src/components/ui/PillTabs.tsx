interface PillTabsProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

export function PillTabs<T extends string>({ options, value, onChange, label }: PillTabsProps<T>) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option)}
            className={`rounded-lg px-3 py-1.5 text-xs transition ${
              active
                ? 'bg-accent font-semibold text-white'
                : 'border border-line bg-surface text-fg2 hover:text-fg'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

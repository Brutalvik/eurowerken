interface PillTabsProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

export function PillTabs<T extends string>({ options, value, onChange, label }: PillTabsProps<T>) {
  return (
    // Phones: one row that scrolls sideways. Wider screens: wraps.
    <div
      role="tablist"
      aria-label={label}
      className="no-scrollbar -mx-4 flex min-w-0 gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
    >
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option)}
            className={`shrink-0 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs transition coarse:min-h-11 coarse:px-3.5 ${
              active ? 'glass-active font-semibold' : 'glass-field text-fg2 hover:text-fg'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

import { Search } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder, className = 'w-full sm:w-56' }: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg3" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="glass-field w-full rounded-xl py-2 pl-8 pr-3 text-xs text-fg outline-none transition placeholder:text-fg3 focus:border-accent coarse:min-h-11"
      />
    </div>
  );
}

import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'ghost';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANTS: Record<Variant, string> = {
  // Translucent cobalt with a light top edge; solid accent with dark text in high contrast (index.css).
  primary:
    'bg-accent text-accent-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_6px_18px_-8px_rgb(var(--accent)/0.7)] hover:brightness-110 active:brightness-95 [[data-contrast=high]_&]:shadow-none',
  ghost: 'glass-field text-fg2 hover:bg-surface2/70 hover:text-fg',
};

const SIZES: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs coarse:min-h-9 coarse:px-3',
  md: 'px-3.5 py-2 text-xs font-semibold coarse:min-h-11',
};

export function Button({ variant = 'primary', size = 'md', className = '', type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl transition-[filter,background-color,color,transform] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    />
  );
}

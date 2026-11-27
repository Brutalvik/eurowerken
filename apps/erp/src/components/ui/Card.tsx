import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`glass rounded-2xl ${className}`}>{children}</section>;
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function CardHeader({ title, subtitle, action }: CardHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight text-fg">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-fg2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

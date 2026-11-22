import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ImageIcon } from 'lucide-react';

interface PhotoProps {
  /** File in public/images, without extension. Tried as .jpg, then .png. */
  name: string;
  alt: string;
  className?: string;
  icon?: LucideIcon;
  /** Label on the placeholder, shown while the real photo is missing. */
  label?: string;
}

/**
 * A photo slot. Shows public/images/<name>.jpg (or .png) when the file
 * exists, otherwise a styled placeholder so the layout never breaks.
 */
export function Photo({ name, alt, className = '', icon: Icon = ImageIcon, label }: PhotoProps) {
  const sources = [`/images/${name}.jpg`, `/images/${name}.png`];
  const [index, setIndex] = useState(0);

  if (index < sources.length) {
    return (
      <img
        src={sources[index]}
        alt={alt}
        loading="lazy"
        onError={() => setIndex((i) => i + 1)}
        className={`object-cover ${className}`}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={alt}
      className={`flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-surface2 via-surface to-accent/10 text-fg3 ${className}`}
    >
      <Icon className="h-8 w-8 opacity-60" aria-hidden />
      {label && <span className="px-3 text-center text-[11px] font-medium opacity-80">{label}</span>}
    </div>
  );
}

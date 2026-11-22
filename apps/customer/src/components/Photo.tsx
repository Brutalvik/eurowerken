import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ImageIcon } from 'lucide-react';

interface PhotoProps {
  /** Full image URL (for example a workshop upload). Tried first when given. */
  src?: string;
  /** File in public/images, without extension. Tried as .png, .jpg, then .webp, after src. */
  name?: string;
  alt: string;
  className?: string;
  icon?: LucideIcon;
  /** Label on the placeholder, shown while the real photo is missing. */
  label?: string;
  /** cover fills the box (cropping); contain shows the whole image, for cut-outs like the hero car. */
  fit?: 'cover' | 'contain';
}

/**
 * A photo slot. Shows `src` when given and it loads, then public/images/<name>.png
 * (or .jpg, .webp) when the file exists, otherwise a styled placeholder so the
 * layout never breaks.
 */
export function Photo({ src, name, alt, className = '', icon: Icon = ImageIcon, label, fit = 'cover' }: PhotoProps) {
  // .png first for cut-outs with a transparent background, then .jpg, then .webp.
  const sources = [
    ...(src ? [src] : []),
    ...(name ? [`/images/${name}.png`, `/images/${name}.jpg`, `/images/${name}.webp`] : []),
  ];
  const [index, setIndex] = useState(0);
  // A different picture in the same slot starts again from its first source.
  const [shown, setShown] = useState(`${src ?? ''}|${name ?? ''}`);
  const id = `${src ?? ''}|${name ?? ''}`;
  if (shown !== id) {
    setShown(id);
    setIndex(0);
  }

  if (index < sources.length) {
    return (
      <img
        src={sources[index]}
        alt={alt}
        loading="lazy"
        onError={() => setIndex((i) => i + 1)}
        className={`${fit === 'contain' ? 'object-contain' : 'object-cover'} ${className}`}
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

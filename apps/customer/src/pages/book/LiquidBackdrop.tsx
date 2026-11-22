/**
 * Soft blurred blobs in the workshop colour that drift slowly behind the
 * frosted panels. Decorative; still under prefers-reduced-motion.
 */
export function LiquidBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="book-blob-a absolute -left-24 top-10 h-72 w-72 rounded-full bg-accent/15 blur-3xl sm:h-96 sm:w-96 dark:bg-accent/10" />
      <div className="book-blob-b absolute -right-20 top-1/3 h-80 w-80 rounded-full bg-accent/10 blur-3xl sm:h-[28rem] sm:w-[28rem]" />
      <div className="book-blob-c absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-accent/10 blur-3xl sm:h-80 sm:w-80 dark:bg-accent/10" />
      <div className="book-blob-b absolute left-1/2 top-4 h-40 w-40 rounded-full bg-white/60 blur-3xl dark:bg-white/5" />
    </div>
  );
}

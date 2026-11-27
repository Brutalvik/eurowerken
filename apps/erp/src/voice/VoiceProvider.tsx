import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { VoiceOverlay } from './VoiceOverlay';
import { speechSupported } from './speech';

interface VoiceContextValue {
  /** Opens the command overlay. listen: start the microphone straight away (the mic buttons); otherwise type. */
  openVoice: (opts?: { listen?: boolean }) => void;
  /** The browser can listen (Web Speech API). Typing works everywhere. */
  supported: boolean;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<{ listen: boolean } | null>(null);
  const supported = useMemo(() => speechSupported(), []);

  const openVoice = useCallback((opts?: { listen?: boolean }) => setOpen({ listen: Boolean(opts?.listen) && supported }), [supported]);

  // Cmd+K / Ctrl+K opens the command bar from anywhere (typing; press the mic to talk).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => o ?? { listen: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const value = useMemo(() => ({ openVoice, supported }), [openVoice, supported]);
  return (
    <VoiceContext.Provider value={value}>
      {children}
      {open && <VoiceOverlay startListening={open.listen} supported={supported} onClose={() => setOpen(null)} />}
    </VoiceContext.Provider>
  );
}

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice must be used inside VoiceProvider');
  return ctx;
}

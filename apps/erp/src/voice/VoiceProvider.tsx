import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { VoiceOverlay } from './VoiceOverlay';
import { speechSupported } from './speech';

interface VoiceContextValue {
  /** Opens the command overlay. listen: start the microphone straight away (only when voice is on). */
  openVoice: (opts?: { listen?: boolean }) => void;
  /** Voice can be used right now: turned on in Settings and the browser can listen. Typing always works. */
  supported: boolean;
  /** The Settings choice on this device (off by default). */
  voiceEnabled: boolean;
  setVoiceEnabled: (on: boolean) => void;
  /** The browser has speech recognition at all (Web Speech API). */
  speechAvailable: boolean;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);
const VOICE_KEY = 'ew-erp-voice';

function readEnabled(): boolean {
  try {
    return localStorage.getItem(VOICE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function VoiceProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<{ listen: boolean } | null>(null);
  const speechAvailable = useMemo(() => speechSupported(), []);
  const [voiceEnabled, setEnabledState] = useState(readEnabled);
  const supported = voiceEnabled && speechAvailable;

  const setVoiceEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    try {
      localStorage.setItem(VOICE_KEY, on ? 'on' : 'off');
    } catch {
      // Not saved; the choice lasts until reload.
    }
  }, []);

  const openVoice = useCallback(
    (opts?: { listen?: boolean }) => {
      if (voiceEnabled) setOpen({ listen: Boolean(opts?.listen) && supported });
    },
    [voiceEnabled, supported],
  );

  // Voice turned off: close the bar if it was open.
  useEffect(() => {
    if (!voiceEnabled) setOpen(null);
  }, [voiceEnabled]);

  // Cmd+K / Ctrl+K opens the command bar from anywhere, only while voice commands are on.
  useEffect(() => {
    if (!voiceEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => o ?? { listen: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [voiceEnabled]);

  const value = useMemo(
    () => ({ openVoice, supported, voiceEnabled, setVoiceEnabled, speechAvailable }),
    [openVoice, supported, voiceEnabled, setVoiceEnabled, speechAvailable],
  );
  return (
    <VoiceContext.Provider value={value}>
      {children}
      {open && voiceEnabled && <VoiceOverlay startListening={open.listen} supported={supported} voiceEnabled={voiceEnabled} onClose={() => setOpen(null)} />}
    </VoiceContext.Provider>
  );
}

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice must be used inside VoiceProvider');
  return ctx;
}

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Keyboard, Loader2, Mic, MicOff, Sparkles, X } from 'lucide-react';
import { useNavItems } from '@/components/layout/navItems';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { parseCommand, suggestionsFor } from './intents';
import type { Intent, NavTarget } from './intents';
import { listen } from './speech';
import type { Listener, SpeechError } from './speech';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Phase = 'idle' | 'listening' | 'working';

const ERRORS: Record<SpeechError, string> = {
  denied: 'The microphone is blocked for this site. Allow it in the browser, or type the command below.',
  'no-speech': 'I did not hear anything. Press the microphone and try again, or type the command.',
  'no-mic': 'No microphone was found. Type the command below.',
  network: 'Speech recognition needs an internet connection. Type the command below.',
  other: 'Listening stopped. Press the microphone to try again, or type the command.',
};

/** The frosted command overlay: live transcript, listening state, one-tap suggestions and a typed fallback. */
export function VoiceOverlay({ startListening, supported, onClose }: { startListening: boolean; supported: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { toggleContrast, setContrast, highContrast, setMode, toggle: toggleTheme } = useTheme();
  const items = useNavItems();
  const pages: NavTarget[] = useMemo(() => items.map((i) => ({ path: i.key, label: i.label })), [items]);
  const suggestions = useMemo(() => suggestionsFor(pages), [pages]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [typed, setTyped] = useState('');
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const listener = useRef<Listener | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const statusId = useId();

  const close = useCallback(() => {
    listener.current?.abort();
    listener.current = null;
    onClose();
  }, [onClose]);

  /** Runs an intent with the app's own navigation, page actions and switches. Returns true when it did something. */
  const run = useCallback(
    async (intent: Intent): Promise<boolean> => {
      switch (intent.kind) {
        case 'navigate':
          navigate(`/${intent.path}`);
          close();
          return true;
        case 'page-action':
          navigate(`/${intent.path}`, { state: { voiceAction: intent.action } });
          close();
          return true;
        case 'search-history':
          // Router state, not the URL: searches can hold names, plates and phone numbers.
          navigate('/service-history', { state: { q: intent.query } });
          close();
          return true;
        case 'open-repair': {
          setPhase('working');
          setMessage({ tone: 'info', text: `Looking for ${intent.number}...` });
          const { data, error } = await supabase.from('repair_orders').select('id').eq('number', intent.number).limit(1).maybeSingle();
          setPhase('idle');
          if (error) {
            setMessage({ tone: 'error', text: `${intent.number} could not be opened: ${error.message}` });
            return false;
          }
          if (!data) {
            setMessage({ tone: 'error', text: `There is no ${intent.number} in this workshop.` });
            return false;
          }
          navigate(`/repair-orders/${data.id as string}`);
          close();
          return true;
        }
        case 'contrast':
          if (intent.on === 'toggle') toggleContrast();
          else setContrast(intent.on ? 'high' : 'standard');
          close();
          return true;
        case 'theme':
          if (intent.mode === 'toggle') toggleTheme();
          else setMode(intent.mode);
          if (highContrast && intent.mode !== 'toggle') setContrast('standard');
          close();
          return true;
        case 'back':
          navigate(-1);
          close();
          return true;
        default:
          setMessage({ tone: 'error', text: `Sorry, I did not understand "${intent.text.trim()}". Try one of the suggestions below.` });
          return false;
      }
    },
    [navigate, close, toggleContrast, setContrast, toggleTheme, setMode, highContrast],
  );

  const runText = useCallback((text: string) => run(parseCommand(text, pages)), [run, pages]);

  const startMic = useCallback(() => {
    listener.current?.abort();
    setMessage(null);
    setTranscript('');
    setPhase('listening');
    listener.current = listen({
      onText: setTranscript,
      onFinal: (text) => {
        setTranscript(text);
        void runText(text);
      },
      onError: (err) => setMessage({ tone: 'error', text: ERRORS[err] }),
      onEnd: () => {
        listener.current = null;
        setPhase((p) => (p === 'listening' ? 'idle' : p));
      },
    });
    if (!listener.current) setPhase('idle');
  }, [runText]);

  const stopMic = useCallback(() => listener.current?.stop(), []);

  // Open: listen straight away from the mic buttons; otherwise put the cursor in the text field.
  useEffect(() => {
    if (startListening) startMic();
    else input.current?.focus();
    return () => listener.current?.abort();
    // Only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While open, the page behind does not scroll.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = typed.trim();
    if (!text) return;
    setTranscript(text);
    void runText(text);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab' || !panel.current) return;
    const els = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (els.length === 0) return;
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const listening = phase === 'listening';
  const status = listening
    ? 'Listening...'
    : phase === 'working'
      ? 'Working on it...'
      : supported
        ? 'Press the microphone and say a command, or type it.'
        : 'Voice is not available in this browser. Type a command.';

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex animate-fade-in items-end justify-center bg-bg/55 p-0 backdrop-blur-sm sm:items-center sm:p-6 [[data-contrast=high]_&]:bg-bg/90 [[data-contrast=high]_&]:backdrop-blur-none"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={statusId}
        onKeyDown={onKeyDown}
        className="glass-strong pb-safe w-full max-w-lg animate-glass-in rounded-t-3xl p-5 text-fg sm:rounded-3xl sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="flex items-center gap-2 font-display text-[15px] font-semibold">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden />
            Command
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close commands"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-fg2 transition hover:bg-fg/10 hover:text-fg coarse:h-11 coarse:w-11"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* The orb: tap to listen or stop. */}
        <div className="mt-5 flex flex-col items-center gap-3">
          <div className="relative flex h-28 w-28 items-center justify-center">
            {listening && (
              <>
                <span aria-hidden className="absolute inset-0 animate-voice-pulse rounded-full bg-accent/25 [[data-contrast=high]_&]:hidden" />
                <span aria-hidden className="absolute inset-3 animate-voice-pulse rounded-full bg-accent/30 [animation-delay:200ms] [[data-contrast=high]_&]:hidden" />
              </>
            )}
            <button
              type="button"
              disabled={!supported || phase === 'working'}
              onClick={listening ? stopMic : startMic}
              aria-pressed={listening}
              aria-label={listening ? 'Stop listening' : 'Start listening'}
              className={`relative flex h-20 w-20 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                listening
                  ? 'border-accent/60 bg-accent text-accent-fg shadow-[0_0_40px_-6px_rgb(var(--accent)/0.8)]'
                  : 'glass border-line/60 text-accent hover:brightness-110'
              } [[data-contrast=high]_&]:border-2 [[data-contrast=high]_&]:border-fg [[data-contrast=high]_&]:shadow-none`}
            >
              {phase === 'working' ? (
                <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
              ) : supported ? (
                <Mic className="h-7 w-7" aria-hidden />
              ) : (
                <MicOff className="h-7 w-7" aria-hidden />
              )}
            </button>
          </div>
          <p id={statusId} role="status" aria-live="polite" className="text-center text-xs text-fg2">
            {listening && <span className="mr-1 inline-block h-2 w-2 rounded-full bg-bad align-middle" aria-hidden />}
            {status}
          </p>
          <p className="min-h-[1.75rem] text-center font-display text-lg font-semibold tracking-tight text-fg" aria-live="polite">
            {transcript ? `"${transcript}"` : ''}
          </p>
          {message && (
            <p role={message.tone === 'error' ? 'alert' : 'status'} className={`text-center text-xs ${message.tone === 'error' ? 'text-bad' : 'text-fg2'}`}>
              {message.text}
            </p>
          )}
        </div>

        {/* Typing always works, with or without a microphone. */}
        <form onSubmit={onSubmit} className="mt-4 flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Keyboard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg3" aria-hidden />
            <input
              ref={input}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type a command, e.g. Open RO-0001"
              aria-label="Type a command"
              autoComplete="off"
              className="glass-field w-full rounded-xl py-2.5 pl-9 pr-3 text-sm text-fg outline-none transition placeholder:text-fg3 focus:border-accent coarse:min-h-11"
            />
          </div>
          <button
            type="submit"
            disabled={!typed.trim() || phase === 'working'}
            aria-label="Run command"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg transition hover:brightness-110 disabled:opacity-40 coarse:h-11 coarse:w-11"
          >
            <CornerDownLeft className="h-4 w-4" aria-hidden />
          </button>
        </form>

        <div className="mt-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-fg3">Try</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={phase === 'working'}
                onClick={() => {
                  setTranscript(s);
                  void runText(s);
                }}
                className="glass-field rounded-full px-3 py-1.5 text-xs text-fg transition hover:border-accent/60 hover:text-accent coarse:min-h-11"
              >
                {s}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-fg3">
            Shortcut: <kbd className="rounded border border-line px-1 font-sans">⌘</kbd> <kbd className="rounded border border-line px-1 font-sans">K</kbd> or{' '}
            <kbd className="rounded border border-line px-1 font-sans">Ctrl</kbd> <kbd className="rounded border border-line px-1 font-sans">K</kbd>
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

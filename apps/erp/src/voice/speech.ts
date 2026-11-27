/**
 * A small wrapper over the Web Speech API (SpeechRecognition, or webkitSpeechRecognition in Safari and Chrome).
 * Typed locally because not every TypeScript DOM library includes it.
 */

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: RecognitionResult };
}
interface RecognitionErrorEvent {
  readonly error: string;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && ctor() !== null;
}

export type SpeechError = 'denied' | 'no-speech' | 'no-mic' | 'network' | 'other';

export interface Listener {
  stop(): void;
  abort(): void;
}

/**
 * Listens for one command. onText gets the live transcript (interim and final); onFinal the finished phrase;
 * onEnd always runs last. Returns null when the browser has no speech recognition.
 */
export function listen(handlers: {
  onText: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (error: SpeechError) => void;
  onEnd: () => void;
}): Listener | null {
  const C = ctor();
  if (!C) return null;
  const rec = new C();
  rec.lang = navigator.language || 'en-CA';
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  let finalText = '';
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    handlers.onText((finalText + interim).trim());
  };
  rec.onerror = (e) => {
    const map: Record<string, SpeechError> = {
      'not-allowed': 'denied',
      'service-not-allowed': 'denied',
      'no-speech': 'no-speech',
      'audio-capture': 'no-mic',
      network: 'network',
      aborted: 'other',
    };
    if (e.error !== 'aborted') handlers.onError(map[e.error] ?? 'other');
  };
  rec.onend = () => {
    if (finalText.trim()) handlers.onFinal(finalText.trim());
    handlers.onEnd();
  };
  try {
    rec.start();
  } catch {
    handlers.onError('other');
    handlers.onEnd();
    return null;
  }
  return { stop: () => rec.stop(), abort: () => rec.abort() };
}

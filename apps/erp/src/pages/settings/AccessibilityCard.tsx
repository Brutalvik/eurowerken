import { useId } from 'react';
import type { ReactNode } from 'react';
import { Contrast, Mic } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { useTheme } from '@/theme/ThemeProvider';
import { useVoice } from '@/voice/VoiceProvider';

/** One labelled on/off switch with an explanation underneath. */
function SwitchRow({ icon: Icon, label, hint, checked, onChange, extra }: {
  icon: LucideIcon;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  extra?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-fg2" aria-hidden />
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="text-sm font-semibold text-fg">
          {label}
        </label>
        <p id={`${id}-hint`} className="mt-0.5 text-[13px] text-fg2">
          {hint}
        </p>
        {extra}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={`${id}-hint`}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
          checked ? 'border-accent bg-accent' : 'border-line/60 bg-fg3/30'
        } [[data-contrast=high]_&]:border-2 [[data-contrast=high]_&]:border-fg`}
      >
        <span className="sr-only">{checked ? 'On' : 'Off'}</span>
        <span
          aria-hidden
          className={`absolute h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-1'}`}
        />
      </button>
    </div>
  );
}

/** Settings for this device: voice commands and high contrast. */
export function AccessibilityCard() {
  const { voiceEnabled, setVoiceEnabled, speechAvailable } = useVoice();
  const { highContrast, setContrast } = useTheme();

  return (
    <Card className="max-w-3xl p-4 sm:p-5">
      <CardHeader title="Accessibility" subtitle="These choices apply to this device and browser only, like light or dark mode." />
      <div className="divide-y divide-line/30">
        <SwitchRow
          icon={Mic}
          label="Voice commands"
          hint={
            voiceEnabled
              ? 'On: the microphone buttons listen for commands such as "Open RO-0001" or "New appointment". The browser asks for microphone access the first time.'
              : 'Off: no microphone is used. Commands can still be typed in the command bar (Cmd+K or Ctrl+K).'
          }
          checked={voiceEnabled}
          onChange={setVoiceEnabled}
          extra={
            voiceEnabled && !speechAvailable ? (
              <p className="mt-1.5 text-[13px] text-warn">This browser cannot listen. Voice works in Chrome, Edge and Safari; typing still works here.</p>
            ) : null
          }
        />
        <SwitchRow
          icon={Contrast}
          label="High contrast"
          hint="Solid dark panels, bright outlines and larger focus rings. Every status also shows an icon, not only a colour."
          checked={highContrast}
          onChange={(on) => setContrast(on ? 'high' : 'standard')}
        />
      </div>
    </Card>
  );
}

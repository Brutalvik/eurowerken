import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { CheckCircle2, ClipboardCheck, Eye, EyeOff, MessageSquare, RefreshCw, StickyNote } from 'lucide-react';
import { errorMessage, formatDateTime } from '@/api/appointments';
import { addRepairNote, sendRepairMessage } from '@/api/repairOrders';
import type { RepairEvent, RepairMessage, RepairOrder } from '@/api/repairOrders';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CheckRow, ErrorNote, Labeled, inputClass } from '../inventory/PartForm';
import { SectionTitle } from './common';

const EVENT_ICON = {
  status: RefreshCw,
  note: StickyNote,
  check_in: ClipboardCheck,
  approval: CheckCircle2,
} as const;

interface TimelineProps {
  order: RepairOrder;
  events: RepairEvent[];
  tz: string;
  canEdit: boolean;
  onAdded: (event: RepairEvent) => void;
  announce: (message: string) => void;
}

/** The repair's history, oldest first, with a note form. */
export function TimelineCard({ order, events, tz, canEdit, onAdded, announce }: TimelineProps) {
  const id = useId();
  const [body, setBody] = useState('');
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const ev = await addRepairNote(order, body, visible);
      onAdded(ev);
      setBody('');
      announce(visible ? 'Note added. The customer can see it.' : 'Staff note added.');
    } catch (err) {
      setError(errorMessage(err, 'The note could not be added.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4 md:p-5">
      <section aria-labelledby={`${id}-title`} className="space-y-4">
        <SectionTitle id={`${id}-title`} title="Timeline" subtitle="Newest last" />
        {events.length === 0 ? (
          <p className="text-xs text-fg2">Nothing on the timeline yet.</p>
        ) : (
          <ol className="space-y-3">
            {events.map((ev) => {
              const Icon = EVENT_ICON[ev.kind] ?? StickyNote;
              return (
                <li key={ev.id} className="flex gap-3 text-xs">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-fg">{ev.title}</p>
                    {ev.body && <p className="mt-0.5 whitespace-pre-line break-words text-fg2">{ev.body}</p>}
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-fg3">
                      <time dateTime={ev.created_at}>{formatDateTime(ev.created_at, tz)}</time>
                      <span className="inline-flex items-center gap-1">
                        {ev.visible_to_customer ? <Eye className="h-3 w-3" aria-hidden /> : <EyeOff className="h-3 w-3" aria-hidden />}
                        {ev.visible_to_customer ? 'Customer can see this' : 'Staff only'}
                      </span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {canEdit && (
          <form onSubmit={(e) => void submit(e)} className="space-y-2 border-t border-line pt-4">
            <Labeled id={`${id}-note`} label="Add note">
              <textarea id={`${id}-note`} rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} className={inputClass} />
            </Labeled>
            <CheckRow id={`${id}-visible`} label="Visible to customer" hint="Shows on the customer's tracking page." checked={visible} onChange={setVisible} />
            <ErrorNote errors={error} />
            <div className="flex justify-end">
              <Button type="submit" disabled={saving || body.trim() === ''}>
                {saving ? 'Adding...' : 'Add note'}
              </Button>
            </div>
          </form>
        )}
      </section>
    </Card>
  );
}

interface MessagesProps {
  order: RepairOrder;
  messages: RepairMessage[];
  tz: string;
  canEdit: boolean;
  onSent: (message: RepairMessage) => void;
  announce: (message: string) => void;
}

/** The thread with the customer: staff on the right, the customer on the left. Updates live. */
export function MessagesCard({ order, messages, tz, canEdit, onSent, announce }: MessagesProps) {
  const id = useId();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const node = list.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (!body.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const m = await sendRepairMessage(order, body);
      onSent(m);
      setBody('');
      announce('Message sent.');
    } catch (err) {
      setError(errorMessage(err, 'The message could not be sent.'));
    } finally {
      setSending(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  }

  const closed = order.status === 'cancelled';

  return (
    <Card className="p-4 md:p-5">
      <section aria-labelledby={`${id}-title`} className="space-y-3">
        <SectionTitle id={`${id}-title`} title="Messages" subtitle={`With ${order.contact_name}, on the tracking page`} />
        {messages.length === 0 ? (
          <p className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-5 text-xs text-fg2">
            <MessageSquare className="h-4 w-4 shrink-0 text-fg3" aria-hidden />
            No messages yet. Messages you send show on the customer's tracking page.
          </p>
        ) : (
          <ol ref={list} role="log" aria-live="polite" aria-label="Messages" className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {messages.map((m) => {
              const staff = m.sender === 'staff';
              return (
                <li key={m.id} className={`flex ${staff ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${staff ? 'rounded-br-md bg-accent text-white' : 'rounded-bl-md border border-line bg-surface2 text-fg'}`}>
                    <p className="whitespace-pre-line break-words">{m.body}</p>
                    <p className={`mt-1 text-[10px] ${staff ? 'text-white/80' : 'text-fg3'}`}>
                      {m.author_name || (staff ? 'Workshop' : order.contact_name)} · <time dateTime={m.created_at}>{formatDateTime(m.created_at, tz)}</time>
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {canEdit && !closed && (
          <form onSubmit={(e) => void send(e)} className="space-y-2">
            <Labeled id={`${id}-body`} label="Message to the customer" hint="Ctrl or Cmd + Enter sends.">
              <textarea id={`${id}-body`} rows={2} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={onKey} className={inputClass} />
            </Labeled>
            <ErrorNote errors={error} />
            <div className="flex justify-end">
              <Button type="submit" disabled={sending || body.trim() === ''}>
                {sending ? 'Sending...' : 'Send'}
              </Button>
            </div>
          </form>
        )}
      </section>
    </Card>
  );
}

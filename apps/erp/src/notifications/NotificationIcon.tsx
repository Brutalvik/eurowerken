import { CalendarPlus, CalendarX, CheckCircle2, MessageSquare, XCircle } from 'lucide-react';
import { isDecline } from '@/api/notifications';
import type { StaffNotification } from '@/api/notifications';

/** The icon tile for a notification: booking made or cancelled, customer message, approval or decline. */
export function NotificationIcon({ n }: { n: Pick<StaffNotification, 'kind' | 'title'> }) {
  let Icon = CalendarPlus;
  let tone = 'bg-accent/15 text-accent';
  if (n.kind === 'booking_cancelled') {
    Icon = CalendarX;
    tone = 'bg-bad/15 text-bad';
  } else if (n.kind === 'repair_message') {
    Icon = MessageSquare;
    tone = 'bg-violet/15 text-violet';
  } else if (n.kind === 'repair_approval') {
    const declined = isDecline(n);
    Icon = declined ? XCircle : CheckCircle2;
    tone = declined ? 'bg-bad/15 text-bad' : 'bg-ok/15 text-ok';
  }
  return (
    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}

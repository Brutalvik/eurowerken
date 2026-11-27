import { PAYMENT_STATUS_LABEL } from '@/api/payments';
import type { InvoicePaymentStatus } from '@/api/payments';
import { Badge } from '@/components/ui/Badge';
import type { Tone } from '@/components/ui/Badge';

export const PAYMENT_STATUS_TONE: Record<InvoicePaymentStatus, Tone> = {
  unpaid: 'warn',
  partial: 'info',
  paid: 'ok',
  refunded: 'neutral',
};

/** Paid / Partly paid / Unpaid / Refunded. */
export function PaymentStatusBadge({ status }: { status: InvoicePaymentStatus }) {
  return <Badge tone={PAYMENT_STATUS_TONE[status]}>{PAYMENT_STATUS_LABEL[status]}</Badge>;
}

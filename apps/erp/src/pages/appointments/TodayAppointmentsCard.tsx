import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { errorMessage, formatTimeRange, getTodayAppointments, vehicleLabel } from '@/api/appointments';
import type { Appointment } from '@/api/appointments';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { APPOINTMENT_STATUS_LABEL, APPOINTMENT_TONE } from '@/lib/status';

/** The next five of today's bookings, for the dashboard. */
export function TodayAppointmentsCard() {
  const { user } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const [data, setData] = useState<{ tz: string; upcoming: Appointment[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workshopId) return;
    let live = true;
    getTodayAppointments(workshopId)
      .then((d) => live && setData(d))
      .catch((err) => live && setError(errorMessage(err, 'Appointments could not be loaded.')));
    return () => {
      live = false;
    };
  }, [workshopId]);

  const next = data?.upcoming.slice(0, 5) ?? [];

  return (
    <Card className="p-4 sm:p-5">
      <CardHeader
        title="Today's appointments"
        subtitle={data ? `${data.total} booked today, ${data.upcoming.length} still to come` : undefined}
        action={
          <Link
            to="/appointments"
            className="inline-flex items-center gap-1 rounded text-xs font-semibold text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent coarse:min-h-11"
          >
            All appointments
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        }
      />
      {error ? (
        <p className="text-xs text-bad">{error}</p>
      ) : !data ? (
        <p role="status" className="text-xs text-fg2">
          Loading...
        </p>
      ) : next.length === 0 ? (
        <p className="text-xs text-fg2">No more appointments today.</p>
      ) : (
        <ul className="divide-y divide-line">
          {next.map((a) => {
            const car = vehicleLabel(a.vehicle);
            return (
              <li key={a.id} className="flex items-start justify-between gap-3 py-2.5 text-xs">
                <div className="min-w-0">
                  <div className="font-semibold text-fg">{formatTimeRange(a, data.tz)}</div>
                  <div className="break-words text-fg2">
                    {a.contact_name}
                    {car && <span className="text-fg3"> · {car}</span>}
                  </div>
                </div>
                <Badge tone={APPOINTMENT_TONE[a.status]}>{APPOINTMENT_STATUS_LABEL[a.status]}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

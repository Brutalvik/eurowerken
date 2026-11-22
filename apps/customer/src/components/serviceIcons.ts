import type { LucideIcon } from 'lucide-react';
import { BatteryCharging, Disc3, Droplet, Filter, Gauge, ScanLine, Snowflake, Wrench, Zap } from 'lucide-react';
import type { ServiceIcon } from '@eurowerken/shared';

/** Lucide icon for each service icon name the ERP offers. */
export const SERVICE_ICON_COMPONENTS: Record<ServiceIcon, LucideIcon> = {
  oil: Droplet,
  filter: Filter,
  battery: BatteryCharging,
  scan: ScanLine,
  gauge: Gauge,
  brake: Disc3,
  snow: Snowflake,
  bolt: Zap,
  wrench: Wrench,
};

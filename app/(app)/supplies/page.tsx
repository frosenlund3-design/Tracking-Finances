import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { listSupplies } from '@/services/home';
import { nearDayLabel, today } from '@/lib/dates';
import { Supplies, type SupplyRow } from './supplies';

export const metadata: Metadata = { title: 'Supplies' };
export const dynamic = 'force-dynamic';

export default async function SuppliesPage() {
  const user = await requireUser();
  const now = today();
  const supplies = await listSupplies(user.id, now);

  const rows: SupplyRow[] = supplies.map((supply) => ({
    id: supply.id,
    name: supply.name,
    icon: supply.icon.length <= 12 && !/^[a-z_]+$/.test(supply.icon) ? supply.icon : '📦',
    typicalDays: supply.typicalDays,
    daysLeft: supply.daysLeft,
    runsOutLabel: supply.runsOutOn ? nearDayLabel(supply.runsOutOn).toLowerCase() : null,
    state: supply.state,
  }));

  return <Supplies supplies={rows} />;
}

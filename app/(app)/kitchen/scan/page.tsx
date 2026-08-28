import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { FOOD_GROUPS } from '@/lib/food';
import { today } from '@/lib/dates';
import { DEMO_BARCODES } from '@/integrations/products/demo';
import { ScannerScreen } from './scanner-screen';

export const metadata: Metadata = { title: 'Scan' };
export const dynamic = 'force-dynamic';

export default async function ScanPage() {
  const user = await requireUser();

  return (
    <ScannerScreen
      groups={FOOD_GROUPS.map((g) => ({ key: g.key, label: g.label, glyph: g.glyph }))}
      // The demo catalogue is offered wherever there is no camera to point,
      // and always in demo mode, so the flow can be tried on a laptop.
      demoBarcodes={
        user.demoMode ? DEMO_BARCODES.map((p) => ({ barcode: p.barcode, name: p.name })) : []
      }
      today={today()}
    />
  );
}

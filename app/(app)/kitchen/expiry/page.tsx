import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { expiringSoon } from '@/services/pantry';
import { nearDayLabel, today } from '@/lib/dates';
import { ExpiryDeck } from './deck';
import type { KitchenItem } from '../kitchen-list';

export const metadata: Metadata = { title: 'Expiry Rush' };
export const dynamic = 'force-dynamic';

export default async function ExpiryPage() {
  const user = await requireUser();
  const now = today();
  const items = await expiringSoon(user.id, 20, now);

  const mapped: KitchenItem[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    brand: item.brand,
    glyph: item.glyph,
    location: item.location,
    quantity: item.quantity,
    expiresOn: item.expiresOn,
    expiresLabel: item.expiresOn ? nearDayLabel(item.expiresOn) : null,
    freshness: item.freshness,
  }));

  return <ExpiryDeck items={mapped} />;
}

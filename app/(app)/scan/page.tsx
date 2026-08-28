import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { bestScore } from '@/services/catalog';
import { RoomScanner } from './scanner';

export const metadata: Metadata = { title: 'Rum-scanner' };
export const dynamic = 'force-dynamic';

export default async function ScanPage() {
  const user = await requireUser();
  return <RoomScanner best={await bestScore(user.id, 'rumsweep')} />;
}

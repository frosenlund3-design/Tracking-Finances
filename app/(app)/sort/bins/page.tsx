import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { listBins } from '@/services/home';
import { WASTE_ITEMS, fraction } from '@/lib/waste';
import { BinsScreen, type BinRow, type LookupRow } from './bins';

export const metadata: Metadata = { title: 'Sorting at home' };
export const dynamic = 'force-dynamic';

export default async function BinsPage() {
  const user = await requireUser();
  const bins = await listBins(user.id);

  const rows: BinRow[] = bins.map((bin) => ({
    key: bin.fraction.key,
    label: bin.fraction.label,
    english: bin.fraction.english,
    color: bin.fraction.color,
    glyph: bin.fraction.glyph,
    hint: bin.fraction.hint,
    status: bin.status,
  }));

  // The whole list ships to the client: it is 65 short rows, and a lookup
  // that answers as you type beats one that waits for a round trip while you
  // are standing over the bin.
  const items: LookupRow[] = WASTE_ITEMS.map((item) => ({
    name: item.name,
    danish: item.danish,
    answer: item.answer,
    answerLabel: fraction(item.answer)?.label ?? item.answer,
    answerColor: fraction(item.answer)?.color ?? '#616161',
    why: item.why,
  }));

  return <BinsScreen bins={rows} items={items} />;
}

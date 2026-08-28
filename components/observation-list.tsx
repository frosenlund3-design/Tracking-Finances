import Link from 'next/link';
import { Badge, Card } from '@/components/ui/primitives';
import type { Observation } from '@/services/observations';

/**
 * The "worth a look" list.
 *
 * Anything past about five cards stops being read, so the rest goes behind a
 * disclosure rather than being dropped — the observations below the fold are
 * still true, they are just not what to look at first.
 */
export function ObservationList({
  observations,
  limit = 5,
}: {
  observations: Observation[];
  limit?: number;
}) {
  if (observations.length === 0) return null;
  const shown = observations.slice(0, limit);
  const rest = observations.slice(limit);

  return (
    <div className="space-y-2">
      {shown.map((observation) => (
        <ObservationCard key={observation.id} observation={observation} />
      ))}

      {rest.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer list-none rounded-xl px-1 py-2 text-[13px] font-medium text-accent">
            <span className="group-open:hidden">
              {rest.length} more observation{rest.length === 1 ? '' : 's'}
            </span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <div className="mt-2 space-y-2">
            {rest.map((observation) => (
              <ObservationCard key={observation.id} observation={observation} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function ObservationCard({ observation }: { observation: Observation }) {
  const card = (
    <Card className="p-4">
      <div className="flex items-start gap-2">
        <p className="flex-1 text-[14.5px] font-medium leading-snug">{observation.title}</p>
        {observation.tone === 'notable' ? <Badge tone="notice">Notable</Badge> : null}
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{observation.body}</p>
    </Card>
  );

  return observation.href ? (
    <Link href={observation.href} className="pressable block">
      {card}
    </Link>
  ) : (
    card
  );
}

/**
 * Standing figures, in one block instead of one card each.
 *
 * "25 active subscriptions" is not something to look at; it is something to
 * know. Four of them stacked as full cards read as four alerts.
 */
export function StatusSummary({ observations }: { observations: Observation[] }) {
  if (observations.length === 0) return null;
  return (
    <Card className="divide-y divide-border p-0">
      {observations.map((observation) => (
        <div key={observation.id} className="px-4 py-3">
          <p className="text-[14px] font-medium leading-snug">{observation.title}</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted">{observation.body}</p>
        </div>
      ))}
    </Card>
  );
}

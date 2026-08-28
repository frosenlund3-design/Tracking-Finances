import { Skeleton } from '@/components/ui/primitives';

export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-52" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-[var(--radius-card)]" />
        ))}
      </div>
      <Skeleton className="h-56 rounded-[var(--radius-card)]" />
      <Skeleton className="h-64 rounded-[var(--radius-card)]" />
    </div>
  );
}

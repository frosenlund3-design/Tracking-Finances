import Link from 'next/link';
import { Button } from '@/components/ui/primitives';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 text-center">
      <h1 className="text-lg font-semibold tracking-tight">Not found</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
        That page, or that transaction, is not here. It may belong to a different account or have
        been deleted.
      </p>
      <Link href="/dashboard" className="mt-5">
        <Button>Back to dashboard</Button>
      </Link>
    </div>
  );
}

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { listConnections } from '@/services/sync';
import { integrationStatuses } from '@/integrations/registry';
import { OnboardingFlow } from './flow';

export const metadata: Metadata = { title: 'Get set up' };

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.onboardingCompletedAt) redirect('/dashboard');

  const [connections, integrations] = await Promise.all([
    listConnections(user.id),
    Promise.resolve(integrationStatuses()),
  ]);

  const bank = integrations.find((i) => i.kind === 'bank');
  const stripe = integrations.find((i) => i.id === 'stripe');

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-5 py-10">
      <OnboardingFlow
        name={user.displayName}
        hasData={connections.length > 0}
        bankConfigured={bank?.configured ?? false}
        stripeConfigured={stripe?.configured ?? false}
      />
    </main>
  );
}

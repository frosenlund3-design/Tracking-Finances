import { requireUser } from '@/lib/auth';
import { BottomNav, Sidebar } from '@/components/nav';
import { ServiceWorkerRegistrar } from '@/components/pwa';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-dvh bg-canvas">
      <Sidebar userLabel={user.displayName || user.email} />
      <main
        className="mx-auto w-full max-w-2xl px-4 pb-24 pt-5 sm:px-6 lg:max-w-4xl lg:pb-10 lg:pl-64 xl:max-w-5xl"
        style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
      >
        <div className="lg:pl-6">{children}</div>
      </main>
      <BottomNav />
      <ServiceWorkerRegistrar />
    </div>
  );
}

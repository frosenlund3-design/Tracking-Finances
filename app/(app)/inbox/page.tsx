import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { unifiedInbox } from '@/integrations/messages/registry';
import { messageSourceStatuses } from '@/integrations/messages/registry';
import { gmailConfigured } from '@/integrations/messages/gmail';
import { hasToken } from '@/services/token-vault';
import { formatDateTime } from '@/lib/dates';
import { Inbox, type InboxMessage } from './inbox';

export const metadata: Metadata = { title: 'Inbox' };
export const dynamic = 'force-dynamic';

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const [inbox, connected] = await Promise.all([
    unifiedInbox(user.id, { limit: 20, demoMode: user.demoMode }),
    hasToken(user.id, 'gmail', null),
  ]);

  const messages: InboxMessage[] = inbox.messages.map((message) => ({
    id: message.id,
    source: message.source,
    from: message.from,
    subject: message.subject,
    preview: message.preview,
    // Formatted server-side, where there is one locale and one clock.
    when: formatDateTime(message.receivedAt),
    unread: message.unread,
    url: message.url,
  }));

  const notice = typeof params.gmail === 'string' ? params.gmail : null;

  return (
    <Inbox
      messages={messages}
      sources={messageSourceStatuses()}
      connected={inbox.connected}
      demo={inbox.demo}
      gmailConfigured={gmailConfigured()}
      gmailConnected={connected}
      notice={notice}
    />
  );
}

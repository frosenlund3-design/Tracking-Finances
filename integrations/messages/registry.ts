import '@/lib/server-guard';
import { hasToken } from '@/services/token-vault';
import { gmailConfigured, gmailSource } from './gmail';
import { demoMessageSource } from './demo';
import { MESSAGE_SOURCES, type MessageSource, type SourceStatus, type UnifiedMessage } from './types';

/**
 * The swap point for message sources, mirroring the financial one.
 *
 * Adding Outlook means writing a MessageSource and adding it below; nothing
 * on the inbox screen changes.
 */

const SOURCES: MessageSource[] = [gmailSource];

/** Live status for the connect screen, with configuration resolved. */
export function messageSourceStatuses(): SourceStatus[] {
  return MESSAGE_SOURCES.map((source) => ({
    ...source,
    configured: source.id === 'gmail' ? gmailConfigured() : false,
  }));
}

export interface InboxResult {
  messages: UnifiedMessage[];
  /** Sources that answered, so the screen can say where this came from. */
  connected: string[];
  /** True when the list is the demo stand-in rather than a real mailbox. */
  demo: boolean;
}

/**
 * Everything, newest first.
 *
 * A source that fails is skipped rather than failing the page: one expired
 * Gmail grant should not hide the rest of the inbox.
 */
export async function unifiedInbox(
  userId: string,
  options: { limit?: number; demoMode?: boolean } = {},
): Promise<InboxResult> {
  const limit = Math.min(options.limit ?? 20, 50);
  const connected: string[] = [];
  const collected: UnifiedMessage[] = [];

  for (const source of SOURCES) {
    if (!source.isConfigured()) continue;
    if (!(await hasToken(userId, source.id as 'gmail', null))) continue;
    try {
      const messages = await source.listRecent(userId, limit);
      collected.push(...messages);
      connected.push(source.displayName);
    } catch {
      // An expired or revoked grant is not a page failure.
    }
  }

  if (collected.length === 0 && options.demoMode) {
    return {
      messages: await demoMessageSource.listRecent(userId, limit),
      connected: [],
      demo: true,
    };
  }

  collected.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  return { messages: collected.slice(0, limit), connected, demo: false };
}

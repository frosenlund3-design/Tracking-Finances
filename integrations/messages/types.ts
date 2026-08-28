/**
 * One inbox.
 *
 * The honest scope of this, stated once so nothing downstream pretends
 * otherwise: email and a couple of work chat tools can genuinely be read with
 * the owner's permission. Personal WhatsApp, iMessage, Signal and Messenger
 * cannot — not by this app and not by any app — because those platforms
 * publish no API that reads a private individual's conversations. Anything
 * claiming to do it is either scraping a logged-in session or lying.
 *
 * `MESSAGE_SOURCES` records which is which, and the UI shows the reason
 * rather than an endlessly "coming soon" button.
 */

export type MessageSourceId = 'gmail' | 'outlook' | 'slack' | 'telegram' | 'demo';

export interface UnifiedMessage {
  /** Stable within a source. */
  id: string;
  source: MessageSourceId;
  from: string;
  subject: string;
  /** First line or two. Never the full body — that stays at the source. */
  preview: string;
  receivedAt: string;
  unread: boolean;
  /** Deep link back to the message in its own app. */
  url: string | null;
}

export interface MessageSource {
  readonly id: MessageSourceId;
  readonly displayName: string;
  /** True when this deployment has credentials for it. */
  isConfigured(): boolean;
  /** Read-only, always. There is no send path in this interface by design. */
  listRecent(userId: string, limit: number): Promise<UnifiedMessage[]>;
}

export interface SourceStatus {
  id: string;
  displayName: string;
  /** Whether a read-only integration is possible at all. */
  possible: boolean;
  /** Set when it is not, in plain language. */
  why?: string;
  /** Whether this deployment has been given credentials. */
  configured: boolean;
  /** The env vars a deployment needs to set. */
  envVars: string[];
  docs?: string;
}

/**
 * What can and cannot be read, and why.
 *
 * Kept as data rather than prose so the screen cannot drift from the truth.
 */
export const MESSAGE_SOURCES: SourceStatus[] = [
  {
    id: 'gmail',
    displayName: 'Gmail',
    possible: true,
    configured: false,
    envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    docs: 'https://developers.google.com/gmail/api/auth/scopes',
  },
  {
    id: 'outlook',
    displayName: 'Outlook / Microsoft 365',
    possible: true,
    configured: false,
    envVars: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'],
    docs: 'https://learn.microsoft.com/graph/permissions-reference',
  },
  {
    id: 'slack',
    displayName: 'Slack',
    possible: true,
    configured: false,
    envVars: ['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET'],
    docs: 'https://api.slack.com/scopes',
  },
  {
    id: 'telegram',
    displayName: 'Telegram',
    possible: true,
    configured: false,
    envVars: ['TELEGRAM_BOT_TOKEN'],
    docs: 'https://core.telegram.org/bots/api',
  },
  {
    id: 'whatsapp',
    displayName: 'WhatsApp',
    possible: false,
    why: 'The WhatsApp Cloud API only reaches business numbers. There is no interface, official or otherwise, that reads a personal WhatsApp inbox.',
    configured: false,
    envVars: [],
  },
  {
    id: 'imessage',
    displayName: 'iMessage',
    possible: false,
    why: 'Apple publishes no API for reading Messages. On a Mac the local database can be read, but nothing on the web or on iOS can.',
    configured: false,
    envVars: [],
  },
  {
    id: 'signal',
    displayName: 'Signal',
    possible: false,
    why: 'Signal is end-to-end encrypted with no server-side access by design. Reading it from a web app would mean defeating the thing it exists for.',
    configured: false,
    envVars: [],
  },
  {
    id: 'messenger',
    displayName: 'Messenger & Instagram DMs',
    possible: false,
    why: 'Meta only exposes inboxes belonging to a Page or a business account, never a person’s own conversations.',
    configured: false,
    envVars: [],
  },
];

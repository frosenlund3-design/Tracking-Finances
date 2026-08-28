import type { MessageSource, UnifiedMessage } from './types';

/**
 * A stand-in inbox for demo mode.
 *
 * Clearly labelled as demo everywhere it surfaces. It exists so the screen can
 * be judged without anyone connecting a real mailbox first — not to imply the
 * app has read anything.
 */

const HOURS = 3_600_000;

function at(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * HOURS).toISOString();
}

export const demoMessageSource: MessageSource = {
  id: 'demo',
  displayName: 'Demo inbox',
  isConfigured: () => true,

  async listRecent(_userId: string, limit: number): Promise<UnifiedMessage[]> {
    const messages: UnifiedMessage[] = [
      {
        id: 'demo-1',
        source: 'demo',
        from: 'Nordea',
        subject: 'Din kontoudskrift for august er klar',
        preview: 'Du kan se den i netbank. Ingen handling nødvendig.',
        receivedAt: at(2),
        unread: true,
        url: null,
      },
      {
        id: 'demo-2',
        source: 'demo',
        from: 'Tryg Forsikring',
        subject: 'Fornyelse af din indboforsikring',
        preview: 'Din police fornyes automatisk den 15. september.',
        receivedAt: at(9),
        unread: true,
        url: null,
      },
      {
        id: 'demo-3',
        source: 'demo',
        from: 'Aarhus Labs ApS',
        subject: 'Faktura 2026-0142 er betalt',
        preview: 'Tak. Beløbet er registreret.',
        receivedAt: at(26),
        unread: false,
        url: null,
      },
      {
        id: 'demo-4',
        source: 'demo',
        from: 'Netflix',
        subject: 'Your price is changing',
        preview: 'From your next billing date the standard plan will cost more.',
        receivedAt: at(50),
        unread: false,
        url: null,
      },
      {
        id: 'demo-5',
        source: 'demo',
        from: 'Sofie',
        subject: 'Aftensmad på fredag?',
        preview: 'Jeg laver mad. Du skal bare komme.',
        receivedAt: at(73),
        unread: false,
        url: null,
      },
    ];
    return messages.slice(0, limit);
  },
};

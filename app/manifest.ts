import type { MetadataRoute } from 'next';

/**
 * Web app manifest. This is what turns "Add to Home Screen" into a real app
 * icon that opens without browser chrome.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kroner — your life, sorted',
    short_name: 'Kroner',
    description:
      'Money, kitchen, home and body in one place, with a game over the top and no streak to break. Read-only bank, Stripe and mailbox access.',
    // The board, not the dashboard: opening the app and doing something
    // useful should be the same action.
    id: '/play',
    start_url: '/play',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fbfbfc',
    theme_color: '#fbfbfc',
    categories: ['finance', 'productivity', 'lifestyle'],
    lang: 'en',
    dir: 'ltr',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Long-press the home screen icon to jump straight in.
    shortcuts: [
      {
        name: 'Scan into the kitchen',
        short_name: 'Scan',
        url: '/kitchen/scan',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'What is for dinner',
        short_name: 'Dinner',
        url: '/dinner',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Ask anything',
        short_name: 'Ask',
        url: '/assistant',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Every krone',
        short_name: 'Activity',
        url: '/transactions',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}

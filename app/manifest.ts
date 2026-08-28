import type { MetadataRoute } from 'next';

/**
 * Web app manifest. This is what turns "Add to Home Screen" into a real app
 * icon that opens without browser chrome.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kroner — personal & business finance',
    short_name: 'Kroner',
    description:
      'Every krone in and out of your accounts. Read-only bank and Stripe access, with an assistant that answers from your own data.',
    id: '/dashboard',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fbfbfc',
    theme_color: '#fbfbfc',
    categories: ['finance', 'productivity'],
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
        name: 'Ask about my money',
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
      {
        name: 'Add a transaction',
        short_name: 'Add',
        url: '/transactions/new',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}

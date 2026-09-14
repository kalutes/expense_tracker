import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'EXPENSE_TRACKER // Multi-Currency Ledger',
    short_name: 'Ledger',
    description: 'Self-hosted personal multi-currency expense tracker and historical ledger',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#090d13',
    theme_color: '#090d13',
    orientation: 'any',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}

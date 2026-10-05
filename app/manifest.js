// Makes the CRM installable as a phone app ("Add to Home Screen"). Served at /manifest.webmanifest.
export default function manifest() {
  return {
    name: 'Evergreen Community Care',
    short_name: 'Evergreen',
    description: 'Evergreen staff app: ID card, check-in, schedule, timesheet.',
    id: '/',
    start_url: '/id',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f7f5f0',
    theme_color: '#0b5a34',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Check in', url: '/id#checkin', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'My ID card', url: '/id', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Schedule', url: '/schedule', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}

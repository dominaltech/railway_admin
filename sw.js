// sw.js - Save as sw.js in the same directory. Uses the logic from paste.txt adapted for admin panel.

// Cache name with version
const CACHE_NAME = 'railbook-admin-v1-' + Date.now();

// Static assets to cache (self-contained HTML, no external files needed)
const STATIC_ASSETS = [
  './',
  './index.html'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch(err => {
        console.error('Failed to cache:', err);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME &&
              cacheName.startsWith('railbook-admin-v') &&
              !cacheName.startsWith('railbook-admin-dynamic-')) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker activated and taking control');
      return self.clients.claim();
    })
  );
});

// Fetch event - Network First for HTML (always fresh admin data), Cache First for assets
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip non-http requests
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(fetchWithStrategy(request));
});

// Smart fetch strategy
async function fetchWithStrategy(request) {
  const url = new URL(request.url);
  const isHTMLPage = url.pathname.endsWith('.html') || url.pathname === '/';

  // NETWORK FIRST for HTML pages (always fresh content)
  if (isHTMLPage) {
    try {
      console.log('Fetching fresh HTML:', url.pathname);
      const networkResponse = await fetch(request, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      if (networkResponse && networkResponse.ok) {
        // Clone and cache the fresh response
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(request, responseToCache);
        });
        return networkResponse;
      }
    } catch (error) {
      console.log('Network failed for HTML, trying cache:', error);
    }

    // Fallback to cache if network fails
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('Serving cached HTML:', url.pathname);
      return cachedResponse;
    }

    // Last resort: offline message
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Offline - RailBook Admin</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #003366, #0055aa); color: white; }
          h1 { font-size: 48px; margin: 20px 0; }
          p { font-size: 18px; }
          button { background: white; color: #003366; border: none; padding: 15px 30px; font-size: 16px; border-radius: 8px; cursor: pointer; margin-top: 20px; }
        </style>
      </head>
      <body>
        <h1>🚂 RailBook</h1>
        <h2>You're Offline</h2>
        <p>Please check your internet connection and try again.</p>
        <button onclick="window.location.reload()">Retry</button>
      </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status: 503,
      statusText: 'Service Unavailable'
    });
  }

  // CACHE FIRST for other assets (JS/CSS in inline, but for future)
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    // Return cached version immediately and update in background
    fetchAndUpdateCache(request);
    return cachedResponse;
  }

  // If not in cache, fetch from network
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const responseToCache = networkResponse.clone();
      caches.open(CACHE_NAME).then(cache => {
        cache.put(request, responseToCache);
      });
      return networkResponse;
    }
  } catch (error) {
    console.log('Failed to fetch asset:', request.url, error);
  }

  return new Response('Network error', {
    status: 408,
    statusText: 'Request Timeout'
  });
}

// Background fetch and cache update for assets
async function fetchAndUpdateCache(request) {
  try {
    const networkResponse = await fetch(request, { cache: 'no-cache' });
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
      console.log('Background updated cache for:', request.url);
    }
  } catch (error) {
    // Silently fail background updates
    console.log('Background update failed:', error);
  }
}

console.log('Service Worker loaded successfully with Network First strategy for HTML');

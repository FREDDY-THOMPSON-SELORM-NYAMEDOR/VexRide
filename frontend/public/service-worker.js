const APP_CACHE_PREFIX = 'vexride-';
const SHELL_CACHE = `${APP_CACHE_PREFIX}shell-v1`;
const PRIVATE_CACHE = `${APP_CACHE_PREFIX}private-v1`;
const SHELL_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icons/vex-192.png',
  '/icons/vex-512.png'
];

async function precacheApplicationShell() {
  const cache = await caches.open(SHELL_CACHE);
  await cache.addAll(SHELL_URLS);
  const page = await cache.match('/');
  if (!page) return;

  const html = await page.text();
  const assetUrls = Array.from(html.matchAll(/(?:src|href)=["']([^"']*\/_expo\/static\/[^"']+)["']/g))
    .map((match) => new URL(match[1], self.location.origin).href);
  await Promise.all(assetUrls.map(async (assetUrl) => {
    const response = await fetch(assetUrl);
    if (response.ok) await cache.put(assetUrl, response);
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precacheApplicationShell()
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(APP_CACHE_PREFIX) && ![SHELL_CACHE, PRIVATE_CACHE].includes(key))
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'clear-private-cache') {
    event.waitUntil(caches.delete(PRIVATE_CACHE));
  }
});

function isPrivateApiRequest(url) {
  return /\/(?:match\/[^/]+\/chat|api\/requests(?:\/[^/]+\/chat)?|api\/connections|browseGroups|messages\/unread\/[^/]+|api\/marketplace)(?:\/|$|\?)/.test(url.pathname + url.search);
}

async function cacheSuccessfulResponse(cacheName, request, response) {
  if (!response.ok || response.type === 'opaque' || /no-store/i.test(response.headers.get('Cache-Control') || '')) return response;

  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    if (keys.length > 80) await cache.delete(keys[0]);
  } catch (error) {
    console.warn('VexRide could not cache a response:', error);
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(async (response) => {
        if (response.ok) {
          try {
            const cache = await caches.open(SHELL_CACHE);
            await cache.put('/', response.clone());
            await cache.put('/index.html', response.clone());
          } catch (error) {
            console.warn('VexRide could not refresh its offline app shell:', error);
          }
        }
        return response;
      }).catch(async () => (
        await caches.match('/index.html')
        || await caches.match('/offline.html')
      ))
    );
    return;
  }

  if (isPrivateApiRequest(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => cacheSuccessfulResponse(PRIVATE_CACHE, request, response))
        .catch(async () => (
          await caches.match(request)
          || new Response(JSON.stringify({ success: false, message: 'You are currently offline.' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          })
        ))
    );
    return;
  }

  if (url.origin !== self.location.origin || !(
    url.pathname.startsWith('/assets/')
    || url.pathname.startsWith('/_expo/static/')
  )) return;
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => (
      cacheSuccessfulResponse(SHELL_CACHE, request, response)
    )))
  );
});

function notificationDestination(payload) {
  if (typeof payload.url === 'string' && payload.url.startsWith('/') && !payload.url.startsWith('//')) return payload.url;

  const id = payload.requestId || payload.rideRequestId || payload.groupId || payload.matchId || payload.chatId;
  switch (payload.type || payload.eventType) {
    case 'connectionRequested':
    case 'newConnectionRequest':
      return '/connection-requests';
    case 'connectionAccepted':
    case 'newMessage':
      if (payload.matchId || payload.rideRequestId || payload.chatId) {
        const chatId = payload.rideRequestId || payload.matchId || payload.chatId;
        return `/chat/${encodeURIComponent(chatId)}${payload.rideRequestId ? '?type=group' : ''}`;
      }
      return '/tracking';
    case 'compatibleRidersFound':
    case 'requestUpdated':
      return payload.requestId ? `/request/${encodeURIComponent(payload.requestId)}` : '/';
    case 'groupFinalized':
    case 'groupMatchFound':
      return payload.rideRequestId
        ? `/request/${encodeURIComponent(payload.rideRequestId)}`
        : payload.groupId ? `/group/${encodeURIComponent(payload.groupId)}` : '/';
    case 'rideUpdate':
    case 'rideConfirmed':
    case 'rideCompletionUpdate':
    case 'paymentStatusUpdate':
      return payload.matchId ? `/tracking/${encodeURIComponent(payload.matchId)}` : '/tracking';
    case 'groupCreated':
    case 'groupJoined':
      return id ? `/group/${encodeURIComponent(id)}` : '/';
    default:
      return '/';
  }
}

function notificationTitle(type) {
  const titles = {
    connectionRequested: 'New connection request',
    newConnectionRequest: 'New connection request',
    connectionAccepted: 'Connection accepted',
    newMessage: 'New message',
    compatibleRidersFound: 'Compatible riders found',
    groupFinalized: 'Your group is ready',
    groupMatchFound: 'Your group is ready',
    rideUpdate: 'Ride update',
    rideConfirmed: 'Ride confirmed',
    rideCompletionUpdate: 'Ride update',
    paymentStatusUpdate: 'Payment update',
    groupCreated: 'New group available',
    groupJoined: 'A rider joined your group'
  };
  return titles[type] || 'VexRide';
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    console.warn('VexRide received an invalid push payload:', error);
    payload = { body: event.data?.text() };
  }

  const notificationData = payload.data && typeof payload.data === 'object'
    ? { ...payload, ...payload.data }
    : payload;
  const type = notificationData.type || notificationData.eventType;
  const title = payload.title || notificationTitle(type);
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || payload.message || notificationData.message || 'There is an update to your ride.',
    icon: '/icons/vex-192.png',
    badge: '/icons/vex-72.png',
    data: { url: notificationDestination(notificationData) }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const requestedDestination = new URL(event.notification.data?.url || '/', self.location.origin);
  const destination = (requestedDestination.origin === self.location.origin
    ? requestedDestination
    : new URL('/', self.location.origin)).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        const destinationClient = await client.navigate(destination);
        return (destinationClient || client).focus();
      }
      return self.clients.openWindow(destination);
    })
  );
});

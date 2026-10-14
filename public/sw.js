const SHELL_CACHE = 'smartschool-shell-v2'
const SHELL_FILES = ['/', '/index.html', '/manifest.webmanifest', '/icons/smartschool.svg']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('smartschool-shell-') && key !== SHELL_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // Never cache API responses, user records, or authenticated portal data.
  if (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/storage/') || url.pathname.startsWith('/functions/')) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.put('/index.html', response.clone())))
      return response
    }).catch(() => caches.match('/index.html')))
    return
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.put(request, response.clone())))
      return response
    })))
  }
})

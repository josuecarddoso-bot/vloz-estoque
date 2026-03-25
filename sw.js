/**
 * VLOZ TELECOM — SERVICE WORKER v3.0
 * Estratégia: Cache-First para assets, Network-First para navegação
 */

const CACHE_NAME = 'vloz-estoque-v4';

const ASSETS_ESTATICOS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './firebase.js',
  './manifest.json',
  './favicon.svg',
];

/* ── INSTALL ── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of ASSETS_ESTATICOS) {
        try {
          const response = await fetch(asset);
          if (response.ok) {
            await cache.put(asset, response.clone());
          } else {
            console.warn('[SW] Asset não encontrado:', asset);
          }
        } catch {
          console.warn('[SW] Falha ao cachear:', asset);
        }
      }
    })
  );
  self.skipWaiting();
});

/* ── ACTIVATE ── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* ── FETCH ── */
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Ignora Firebase, APIs externas e Google Fonts (sempre via rede)
  if (
    url.includes('firebase') ||
    url.includes('firestore') ||
    url.includes('googleapis') ||
    url.includes('gstatic') ||
    url.includes('fonts.google')
  ) {
    return;
  }

  // Navegação: Network-First (garante conteúdo atualizado)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Assets estáticos: Cache-First (mais rápido)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Atualiza cache com o novo recurso
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

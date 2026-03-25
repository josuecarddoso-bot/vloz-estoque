/**
 * VLOZ TELECOM — SERVICE WORKER v1.0
 * Permite instalar o sistema como app no celular (PWA)
 * e funcionar com cache básico quando offline.
 */

const CACHE_NAME = 'vloz-estoque-v1';

// Arquivos que ficam em cache para funcionar offline
const ASSETS = [
  '/index.html',
  '/style.css',
  '/app.js',
  '/firebase.js',
  '/manifest.json',
];

// Instalação: faz cache dos arquivos principais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Ativação: remove caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: serve do cache se disponível, senão busca na rede
self.addEventListener('fetch', (event) => {
  // Requisições ao Firebase sempre vão para a rede (dados em tempo real)
  if (event.request.url.includes('firebase') ||
      event.request.url.includes('firestore') ||
      event.request.url.includes('googleapis')) {
    return; // Deixa passar direto para a rede
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).catch(() => {
        // Se offline e não tem cache, retorna página principal
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

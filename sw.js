/**
 * VLOZ TELECOM — SERVICE WORKER v2.0 (CORRIGIDO)
 * PWA estável, sem quebra por arquivos inexistentes
 */

 const CACHE_NAME = 'vloz-estoque-v3';

 const ASSETS = [
   './',
   './index.html',
   './style.css',
   './app.js',
   './firebase.js',
   './manifest.json',
   './favicon.svg',
 ];
 
 // INSTALL (corrigido — não quebra se algum arquivo falhar)
 self.addEventListener('install', (event) => {
   event.waitUntil(
     caches.open(CACHE_NAME).then(async (cache) => {
       for (const asset of ASSETS) {
         try {
           const response = await fetch(asset);
           if (response.ok) {
             await cache.put(asset, response.clone());
           } else {
             console.warn('[SW] Arquivo não encontrado:', asset);
           }
         } catch (error) {
           console.warn('[SW] Falha ao cachear:', asset);
         }
       }
     })
   );
   self.skipWaiting();
 });
 
 // ACTIVATE (limpa versões antigas)
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
 
 // FETCH (responde do cache ou rede)
 self.addEventListener('fetch', (event) => {
   const url = event.request.url;
 
   // Ignora Firebase e APIs externas
   if (
     url.includes('firebase') ||
     url.includes('firestore') ||
     url.includes('googleapis') ||
     url.includes('gstatic')
   ) {
     return;
   }
 
   event.respondWith(
     caches.match(event.request).then((cached) => {
       if (cached) return cached;
 
       return fetch(event.request)
         .then((response) => {
           return response;
         })
         .catch(() => {
           if (event.request.destination === 'document') {
             return caches.match('./index.html');
           }
         });
     })
   );
 });

// ============================================================
// CLINICALEAD — SERVICE WORKER (mínimo)
// Necessário para o app ser instalável. Estratégia: sempre
// busca da rede (app continua sempre atualizado); só usa
// cache se estiver totalmente offline.
// ============================================================

const CACHE = 'clinicalead-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Só intercepta navegação/arquivos do próprio site (GET)
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        // Guarda uma cópia no cache para uso offline
        const copia = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(e.request)) // offline: usa o cache
  );
});

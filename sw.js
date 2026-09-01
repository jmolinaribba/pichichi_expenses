// Subí este número cada vez que publiques cambios en index.html / assets,
// para forzar que los usuarios reciban la versión nueva.
const CACHE_VERSION = 'v4';
const CACHE_NAME = `pichichi-cache-${CACHE_VERSION}`;

// Archivos propios de la app (app shell)
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './logo.png'
];

// Dependencias externas: se cachean para que la app funcione offline
// de verdad (sin esto, sin conexión la página carga rota / sin estilos).
const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// --- Instalación ---
self.addEventListener('install', (event) => {
  // No esperar a que se cierren las pestañas viejas: activar la versión nueva ya mismo.
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // allSettled en vez de addAll: si un CDN falla al instalar, no tira abajo
      // todo el Service Worker (addAll es todo-o-nada).
      return Promise.allSettled(
        [...APP_SHELL, ...CDN_ASSETS].map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[sw] No se pudo cachear en la instalación:', url, err);
          })
        )
      );
    })
  );
});

// --- Activación: limpia cachés de versiones anteriores ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      // Tomar control inmediato de las pestañas ya abiertas, sin esperar a un reload.
      .then(() => self.clients.claim())
  );
});

// --- Fetch ---
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo interceptamos GET; POST/PUT/etc. van directo a la red.
  if (request.method !== 'GET') return;

  const isHTML = request.mode === 'navigate' || request.destination === 'document';

  if (isHTML) {
    // El documento principal: network-first, para que las actualizaciones
    // de index.html lleguen apenas hay conexión, con fallback a caché offline.
    event.respondWith(networkFirst(request));
  } else {
    // CSS/JS/imágenes/fuentes: cache-first (rápido), revalidando en segundo plano.
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    return cached || caches.match('./index.html');
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);

  if (cached) {
    // Revalidación en segundo plano: la próxima vez que se pida este recurso
    // ya va a estar actualizado, sin bloquear la respuesta actual.
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
        }
      })
      .catch(() => { /* sin conexión: no pasa nada, seguimos con lo cacheado */ });

    return cached;
  }

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('Recurso no disponible sin conexión.', {
      status: 503,
      statusText: 'Offline'
    });
  }
}


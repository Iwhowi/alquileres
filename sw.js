// Service worker: la app funciona sin conexión (caché de la carcasa, red primero para actualizarse).
const CACHE = 'alquileres-v2.2.0';
const ARCHIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/calc.js', 'js/store.js', 'js/state.js', 'js/ui.js', 'js/forms.js', 'js/csv.js', 'js/demo.js',
  'js/views/panel.js', 'js/views/cobros.js', 'js/views/pisos.js', 'js/views/gastos.js', 'js/views/calendario.js', 'js/views/fiscal.js', 'js/views/ajustes.js', 'js/building.js', 'js/motion.js', 'js/docs.js', 'js/adjuntos.js', 'css/escena.css',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Red primero con caída a caché: siempre la última versión si hay conexión.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});

/* Service Worker – App-Shell offline verfügbar machen.
   API-Aufrufe (api.php) laufen IMMER übers Netzwerk; die Messdaten werden
   nicht im SW-Cache gehalten (dafür sorgt der Offline-Puffer in der App). */
const CACHE = 'heustock-v1';
const ASSETS = [
  './', './index.html', './styles.css', './print.css',
  './js/api.js', './js/weather.js', './js/excel.js', './js/app.js',
  './vendor/xlsx.full.min.js', './manifest.webmanifest', './icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // API und alles mit ?action= nie cachen.
  if (url.pathname.endsWith('/api.php') || url.search.includes('action=')) return;
  if (e.request.method !== 'GET') return;
  // Fremd-Hosts (z. B. Open-Meteo) durchreichen.
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then((treffer) =>
      treffer || fetch(e.request).then((res) => {
        const kopie = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, kopie));
        return res;
      }).catch(() => caches.match('./index.html'))
    )
  );
});

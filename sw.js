/* Service worker: guarda los archivos de la app para que abra rápido.
   Cada vez que cambies algún archivo, subí el número de VERSION. */
const VERSION = "escaner-v2";
const ARCHIVOS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./lib/html5-qrcode.min.js",
  "./img/icon-192.png",
  "./img/icon-512.png",
  "./img/favicon-32.png"
];

// Al instalarse: guarda los archivos
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)));
  self.skipWaiting();
});

// Al activarse: borra versiones viejas
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Al pedir algo: los archivos propios salen de la memoria; la API va siempre a internet
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((guardado) => guardado || fetch(e.request))
  );
});

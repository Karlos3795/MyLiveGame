/* Service worker de MISIONES (versión app).
 * Guarda la interfaz en caché para que funcione sin conexión.
 * IMPORTANTE: sube el número de CACHE al publicar cambios.
 */

"use strict";

const CACHE = "misiones-app-8428b32f";

const RECURSOS = [
  "./",
  "./index.html",
  "./style.css",
  "./nucleo.js",
  "./almacen.js",
  "./manifest.webmanifest",
  "./iconos/icono-192.png",
  "./iconos/icono-512.png",
  "./iconos/icono-maskable-512.png",
  "./iconos/apple-touch-icon.png",
  "./iconos/favicon-64.png",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(RECURSOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(claves.filter((clave) => clave !== CACHE).map((clave) => caches.delete(clave)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;
  if (peticion.method !== "GET") return;

  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;

  evento.respondWith(
    caches.match(peticion, { ignoreSearch: true }).then((cached) => {
      const red = fetch(peticion)
        .then((respuesta) => {
          if (respuesta && respuesta.ok) {
            const copia = respuesta.clone();
            caches.open(CACHE).then((cache) => cache.put(peticion, copia));
          }
          return respuesta;
        })
        .catch(() => cached || caches.match("./index.html"));

      return cached || red;
    })
  );
});

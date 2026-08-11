/**
 * Service worker: кеширует оболочку приложения.
 *
 * После первой загрузки приложение работает без сети целиком — все
 * вычисления идут на устройстве. Координаты со спутников телефон тоже
 * получает без интернета, так что офлайн остаётся полностью рабочий сценарий.
 *
 * При изменении файлов поднимите CACHE_VERSION — старый кеш будет удалён.
 */

const CACHE_VERSION = 'perseids-v1';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/config/showers.js',
  './js/config/cities.js',
  './js/config/wmm2025.js',
  './js/core/astro.js',
  './js/core/magnetic.js',
  './js/core/geo.js',
  './js/core/orientation.js',
  './js/core/guidance.js',
  './js/ui/state.js',
  './js/ui/render.js',
  './js/ui/debug.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) =>
        // Один недоступный файл не должен срывать установку целиком.
        Promise.allSettled(SHELL.map((url) => cache.add(url))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      // Отдаём из кеша сразу, а свежую версию подтягиваем в фоне:
      // ночью в поле важнее мгновенный отклик, чем свежесть разметки.
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    }),
  );
});

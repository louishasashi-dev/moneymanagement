const CACHE_NAME = "money-manager-v2";
const BASE = "/moneymanagement";

const ASSETS = [
  BASE + "/",
  BASE + "/index.html",
  BASE + "/css/style.css",
  BASE + "/js/app.js",
  BASE + "/js/db.js",
  BASE + "/js/utils.js",
  BASE + "/js/dashboard.js",
  BASE + "/js/transaction.js",
  BASE + "/js/wallet.js",
  BASE + "/js/savings.js",
  BASE + "/js/debt.js",
  BASE + "/js/report.js",
  BASE + "/js/settings.js",
  BASE + "/manifest.json",
  BASE + "/images/icons/icon-192x192.png",
  BASE + "/images/icons/icon-512x512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).catch(() => caches.match(BASE + "/index.html"))
      );
    }),
  );
});

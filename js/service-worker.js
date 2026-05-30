const CACHE_NAME = "money-manager-v7";
const BASE_URL = "/moneymanagement";

const ASSETS = [
  BASE_URL + "/",
  BASE_URL + "/index.html",
  BASE_URL + "/css/style.css",
  BASE_URL + "/js/app.js",
  BASE_URL + "/js/db.js",
  BASE_URL + "/js/utils.js",
  BASE_URL + "/js/dashboard.js",
  BASE_URL + "/js/transaction.js",
  BASE_URL + "/js/wallet.js",
  BASE_URL + "/js/savings.js",
  BASE_URL + "/js/debt.js",
  BASE_URL + "/js/report.js",
  BASE_URL + "/js/settings.js",
  BASE_URL + "/manifest.json",
  BASE_URL + "/images/icons/icon-192x192.png",
  BASE_URL + "/images/icons/icon-512x512.png",
  BASE_URL + "/images/logo/logo.png",
];

// Install - cache semua assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }),
  );
  self.skipWaiting();
});

// Activate - hapus cache lama
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

// Fetch - cache first, fallback ke network
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request)
          .then((response) => {
            // Cache response baru yang berhasil
            if (response && response.status === 200) {
              const copy = response.clone();
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(event.request, copy));
            }
            return response;
          })
          .catch(() => {
            // Offline fallback ke index.html
            return caches.match(BASE_URL + "/index.html");
          })
      );
    }),
  );
});

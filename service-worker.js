const CACHE_NAME = 'fruit-staff-v4';
const IMAGE_CACHE = 'fruit-product-images-v1';
const ASSETS = ['./','./index.html','./styles.css?v=staff-v3','./app.js?v=ui-v4','./config.js?v=staff-v3'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(key => key.startsWith('fruit-staff-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

function isProductImage(request) {
  if (request.destination !== 'image') return false;
  try {
    const url = new URL(request.url);
    return url.pathname.includes('/storage/v1/object/public/product-images/');
  } catch {
    return false;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;

  // 商品圖採 cache-first。相同圖片在同一台裝置再次出現時直接從本機快取讀取，
  // 降低重複向 Supabase Storage 下載造成的 Cached Egress。
  if (isProductImage(request)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response && (response.ok || response.type === 'opaque')) {
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      })
    );
    return;
  }

  // 其他資源維持原本的 network-first 行為。
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

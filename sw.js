// V27.9 — Service Worker (캐시 버전 bump, 옛 인덱스 강제 갱신)
// 전략: cache-first (정적 자산) + network-first (API·데이터)
// V27.9: HTML(document)은 network-first로 변경 — 사용자에게 즉시 최신 UI 노출

const CACHE_VERSION = 'patchkr-v30.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

// 첫 설치 시 prefetch — 핵심 정적 자산
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/og-image.png',
];

// 캐시 max-age (밀리초)
const DATA_MAX_AGE = 30 * 60 * 1000; // 30분 (정치인·법안 JSON)

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 동일 출처만 캐싱
  if (url.origin !== self.location.origin) return;

  // API 호출: 항상 network 우선, 실패 시 cache fallback (offline)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(DATA_CACHE).then(c => c.put(req, clone)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req).then(r => r || Response.error()))
    );
    return;
  }

  // data/*.json: cache-first 30분 (stale-while-revalidate)
  if (url.pathname.startsWith('/data/') && url.pathname.endsWith('.json')) {
    event.respondWith(
      caches.open(DATA_CACHE).then(cache => cache.match(req).then(cached => {
        const fetchPromise = fetch(req).then(res => {
          if (res.ok) cache.put(req, res.clone()).catch(() => {});
          return res;
        }).catch(() => cached);
        // 캐시 있고 fresh면 즉시 반환 + 백그라운드 갱신
        if (cached) {
          const dateHeader = cached.headers.get('sw-cached-at');
          const cachedAt = dateHeader ? parseInt(dateHeader, 10) : 0;
          if (Date.now() - cachedAt < DATA_MAX_AGE) return cached;
        }
        return fetchPromise;
      }))
    );
    return;
  }

  // V27.9 — HTML(document)은 network-first (옛 UI 캐시 차단)
  // 사용자가 매번 최신 index.html을 받게 함 → /developers 옛 endpoints 안 보이는 버그 fix
  if (req.destination === 'document') {
    event.respondWith(
      fetch(req).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(STATIC_CACHE).then(c => c.put(req, clone)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req).then(r => r || Response.error()))
    );
    return;
  }

  // CSS / JS / 이미지 / 폰트: cache-first (정적 자산, URL 버전 query로 갱신)
  if (req.destination === 'style' ||
      req.destination === 'script' || req.destination === 'image' ||
      req.destination === 'font') {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) {
          // 백그라운드 갱신 (SWR)
          fetch(req).then(res => {
            if (res.ok) caches.open(STATIC_CACHE).then(c => c.put(req, res)).catch(() => {});
          }).catch(() => {});
          return cached;
        }
        return fetch(req).then(res => {
          if (res.ok && req.url.startsWith(self.location.origin)) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then(c => c.put(req, clone)).catch(() => {});
          }
          return res;
        });
      })
    );
    return;
  }
});

// 메시지 핸들러 — 캐시 강제 갱신 (사용자가 새로고침 시)
self.addEventListener('message', event => {
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});

// 서비스 워커(service worker): 앱 파일을 폰에 보관해 두었다가, 인터넷이 끊겨도 앱이 열리게 해 주는 장치.
// 규칙: 인터넷이 되면 항상 최신 파일을 받아 오고(그래서 수정이 바로 반영됨), 안 될 때만 보관해 둔 파일을 쓴다.
// 앱 파일 목록이 바뀌면 아래 CACHE 이름의 숫자를 올린다.

const CACHE = 'eodigaji-v70';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'install.html',
  'icons/install-qr.svg',
  'icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'css/tokens.css',
  'css/app.css',
  'js/main.js',
  'js/core/dates.js',
  'js/core/geo.js',
  'js/core/locate.js',
  'js/core/scoring.js',
  'js/core/segments.js',
  'js/core/store.js',
  'js/core/search.js',
  'js/core/nearby.js',
  'js/core/taste.js',
  'js/core/gphotos.js',
  'js/core/favs.js',
  'js/config.js',
  'js/data/places.js',
  'js/data/places-local.js',
  'js/data/events.js',
  'js/data/deals.js',
  'js/data/photos.js',
  'js/data/live.js',
  'js/data/dedupe.js',
  'js/ui/util.js',
  'js/ui/home.js',
  'js/ui/events.js',
  'js/ui/deals.js',
  'js/ui/mypage.js',
  'js/ui/sheet.js',
  'js/ui/trust.js',
  'js/ui/trendmap.js',
  'js/ui/course.js',
  'js/core/course.js',
  'js/data/regions.js',
  'js/ui/map.js',
  'js/ui/favs.js',
  'js/ui/sortable.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 외부 자료(장소 사진, 지도, 글꼴)는 건드리지 않는다.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))
      )
  );
});

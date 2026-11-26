/* 사케치북 서비스 워커
   안드로이드 크롬이 "앱 설치"(홈 화면에 추가)를 허락하려면 이 파일이 있어야 해요.
   화면·데이터를 따로 저장(캐시)하지 않고 항상 인터넷에서 새로 받아요 → 배포하면 바로 최신. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
// 아무것도 가로채지 않음(그냥 인터넷으로) — 설치 조건만 채워요
self.addEventListener('fetch', function () {});

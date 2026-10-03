const C = 'anureet-v1';
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(['/','/index.html','/style.css','/logo.png']))));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));

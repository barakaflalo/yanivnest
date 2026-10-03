/* YanivNest Service Worker — AppNest part 12 rules:
   per-file caching (no atomic addAll), network-first navigation with a timeout,
   never an error page, clean copies of redirected navigations (Cloudflare 308), skipWaiting. */
const VERSION = 'yanivnest-v2';
const FILES = ['./', 'index.html', 'manifest.json', 'privacy_policy.html', 'icon-192.png', 'icon-512.png'];
const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YanivNest</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#070707;color:#f3efe4;font-family:system-ui;text-align:center"><div><div style="font-size:64px">🃏</div><h2>אין חיבור לאינטרנט · You are offline</h2><p>האפליקציה תיטען כשהחיבור יחזור.</p><button onclick="location.reload()" style="font-size:18px;padding:12px 24px;border-radius:12px;border:2px solid #d4a940;background:#d4a940;color:#140f02">נסה שוב · Retry</button></div>';

// every navigation answer is served as a clean (non-redirected) copy
const _respondWith = FetchEvent.prototype.respondWith;
FetchEvent.prototype.respondWith = function (p) {
  if (this.request.mode !== 'navigate') return _respondWith.call(this, p);
  return _respondWith.call(this, Promise.resolve(p).then(r => (r && r.redirected) ? r.blob().then(b => new Response(b, { status: 200, headers: { 'Content-Type': r.headers.get('Content-Type') || 'text/html; charset=utf-8' } })) : r));
};
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(FILES.map(f => fetch(f, { cache: 'reload' }).then(r => { if (!r.ok) return; return (r.redirected ? r.blob().then(b => new Response(b, { headers: { 'Content-Type': r.headers.get('Content-Type') || '' } })) : Promise.resolve(r)).then(x => c.put(f, x)); })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const timeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, err => { clearTimeout(t); rej(err); }); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    e.respondWith(timeout(fetch(req), 4000).then(r => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then(c => c.put('index.html', cp)).catch(() => {}); } return r; })
      .catch(() => caches.match('index.html').then(r => r || caches.match('./')).then(r => r || new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))));
    return;
  }
  // PeerJS signalling + CDN scripts: always network (no caching of live connections)
  if (/peerjs|0\.peerjs\.com/.test(url.href)) return;
  if (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com/.test(url.host)) {
    e.respondWith(caches.match(req).then(hit => {
      const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)).catch(() => {}); } return r; });
      return hit ? (net.catch(() => {}), hit) : net.catch(() => new Response('', { status: 504 }));
    }));
  }
});

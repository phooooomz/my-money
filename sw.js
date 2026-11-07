// Service Worker: offline cache + Web Push Notifications
const CACHE = 'my-money-v2'; // เปลี่ยนเลขเวอร์ชันทุกครั้งที่แก้ไฟล์หน้าเว็บ เพื่อล้างแคชเก่า
const APP_SHELL = ['/', '/style.css', '/app.js', '/manifest.json', '/icon-192.png', '/icon-512.png'];
const CDN_HOSTS = ['cdn.tailwindcss.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE)
            .then(cache => Promise.allSettled(APP_SHELL.map(url => cache.add(url))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) return; // ห้ามแคช API

    const sameOrigin = url.origin === self.location.origin;
    if (!sameOrigin && !CDN_HOSTS.includes(url.hostname)) return;

    // หน้าเว็บ: ลองออนไลน์ก่อน ถ้าไม่ได้ค่อยใช้แคช
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req)
                .then(res => {
                    if (res.ok && !res.redirected) {
                        const copy = res.clone();
                        caches.open(CACHE).then(c => c.put('/', copy)).catch(() => {});
                    }
                    return res;
                })
                .catch(() => caches.match('/'))
        );
        return;
    }

    // ไฟล์อื่น: ใช้แคชก่อน แล้วอัปเดตเบื้องหลัง
    event.respondWith(
        caches.match(req).then(cached => {
            const network = fetch(req)
                .then(res => {
                    if (res && (res.ok || res.type === 'opaque')) {
                        const copy = res.clone();
                        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
                    }
                    return res;
                })
                .catch(() => cached);
            return cached || network;
        })
    );
});

// --- Web Push ---
self.addEventListener('push', event => {
    let data = { title: "สรุปรายการบัญชี", body: "มีการแจ้งเตือนใหม่จากระบบ" };
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data.body = event.data.text();
        }
    }
    const title = data.title || "สรุปรายรับ-รายจ่าย";
    const options = {
        body: data.body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        vibrate: [100, 50, 100],
        data: { url: data.url || "/" }
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const target = (event.notification.data && event.notification.data.url) || "/";
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            for (const c of list) {
                if ('focus' in c) return c.focus();
            }
            return clients.openWindow(target);
        })
    );
});

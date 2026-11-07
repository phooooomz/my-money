// Service Worker: offline cache + Web Push
const CACHE = 'my-money-v4'; // เปลี่ยนเลขเวอร์ชันทุกครั้งที่แก้ไฟล์หน้าเว็บ เพื่อล้างแคชเก่า
const DATA_CACHE = 'my-money-data'; // เก็บสรุปรายการบนเครื่อง ให้ push ใช้สร้างข้อความ (ห้ามลบตอน activate)
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
            .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== DATA_CACHE).map(k => caches.delete(k))))
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

// --- สร้างข้อความสรุปรายวันจากข้อมูลบนเครื่อง (ไม่ส่งข้อมูลการเงินออกไปไหน) ---
function localDateStr(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function fmtMoney(n) {
    return '฿' + Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function buildDailySummary() {
    let entries = [];
    try {
        const cache = await caches.open(DATA_CACHE);
        const res = await cache.match('/__summary.json');
        if (res) entries = await res.json();
    } catch (e) { /* ใช้ข้อความทั่วไปแทน */ }

    const today = localDateStr();
    const todays = Array.isArray(entries) ? entries.filter(e => e && e.date === today) : [];
    if (todays.length === 0) {
        return { title: '📝 อย่าลืมบันทึกบัญชีวันนี้', body: 'วันนี้ยังไม่มีรายการ แตะเพื่อเริ่มบันทึกได้เลย' };
    }
    let income = 0;
    let expense = 0;
    todays.forEach(e => {
        const v = Number(e.amount) || 0;
        if (e.type === 'income') income += v; else expense += v;
    });
    return {
        title: '📊 สรุปบัญชีวันนี้',
        body: `รายรับ ${fmtMoney(income)} • รายจ่าย ${fmtMoney(expense)} • คงเหลือ ${fmtMoney(income - expense)} (${todays.length} รายการ)`
    };
}

// --- Web Push ---
self.addEventListener('push', event => {
    event.waitUntil((async () => {
        let data = null;
        if (event.data) {
            try { data = event.data.json(); } catch (e) { data = { body: event.data.text() }; }
        }
        // เซิร์ฟเวอร์ส่งสัญญาณปลุกเปล่าๆ มา จึงสร้างข้อความเองบนเครื่อง
        if (!data || (!data.title && !data.body)) {
            try {
                data = await buildDailySummary();
            } catch (e) {
                data = { title: 'สรุปรายรับ-รายจ่าย', body: 'ถึงเวลาดูสรุปบัญชีแล้ว' };
            }
        }
        await self.registration.showNotification(data.title || 'สรุปรายรับ-รายจ่าย', {
            body: data.body || '',
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: 'daily-summary',
            renotify: true,
            vibrate: [100, 50, 100],
            data: { url: data.url || '/' }
        });
    })());
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const target = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            for (const c of list) {
                if ('focus' in c) return c.focus();
            }
            return clients.openWindow(target);
        })
    );
});
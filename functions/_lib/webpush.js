// functions/_lib/webpush.js — ตัวช่วยส่ง Web Push (ไม่ใช่ route)
// ส่ง "push เปล่า" (ไม่มี payload) พร้อมลายเซ็น VAPID ด้วย Web Crypto
// เนื้อหาแจ้งเตือนจะถูกสร้างบนเครื่องผู้ใช้โดย Service Worker (sw.js)

// อนุญาตเฉพาะ push service ของเบราว์เซอร์จริง กันคนใส่ URL แปลกๆ ให้เซิร์ฟเวอร์ยิงไปหา
const ALLOWED_HOSTS = [
    /^fcm\.googleapis\.com$/,
    /(^|\.)push\.services\.mozilla\.com$/,
    /(^|\.)notify\.windows\.com$/,
    /(^|\.)push\.apple\.com$/
];

export function isAllowedEndpoint(endpoint) {
    try {
        if (typeof endpoint !== 'string' || endpoint.length > 2048) return false;
        const u = new URL(endpoint);
        return u.protocol === 'https:' && ALLOWED_HOSTS.some(r => r.test(u.hostname));
    } catch {
        return false;
    }
}

export function validTimeZone(tz) {
    try {
        if (typeof tz !== 'string' || tz.length > 64) return false;
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
    } catch {
        return false;
    }
}

// วันที่และเวลา (เป็นนาทีของวัน) ตามเขตเวลาของผู้สมัคร
export function localNow(tz, now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(now);
    const get = t => parts.find(p => p.type === t).value;
    return {
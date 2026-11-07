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
        date: `${get('year')}-${get('month')}-${get('day')}`,
        minutes: Number(get('hour')) * 60 + Number(get('minute'))
    };
}

function b64urlToBytes(s) {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function bytesToB64url(bytes) {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let keyCache = { pub: null, key: null };

async function getSigningKey(env) {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
        throw new Error('ยังไม่ได้ตั้ง VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY');
    }
    if (keyCache.key && keyCache.pub === env.VAPID_PUBLIC_KEY + env.VAPID_PRIVATE_KEY) return keyCache.key;
    const pub = b64urlToBytes(env.VAPID_PUBLIC_KEY);
    if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY ไม่ถูกต้อง');
    const key = await crypto.subtle.importKey(
        'jwk',
        { kty: 'EC', crv: 'P-256', x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33)), d: env.VAPID_PRIVATE_KEY, ext: true },
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign']
    );
    keyCache = { pub: env.VAPID_PUBLIC_KEY + env.VAPID_PRIVATE_KEY, key };
    return key;
}

export async function vapidAuthHeader(endpoint, env) {
    if (!env.VAPID_SUBJECT) throw new Error('ยังไม่ได้ตั้ง VAPID_SUBJECT (เช่น mailto:you@example.com)');
    const enc = new TextEncoder();
    const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const claims = bytesToB64url(enc.encode(JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: env.VAPID_SUBJECT
    })));
    const data = `${header}.${claims}`;
    // ECDSA ใน Web Crypto ให้ลายเซ็นแบบ r||s 64 ไบต์ ซึ่งตรงกับที่ JWT ES256 ต้องการ
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await getSigningKey(env), enc.encode(data)));
    return `vapid t=${data}.${bytesToB64url(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

// ส่ง push เปล่าไปยัง endpoint คืน { ok, status, gone }
export async function sendEmptyPush(endpoint, env, ttl = 3600) {
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
            Authorization: await vapidAuthHeader(endpoint, env),
            TTL: String(ttl),
            Urgency: 'normal'
        }
    });
    await res.arrayBuffer().catch(() => {});
    return { ok: res.status >= 200 && res.status < 300, status: res.status, gone: res.status === 404 || res.status === 410 };
}

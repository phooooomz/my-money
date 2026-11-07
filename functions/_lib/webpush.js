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

// functions/api/push.js  ->  /api/push
//   GET     คืนค่า VAPID public key
//   POST    สมัคร/อัปเดตการแจ้งเตือนของอุปกรณ์นี้  { endpoint, time, tz, lastSent? }
//   DELETE  ยกเลิก                                  { endpoint }
//   PUT     ส่ง push ทดสอบมาที่อุปกรณ์นี้           { endpoint }
import { isAllowedEndpoint, validTimeZone, sendEmptyPush } from '../_lib/webpush.js';

const MAX_SUBSCRIPTIONS = 200;

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
}

async function readJson(request) {
    try { return await request.json(); } catch { return null; }
}

function needDb(env) {
    return env.DB ? null : json({ error: 'ยังไม่ได้ผูกฐานข้อมูล D1 (ชื่อตัวแปร DB) กับโปรเจกต์ Pages' }, 503);
}

export async function onRequestGet({ env }) {
    if (!env.VAPID_PUBLIC_KEY) return json({ error: 'ยังไม่ได้ตั้ง VAPID_PUBLIC_KEY' }, 503);
    return json({ publicKey: env.VAPID_PUBLIC_KEY });
}

export async function onRequestPost({ request, env }) {
    const noDb = needDb(env);
    if (noDb) return noDb;

    const body = await readJson(request);
    if (!body || !isAllowedEndpoint(body.endpoint)) return json({ error: 'endpoint ไม่ถูกต้อง' }, 400);

    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(body.time) ? body.time : '18:00';
    const tz = validTimeZone(body.tz) ? body.tz : 'Asia/Bangkok';
    // lastSent: วันที่ล่าสุดที่เตือนไปแล้ว (null = ไม่เปลี่ยนค่าเดิม)
    const lastSent = typeof body.lastSent === 'string' && /^(\d{4}-\d{2}-\d{2})?$/.test(body.lastSent) ? body.lastSent : null;

    const existing = await env.DB.prepare('SELECT 1 AS x FROM push_subscriptions WHERE endpoint = ?1').bind(body.endpoint).first();
    if (!existing) {
        const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').first();
        if ((c?.n ?? 0) >= MAX_SUBSCRIPTIONS) return json({ error: 'จำนวนผู้สมัครเต็มแล้ว' }, 429);
    }

    await env.DB.prepare(
        `INSERT INTO push_subscriptions (endpoint, time, tz, last_sent)
         VALUES (?1, ?2, ?3, COALESCE(?4, ''))
         ON CONFLICT(endpoint) DO UPDATE SET
           time = excluded.time,
           tz = excluded.tz,
           last_sent = COALESCE(?4, push_subscriptions.last_sent)`
    ).bind(body.endpoint, time, tz, lastSent).run();

    return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
    const noDb = needDb(env);
    if (noDb) return noDb;
    const body = await readJson(request);
    if (!body || typeof body.endpoint !== 'string') return json({ error: 'endpoint ไม่ถูกต้อง' }, 400);
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1').bind(body.endpoint).run();
    return json({ ok: true });
}

// ส่ง push ทดสอบ (ต้องสมัครไว้แล้วเท่านั้น จึงไม่เป็นช่องทางให้ยิงไปที่อื่น)
export async function onRequestPut({ request, env }) {
    const noDb = needDb(env);
    if (noDb) return noDb;
    const body = await readJson(request);
    if (!body || typeof body.endpoint !== 'string') return json({ error: 'endpoint ไม่ถูกต้อง' }, 400);

    const row = await env.DB.prepare('SELECT endpoint FROM push_subscriptions WHERE endpoint = ?1').bind(body.endpoint).first();
    if (!row) return json({ error: 'ยังไม่พบการสมัครของอุปกรณ์นี้ ลองปิดแล้วเปิดการแจ้งเตือนใหม่' }, 404);

    try {
        const r = await sendEmptyPush(row.endpoint, env);
        if (r.gone) {
            await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1').bind(row.endpoint).run();
            return json({ error: 'การสมัครหมดอายุ กรุณาปิดแล้วเปิดการแจ้งเตือนใหม่' }, 410);
        }
        return json({ ok: r.ok, status: r.status, error: r.ok ? undefined : `push service ตอบ ${r.status}` }, r.ok ? 200 : 502);
    } catch (err) {
        return json({ error: err.message }, 500);
    }
}

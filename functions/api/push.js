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

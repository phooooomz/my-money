// functions/api/cron-summary.js  ->  POST /api/cron-summary
// เรียกโดย cron-worker ทุก 15 นาที: ส่ง push ปลุกให้ทุกอุปกรณ์ที่ถึงเวลาเตือนแล้ว
// (ต้องส่ง Authorization: Bearer <CRON_SECRET>)
import { sendEmptyPush, localNow } from '../_lib/webpush.js';

const WINDOW_MINUTES = 60;  // ถ้า cron พลาดรอบ ยังส่งย้อนหลังได้ไม่เกิน 1 ชั่วโมง
const MAX_PER_RUN = 40;     // กันเกินลิมิต subrequest ของ Cloudflare รอบที่เหลือจะถูกส่งในรอบถัดไป

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
}

function safeEqual(a, b) {
    const enc = new TextEncoder();
    const x = enc.encode(a);
    const y = enc.encode(b);
    let diff = x.length ^ y.length;
    for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
    return diff === 0;
}

export async function onRequestPost({ request, env }) {
    if (!env.CRON_SECRET) return json({ error: 'ยังไม่ได้ตั้ง CRON_SECRET' }, 500);
    const auth = request.headers.get('Authorization') || '';
    if (!safeEqual(auth, `Bearer ${env.CRON_SECRET}`)) return json({ error: 'Unauthorized' }, 401);
    if (!env.DB) return json({ error: 'ยังไม่ได้ผูกฐานข้อมูล D1 (DB)' }, 500);

    const { results } = await env.DB.prepare('SELECT endpoint, time, tz, last_sent FROM push_subscriptions').all();

    const now = new Date();
    const due = [];
    for (const s of results ?? []) {
        try {
            const local = localNow(s.tz, now);
            const [h, m] = s.time.split(':').map(Number);
            const target = h * 60 + m;
            if (s.last_sent !== local.date && local.minutes >= target && local.minutes - target < WINDOW_MINUTES) {
                due.push({ ...s, date: local.date });
            }
        } catch (e) {
            console.error('bad subscription row:', e);
        }
    }

    const batch = due.slice(0, MAX_PER_RUN);
    const outcomes = await Promise.allSettled(batch.map(s => sendEmptyPush(s.endpoint, env)));

    const stmts = [];
    let sent = 0, removed = 0, failed = 0;
    outcomes.forEach((o, i) => {
        const s = batch[i];
        if (o.status === 'fulfilled' && o.value.ok) {
            sent++;
            stmts.push(env.DB.prepare('UPDATE push_subscriptions SET last_sent = ?1 WHERE endpoint = ?2').bind(s.date, s.endpoint));
        } else if (o.status === 'fulfilled' && o.value.gone) {
            removed++;
            stmts.push(env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1').bind(s.endpoint));
        } else {
            failed++;
            console.error('push failed:', o.status === 'fulfilled' ? o.value.status : o.reason?.message);
        }
    });
    if (stmts.length) await env.DB.batch(stmts);

    return json({ ok: true, subscribers: results?.length ?? 0, due: due.length, sent, removed, failed });
}

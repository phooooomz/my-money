// Worker แยกสำหรับ Cron Trigger (Pages ทำ cron เองไม่ได้)
// รันทุก 15 นาที แล้วเรียก /api/cron-summary เพื่อส่ง push ให้อุปกรณ์ที่ถึงเวลาเตือน
export default {
    async scheduled(event, env, ctx) {
        ctx.waitUntil(run(env));
    }
};

async function run(env) {
    try {
        const res = await fetch(env.TARGET_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${env.CRON_SECRET}` }
        });
        const text = await res.text();
        if (!res.ok) console.error('cron-summary failed:', res.status, text);
        else console.log('cron-summary:', text);
    } catch (err) {
        console.error('cron error:', err);
    }
}

 /**
 * Cloudflare Scheduled Worker (CRON Trigger)
 * This function triggers automatically based on CRON schedules configured in Cloudflare Pages.
 * 
 * Target Time: 18:00 Thai Time (UTC+7) = 11:00 UTC
 */

export async function onScheduled(event, env, ctx) {
    const cron = event.cron;
    let summaryType = "รายวัน";
    let dayLimit = 1;

    // Check CRON Schedule Type (11:00 UTC = 18:00 Thai Time)
    if (cron === "0 11 * * 0") { // Every Sunday at 18:00 Thai Time
        summaryType = "รายสัปดาห์ (7 วัน)";
        dayLimit = 7;
    } else if (cron === "0 11 1 * *") { // 1st day of every month at 18:00 Thai Time
        summaryType = "รายเดือน (30 วัน)";
        dayLimit = 30;
    }

    // Call Gemini API to construct notification text
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) return;

    const prompt = `สร้างข้อความแจ้งเตือนสั้นๆ ความยาวไม่เกิน 2 ประโยค สำหรับสรุปบัญชีการเงินประเภท "${summaryType}" เพื่อส่งเตือนผู้ใช้ทาง Push Notification`;

    try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        const notificationText = data.candidates?.[0]?.content?.parts?.[0]?.text || `สรุปบัญชีประจำ ${summaryType}`;

        console.log(`[CRON EXECUTED] ${summaryType} (18:00 THA):`, notificationText);
        
        // Push Notification Broadcast logic can be integrated with WebPush library here using env KV/D1 stored user subscriptions.
    } catch (err) {
        console.error("Cron notification error:", err);
    }
}

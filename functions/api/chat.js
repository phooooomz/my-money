export async function onRequestPost(context) {
    try {
        const apiKey = context.env.GEMINI_API_KEY;

        if (!apiKey) {
            return new Response(JSON.stringify({ 
                error: "ไม่พบ GEMINI_API_KEY ใน Environment Variables ของ Cloudflare Pages" 
            }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }

        const body = await context.request.json();
        const prompt = body.prompt;
        const records = body.records || [];

        const systemPrompt = `คุณคือผู้ช่วย AI ประจำแอปจดรายรับ-รายจ่ายภาษาไทย 
ฐานข้อมูลปัจจุบันในแอปของผู้ใช้: ${JSON.stringify(records)}

หน้าที่ของคุณ:
1. ตอบคำถามเกี่ยวกับสรุปทางการเงินของผู้ใช้ตามข้อมูลด้านบน
2. หากผู้ใช้สั่งให้บันทึกรายการ ให้ตอบยืนยันการบันทึกอย่างสุภาพ
3. ตอบอย่างกระชับ มินิมอล เป็นกันเอง สุภาพ และใช้ภาษาไทยเท่านั้น`;

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

        const geminiResponse = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] }
            })
        });

        const result = await geminiResponse.json();
        const aiText = result.candidates?.[0]?.content?.parts?.[0]?.text || "ไม่สามารถประมวลผลคำตอบได้";

        return new Response(JSON.stringify({ reply: aiText }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

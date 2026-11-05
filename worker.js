export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/api/transactions") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM transactions ORDER BY created_at DESC"
        ).all();
        return new Response(JSON.stringify(results), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (request.method === "POST" && url.pathname === "/api/transactions") {
        const body = await request.json();
        const { amount, type, category, note } = body;

        await env.DB.prepare(
          "INSERT INTO transactions (amount, type, category, note, created_at) VALUES (?, ?, ?, ?, ?)"
        ).bind(amount, type, category, note || "", Date.now()).run();

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (request.method === "DELETE" && url.pathname.startsWith("/api/transactions/")) {
        const id = url.pathname.split("/").pop();
        await env.DB.prepare("DELETE FROM transactions WHERE id = ?").bind(id).run();
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (request.method === "POST" && url.pathname === "/api/ai") {
        const body = await request.json();
        const promptText = body.prompt;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;
        const geminiRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        });

        const geminiData = await geminiRes.json();
        return new Response(JSON.stringify(geminiData), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
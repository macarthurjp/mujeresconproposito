// Called every minute by pg_cron (job "mcp930-content-push").
// Delivers "new content" pushes queued by the database triggers (new
// devotional, video or destacada) to devices with content alerts on.
// Scheduled devotionals are queued here once their publication time arrives.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MEETING_CRON_SECRET.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { sendExpoPush, timingSafeEqual } from "../_shared/expo-push.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const secret = Deno.env.get("MEETING_CRON_SECRET") || "";
    if (!timingSafeEqual(req.headers.get("x-cron-secret") || "", secret)) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Scheduled devotionals that just became visible.
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: due } = await supabase.from("devocionales")
      .select("id,titulo,slug,fecha_publicacion")
      .eq("publicado", true).gte("fecha_publicacion", since).lte("fecha_publicacion", new Date().toISOString());
    for (const d of due ?? []) {
      await supabase.from("content_push_queue").upsert(
        { tipo: "devocional", ref: String(d.id), titulo: "Nuevo devocional", cuerpo: d.titulo || "Una nueva reflexión para ti", ruta: `/devocional/${d.slug}` },
        { onConflict: "tipo,ref", ignoreDuplicates: true },
      );
    }

    const { data: queue, error } = await supabase.from("content_push_queue")
      .select("id,tipo,titulo,cuerpo,ruta").is("sent_at", null).order("created_at").limit(5);
    if (error) throw error;
    if (!queue?.length) return json({ ok: true, sent: 0 });

    const { data: devices, error: devError } = await supabase.from("push_tokens")
      .select("token").eq("activo", true).eq("avisos_contenido", true);
    if (devError) throw devError;
    const tokens = (devices ?? []).map((d) => d.token as string);

    let total = 0;
    const dead = new Set<string>();
    for (const item of queue) {
      // Mark first so a slow run never sends the same item twice.
      await supabase.from("content_push_queue").update({ sent_at: new Date().toISOString() }).eq("id", item.id);
      if (!tokens.length) continue;
      const { sent, dead: d } = await sendExpoPush(tokens.map((to) => ({
        to, title: item.titulo, body: item.cuerpo || "", channelId: "reuniones",
        data: { type: "content", tipo: item.tipo, ruta: item.ruta },
      })));
      total += sent;
      d.forEach((t) => dead.add(t));
    }
    if (dead.size) await supabase.from("push_tokens").update({ activo: false }).in("token", [...dead]);
    return json({ ok: true, items: queue.length, sent: total });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

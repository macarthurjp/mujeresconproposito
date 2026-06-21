import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, jsonResponse, requiredEnv } from "../_shared/http.ts";

type Member = {
  nombre: string | null;
  apellido: string | null;
  fecha_nacimiento: string | null;
};

function getLuxembourgTodayMonthDay() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Luxembourg",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";

  return `${month}-${day}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const todayMonthDay = getLuxembourgTodayMonthDay();

    const { data, error } = await supabase
      .from("unirse")
      .select("nombre,apellido,fecha_nacimiento")
      .not("fecha_nacimiento", "is", null);

    if (error) throw error;

    const cumpleanerasHoy = (data || [])
      .filter((member: Member) => member.fecha_nacimiento?.slice(5, 10) === todayMonthDay)
      .map((member: Member) => ({
        nombreCompleto: [member.nombre, member.apellido].filter(Boolean).join(" ").trim() || "Cumpleañera",
      }));

    return jsonResponse({ ok: true, cumpleanerasHoy });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error(error);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});

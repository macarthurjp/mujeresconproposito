import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, jsonResponse, requiredEnv } from "../_shared/http.ts";
import { addDaysISO, birthdayMatches, luxembourgTodayISO } from "../_shared/birthdays.ts";

type Member = {
  nombre: string | null;
  apellido: string | null;
  fecha_nacimiento: string | null;
};

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
    const todayISO = luxembourgTodayISO();

    const { data, error } = await supabase
      .from("unirse")
      .select("nombre,apellido,fecha_nacimiento")
      .not("fecha_nacimiento", "is", null);

    if (error) throw error;

    const members = (data || []) as Member[];
    const nombreCompleto = (member: Member) =>
      [member.nombre, member.apellido].filter(Boolean).join(" ").trim() || "Cumpleañera";

    const cumpleanerasHoy = members
      .filter((member) => member.fecha_nacimiento && birthdayMatches(member.fecha_nacimiento, todayISO))
      .map((member: Member) => ({
        nombreCompleto: nombreCompleto(member),
      }));

    const proximosCumpleanos = Array.from({ length: 30 }, (_, index) => index + 1)
      .flatMap((days) => {
        const fecha = addDaysISO(todayISO, days);
        return members
          .filter((member) => member.fecha_nacimiento && birthdayMatches(member.fecha_nacimiento, fecha))
          .map((member) => ({ nombreCompleto: nombreCompleto(member), fecha, dias: days }));
      })
      .slice(0, 8);

    return jsonResponse({ ok: true, cumpleanerasHoy, proximosCumpleanos });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error(error);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});

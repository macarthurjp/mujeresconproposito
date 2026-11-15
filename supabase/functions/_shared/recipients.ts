import { requiredEnv } from "./http.ts";

type Form = "contact" | "join";

/**
 * E-mail addresses that should receive a form notification, as configured by
 * the Super Admin in `notification_recipients`.
 *  - contact: every active contact recipient.
 *  - join: recipients for the selected community plus those set to "all".
 * Falls back to the CONTACT_EMAIL secret when nothing is configured (or the
 * lookup fails), so a message is never dropped.
 */
export async function getRecipients(form: Form, comunidad?: string): Promise<string[]> {
  const fallback = splitEmails(requiredEnv("CONTACT_EMAIL"));
  try {
    const url = requiredEnv("SUPABASE_URL");
    const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const query = new URLSearchParams({ select: "email,comunidad", form: `eq.${form}`, active: "eq.true" });
    const response = await fetch(`${url}/rest/v1/notification_recipients?${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!response.ok) throw new Error(`recipients ${response.status}: ${await response.text()}`);
    const rows = (await response.json()) as { email: string; comunidad: string | null }[];
    const wanted = normalize(comunidad);
    const matches = rows.filter((row) => form === "contact" || !row.comunidad || normalize(row.comunidad) === wanted);
    const emails = unique(matches.map((row) => row.email));
    return emails.length ? emails : fallback;
  } catch (error) {
    console.error("getRecipients fallback", error);
    return fallback;
  }
}

function normalize(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function splitEmails(value: string) {
  return unique(value.split(","));
}

function unique(list: string[]) {
  const seen = new Set<string>();
  return list.map((email) => email.trim()).filter((email) => {
    const key = email.toLowerCase();
    if (!email || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

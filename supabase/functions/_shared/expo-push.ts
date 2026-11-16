// Minimal Expo push sender shared by the content and broadcast functions.
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH = 100;

export type PushMessage = { to: string; title: string; body: string; data?: Record<string, unknown>; channelId?: string };

/** Sends messages in batches; returns how many were accepted and which tokens are dead. */
export async function sendExpoPush(messages: PushMessage[]) {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let sent = 0;
  const dead: string[] = [];
  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH).map((m) => ({ sound: "default", priority: "high", channelId: m.channelId ?? "reuniones", ...m }));
    const response = await fetch(EXPO_PUSH_URL, { method: "POST", headers, body: JSON.stringify(batch) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Expo push failed (${response.status}): ${JSON.stringify(payload).slice(0, 300)}`);
    const tickets: { status: string; details?: { error?: string } }[] = Array.isArray(payload?.data) ? payload.data : [];
    tickets.forEach((t, index) => {
      if (t.status === "ok") sent += 1;
      else if (t.details?.error === "DeviceNotRegistered") dead.push(batch[index].to);
    });
  }
  return { sent, dead };
}

export function timingSafeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

import { requiredEnv } from "./http.ts";

export type TurnstileResult = {
  success: boolean;
  action?: string;
  hostname?: string;
  errorCodes?: string[];
};

export async function verifyTurnstile(token: unknown, remoteip: string | null): Promise<TurnstileResult> {
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return { success: false, errorCodes: ["missing-input-response"] };
  }

  const secret = requiredEnv("TURNSTILE_SECRET");
  const body = new URLSearchParams({ secret, response: token });
  if (remoteip) body.set("remoteip", remoteip);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return { success: false, errorCodes: [`siteverify-http-${response.status}`] };
    }

    const data = await response.json();
    return {
      success: data.success === true,
      action: data.action,
      hostname: data.hostname,
      errorCodes: data["error-codes"],
    };
  } catch (error) {
    console.error("Turnstile siteverify request failed", error);
    return { success: false, errorCodes: ["siteverify-network-error"] };
  }
}

export function getClientIp(req: Request): string | null {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip");
}

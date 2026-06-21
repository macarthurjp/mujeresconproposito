import { requiredEnv } from "./http.ts";

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail({ to, subject, html, text }: EmailPayload) {
  const apiKey = requiredEnv("BREVO_API_KEY");
  const sender = parseSender(requiredEnv("EMAIL_FROM"));

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Email provider error: ${response.status}`);
  }

  return data;
}

function parseSender(value: string) {
  const match = value.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);

  if (match) {
    return {
      name: match[1].trim(),
      email: match[2].trim(),
    };
  }

  return {
    name: Deno.env.get("EMAIL_FROM_NAME") || "Mujeres con Proposito",
    email: value.trim(),
  };
}

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

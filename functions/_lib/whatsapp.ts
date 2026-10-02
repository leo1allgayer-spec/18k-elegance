import type { Env } from "./types";

export function normalizeBrazilPhone(value: string): string | null {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return /^55\d{10,11}$/.test(digits) ? digits : null;
}

export function whatsappConfigured(env: Env): boolean {
  return Boolean(env.EVOLUTION_API_URL && env.EVOLUTION_API_KEY && env.EVOLUTION_INSTANCE);
}

export async function sendWhatsAppMessage(env: Env, to: string, text: string): Promise<void> {
  if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY || !env.EVOLUTION_INSTANCE) throw new Error("EVOLUTION_NOT_CONFIGURED");
  const baseUrl = env.EVOLUTION_API_URL.trim().replace(/\/+$/, "");
  const apiKey = env.EVOLUTION_API_KEY.trim();
  const instance = env.EVOLUTION_INSTANCE.trim();
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("EVOLUTION_URL_INVALID");
  const response = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, {
    method: "POST",
    headers: { apikey: apiKey, "Content-Type": "application/json" },
    // Some Evolution installations fail the entire request while generating a
    // remote link preview. The URL remains clickable in WhatsApp without it.
    body: JSON.stringify({ number: to, text, delay: 800, linkPreview: false }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    console.error("Evolution API error", { status: response.status });
    throw new Error(`EVOLUTION_SEND_FAILED_${response.status}`);
  }
}

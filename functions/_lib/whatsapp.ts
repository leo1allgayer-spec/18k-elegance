import type { Env } from "./types";

export function normalizeBrazilPhone(value: string): string | null {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return /^55\d{10,11}$/.test(digits) ? digits : null;
}

export function whatsappConfigured(env: Env): boolean {
  return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
}

export async function sendWhatsAppTemplate(env: Env, to: string, templateName: string, values: string[]): Promise<void> {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) throw new Error("WHATSAPP_NOT_CONFIGURED");
  const response = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(env.WHATSAPP_PHONE_NUMBER_ID)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE || "pt_BR" },
        components: [{ type: "body", parameters: values.map(text => ({ type: "text", text })) }],
      },
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    console.error("WhatsApp Cloud API error", { status: response.status, detail });
    throw new Error("WHATSAPP_SEND_FAILED");
  }
}

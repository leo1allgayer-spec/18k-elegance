export interface Env {
  DB: D1Database;
  PERSONALIZATION_BUCKET?: R2Bucket;
  MERCADO_PAGO_ACCESS_TOKEN?: string;
  MERCADO_PAGO_WEBHOOK_SECRET?: string;
  CORREIOS_API_TOKEN?: string;
  CORREIOS_USER?: string;
  CORREIOS_ACCESS_CODE?: string;
  CORREIOS_POSTING_CARD?: string;
  CORREIOS_ORIGIN_ZIP?: string;
  CORREIOS_PAC_CODE?: string;
  CORREIOS_SEDEX_CODE?: string;
  CORREIOS_CONTRACT?: string;
  CORREIOS_DR?: string;
  BLING_CLIENT_ID?: string;
  BLING_CLIENT_SECRET?: string;
}

export interface SessionCustomer {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  birth_date: string | null;
  role: "customer" | "admin";
}

export interface Env {
  DB: D1Database;
  MERCADO_PAGO_ACCESS_TOKEN?: string;
  MERCADO_PAGO_WEBHOOK_SECRET?: string;
  CORREIOS_API_TOKEN?: string;
  CORREIOS_ORIGIN_ZIP?: string;
  CORREIOS_PAC_CODE?: string;
  CORREIOS_SEDEX_CODE?: string;
  CORREIOS_CONTRACT?: string;
  CORREIOS_DR?: string;
}

export interface SessionCustomer {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  birth_date: string | null;
  role: "customer" | "admin";
}

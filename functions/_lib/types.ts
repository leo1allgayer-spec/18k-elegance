export interface Env {
  DB: D1Database;
  MERCADO_PAGO_ACCESS_TOKEN?: string;
  MERCADO_PAGO_WEBHOOK_SECRET?: string;
  CORREIOS_API_TOKEN?: string;
}

export interface SessionCustomer {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  birth_date: string | null;
  role: "customer" | "admin";
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

export function apiError(message: string, status = 400, code = "BAD_REQUEST"): Response {
  return json({ ok: false, error: { code, message } }, status);
}

export async function readJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) throw new Error("Envie os dados em formato JSON.");
  return request.json<T>();
}

export function normalizeEmail(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR");
}

export function parseCookies(request: Request): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of (request.headers.get("cookie") || "").split(";")) {
    const index = pair.indexOf("=");
    if (index > 0) result[pair.slice(0, index).trim()] = decodeURIComponent(pair.slice(index + 1).trim());
  }
  return result;
}

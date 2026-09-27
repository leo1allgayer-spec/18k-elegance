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
  const value = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, 65536)));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON inválido.');
  return value as T;
}

export class BodyTooLarge extends Error {}

export async function readBoundedBody(request: Pick<Request, 'headers' | 'body'>, maximum: number): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(request.headers.get('content-length')) > maximum) throw new BodyTooLarge();
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) { void reader.cancel().catch(() => {}); throw new BodyTooLarge(); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR");
}

export function parseCookies(request: Request): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of (request.headers.get("cookie") || "").split(";")) {
    const index = pair.indexOf("=");
    if (index > 0) {
      try { result[pair.slice(0, index).trim()] = decodeURIComponent(pair.slice(index + 1).trim()); }
      catch { /* Ignore malformed cookies instead of failing authentication. */ }
    }
  }
  return result;
}

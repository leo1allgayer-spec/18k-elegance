const encoder = new TextEncoder();
const keyFor = (secret: string) => crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
export async function signStockTick(secret: string, timestamp: string) {
  const signature = await crypto.subtle.sign("HMAC", await keyFor(secret), encoder.encode(`stock-sync:${timestamp}`));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function verifyStockTick(secret: string, timestamp: string, signature: string) {
  const time = Number(timestamp);
  if (!Number.isSafeInteger(time) || Math.abs(Date.now() - time) > 60000 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const bytes = new Uint8Array(signature.match(/../g)!.map(value => parseInt(value, 16)));
  return crypto.subtle.verify("HMAC", await keyFor(secret), bytes, encoder.encode(`stock-sync:${timestamp}`));
}

// A shared baseline distinguishes our own writes from a change made in Bling.
// Simultaneous edits are held for review, never silently resolved by a timestamp.
export function stockDecision(site: number, bling: number, baseline: number | null): "initialize" | "equal" | "push" | "pull" | "conflict" {
  if (baseline === null) return "initialize";
  if (site === bling && site === baseline) return "equal";
  if (bling === baseline) return "push";
  if (site === baseline) return "pull";
  return "conflict";
}

export function inventoryNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Saldo inválido ou fracionário. Confira o estoque no Bling.");
  }
  return value;
}

import type { Env } from "./types";
import { blingAccessToken } from "./bling";
import { inventoryNumber, stockDecision } from "./stock-decision";

type Link = { variant_id: number; bling_id: number; deposit_id: number; baseline: number | null;
  pending_target: number | null; status: string; stock: number; name: string; error: string | null };
type RemoteProduct = { id: number; nome: string; codigo: string; situacao: string; formato: string };
type Deposit = { id: number; descricao: string; situacao: number };
type Balance = { produto: { id: number }; saldoFisicoTotal: number; saldoVirtualTotal: number };
export type StockControl = { enabled: number; secret: string; lease: string | null; lease_until: number; last_run: string | null; last_error: string | null };

class BlingRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
  get rejected() { return [400,401,403,404,422,429].includes(this.status); }
}

export async function stockSchema(env: Pick<Env, "DB">): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS bling_stock_control (
      id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0,
      secret TEXT NOT NULL, lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
      last_run TEXT, last_error TEXT, last_tick TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS bling_stock_links (
      variant_id INTEGER PRIMARY KEY REFERENCES product_variants(id),
      bling_id INTEGER NOT NULL UNIQUE, deposit_id INTEGER NOT NULL,
      baseline INTEGER, pending_target INTEGER, status TEXT NOT NULL DEFAULT 'initializing',
      error TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS bling_stock_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, variant_id INTEGER NOT NULL,
      direction TEXT NOT NULL, old_stock INTEGER, new_stock INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS bling_stock_exports (
      variant_id INTEGER PRIMARY KEY REFERENCES product_variants(id), sku TEXT NOT NULL UNIQUE,
      bling_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
  ]);
  await env.DB.prepare("INSERT OR IGNORE INTO bling_stock_control(id,secret) VALUES(1,?)")
    .bind(crypto.randomUUID() + crypto.randomUUID()).run();
}

async function bling<T>(token: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`https://api.bling.com.br/Api/v3${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    const operation = path === "/produtos" && body !== undefined ? "cadastrar produtos" : path === "/estoques" && body !== undefined ? "movimentar estoque" : "consultar este recurso";
    throw new BlingRequestError(response.status === 401 ? "Reconecte o Bling nas configurações." :
      response.status === 403 ? `O aplicativo Bling não tem permissão para ${operation}. Autorize esse acesso e reconecte a conta.` :
      `Bling indisponível ou operação recusada (HTTP ${response.status}).`, response.status);
  }
  const result = await response.json<{ data: T }>();
  if (!result || !("data" in result)) throw new Error("Resposta inválida do Bling.");
  return result.data;
}

export async function stockCatalog(env: Env) {
  await stockSchema(env);
  const token = await blingAccessToken(env);
  // Paginate, but fail closed if this installation grows beyond the bounded UI.
  const products: RemoteProduct[] = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await bling<RemoteProduct[]>(token, `/produtos?limite=100&pagina=${page}`);
    products.push(...batch);
    if (batch.length < 100) break;
    if (page === 10) throw new Error("Catálogo grande demais para esta tela. Refine a integração antes de vincular.");
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  const deposits = await bling<Deposit[]>(token, "/depositos?limite=100&pagina=1");
  const variants = await env.DB.prepare(`SELECT v.id,v.product_id,p.name,v.name AS variant_name,v.sku,v.stock,
    p.sku AS product_sku FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.active=1 AND p.active=1`).all();
  return { products, deposits, variants: variants.results };
}

export async function stockStatus(env: Env) {
  await stockSchema(env);
  const control = await env.DB.prepare("SELECT enabled,last_run,last_error,last_tick FROM bling_stock_control WHERE id=1").first();
  const links = await env.DB.prepare(`SELECT l.variant_id,l.bling_id,l.deposit_id,l.baseline,l.pending_target,
    l.status,l.error,l.updated_at,v.stock,p.name FROM bling_stock_links l
    JOIN product_variants v ON v.id=l.variant_id JOIN products p ON p.id=v.product_id`).all();
  return { control, links: links.results };
}

async function acquire(env: Env): Promise<string> {
  const lease = crypto.randomUUID();
  const result = await env.DB.prepare("UPDATE bling_stock_control SET lease=?,lease_until=? WHERE id=1 AND lease_until<?")
    .bind(lease, Date.now() + 180000, Date.now()).run();
  if (!result.meta.changes) throw new Error("Há uma sincronização em andamento. Aguarde e tente novamente.");
  return lease;
}
async function release(env: Env, lease: string) {
  await env.DB.prepare("UPDATE bling_stock_control SET lease=NULL,lease_until=0 WHERE id=1 AND lease=?").bind(lease).run();
}

async function balance(token: string, productId: number, depositId: number) {
  const rows = await bling<Balance[]>(token, `/estoques/saldos/${depositId}?idsProdutos%5B%5D=${productId}`);
  const row = rows.find(item => item.produto.id === productId);
  if (!row) throw new Error("Produto sem saldo retornado pelo depósito selecionado.");
  const physical = inventoryNumber(row.saldoFisicoTotal);
  const available = inventoryNumber(row.saldoVirtualTotal);
  if (physical < available) throw new Error("Saldo físico menor que o disponível. Confira as reservas no Bling.");
  return { physical, available, reserved: physical - available };
}

export async function linkStock(env: Env, variantId: number, blingId: number, depositId: number) {
  await stockSchema(env);
  const lease = await acquire(env);
  try {
    const catalog = await stockCatalog(env);
    if (!catalog.variants.some(row => row.id === variantId) || !catalog.products.some(row => row.id === blingId && row.situacao === "A" && row.formato === "S") ||
      !catalog.deposits.some(row => row.id === depositId && row.situacao === 1)) throw new Error("Selecione uma variante, produto simples e depósito ativos.");
    const exists = await env.DB.prepare("SELECT variant_id FROM bling_stock_links WHERE variant_id=? OR bling_id=?").bind(variantId, blingId).first();
    if (exists) throw new Error("Um destes produtos já está vinculado. O vínculo existente foi preservado.");
    await env.DB.prepare("INSERT INTO bling_stock_links(variant_id,bling_id,deposit_id) VALUES(?,?,?)")
      .bind(variantId, blingId, depositId).run();
  } finally { await release(env, lease); }
}

export async function exportStockProduct(env: Env, variantId: number, depositId: number) {
  await stockSchema(env);
  const lease = await acquire(env);
  try {
    const catalog = await stockCatalog(env);
    const variant = catalog.variants.find(row => row.id === variantId);
    if (!variant || !catalog.deposits.some(row => row.id === depositId && row.situacao === 1)) throw new Error("Selecione produto e depósito ativos.");
    if (await env.DB.prepare("SELECT 1 FROM bling_stock_links WHERE variant_id=?").bind(variantId).first()) throw new Error("Produto já vinculado.");
    const detail = await env.DB.prepare(`SELECT p.name,p.description,COALESCE(v.price_cents,p.price_cents) AS price_cents
      FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=?`).bind(variantId)
      .first<{ name: string; description: string | null; price_cents: number }>();
    if (!detail || detail.name.length > 120) throw new Error("O nome precisa ter até 120 caracteres para o Bling.");
    const previous = await env.DB.prepare("SELECT sku,bling_id FROM bling_stock_exports WHERE variant_id=?").bind(variantId)
      .first<{ sku: string; bling_id: number | null }>();
    const sku = previous?.sku || String(variant.sku);
    const matches = catalog.products.filter(row => row.codigo === sku);
    if (matches.length > 1) throw new Error("Código duplicado no Bling. Vincule o produto manualmente.");
    let blingId = previous?.bling_id ?? matches[0]?.id;
    if (previous && !blingId) throw new Error("Cadastro anterior sem confirmação. Confira o catálogo do Bling antes de tentar novamente.");
    if (!blingId && catalog.products.some(row => row.nome.trim().toLocaleLowerCase() === detail.name.trim().toLocaleLowerCase())) {
      throw new Error("Já existe um produto com esse nome no Bling. Use Vincular existente para evitar duplicação.");
    }
    if (matches[0] && (matches[0].situacao !== "A" || matches[0].formato !== "S")) throw new Error("O código corresponde a um produto inativo ou composto. Confira o Bling.");
    if (!blingId) {
      const token = await blingAccessToken(env);
      await env.DB.prepare("INSERT INTO bling_stock_exports(variant_id,sku) VALUES(?,?)").bind(variantId, sku).run();
      await new Promise(resolve => setTimeout(resolve, 400));
      let created: { id: number };
      try {
        created = await bling<{ id: number }>(token, "/produtos", { nome: detail.name, codigo: sku,
          preco: detail.price_cents / 100, tipo: "P", situacao: "A", formato: "S", unidade: "UN",
          descricaoCurta: detail.description || "" });
      } catch(error) {
        // An explicit rejection is safe to retry after correction; timeouts/5xx are not.
        if (error instanceof BlingRequestError && error.rejected) {
          await env.DB.prepare("DELETE FROM bling_stock_exports WHERE variant_id=? AND bling_id IS NULL").bind(variantId).run();
        }
        throw error;
      }
      if (!Number.isSafeInteger(created.id) || created.id <= 0) throw new Error("Cadastro sem identificador confirmado. Confira o Bling.");
      blingId = created.id;
      await env.DB.prepare("UPDATE bling_stock_exports SET bling_id=? WHERE variant_id=?").bind(blingId, variantId).run();
    }
    await env.DB.prepare("INSERT INTO bling_stock_links(variant_id,bling_id,deposit_id) VALUES(?,?,?)")
      .bind(variantId, blingId, depositId).run();
  } finally { await release(env, lease); }
}

async function saveBaseline(env: Env, link: Link, target: number, direction: string, previous: number) {
  await env.DB.batch([
    env.DB.prepare("UPDATE bling_stock_links SET baseline=?,pending_target=NULL,status='synced',error=NULL,updated_at=CURRENT_TIMESTAMP WHERE variant_id=?")
      .bind(target, link.variant_id),
    env.DB.prepare("INSERT INTO bling_stock_log(variant_id,direction,old_stock,new_stock) VALUES(?,?,?,?)")
      .bind(link.variant_id, direction, previous, target),
  ]);
}

async function applyIncoming(env: Env, link: Link, target: number, direction: string) {
  // The condition and both writes belong to one D1 transaction. A concurrent
  // payment cannot be lost between changing the variant and saving its baseline.
  const result = await env.DB.batch([
    env.DB.prepare(`UPDATE bling_stock_links SET baseline=?,pending_target=NULL,status='synced',error=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE variant_id=? AND EXISTS(SELECT 1 FROM product_variants WHERE id=? AND stock=?)`)
      .bind(target, link.variant_id, link.variant_id, link.stock),
    env.DB.prepare(`INSERT INTO bling_stock_log(variant_id,direction,old_stock,new_stock)
      SELECT ?,?,?,? WHERE changes()=1`).bind(link.variant_id, direction, link.stock, target),
    env.DB.prepare(`UPDATE product_variants SET stock=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND stock=? AND changes()=1`)
      .bind(target, link.variant_id, link.stock),
  ]);
  return result[0].meta.changes === 1;
}

async function syncLink(env: Env, token: string, link: Link) {
  if (link.status === "conflict") {
    await env.DB.prepare("UPDATE bling_stock_links SET updated_at=CURRENT_TIMESTAMP WHERE variant_id=?").bind(link.variant_id).run();
    return;
  }
  const remote = await balance(token, link.bling_id, link.deposit_id);
  if (link.pending_target !== null) {
    // A timed-out POST may have succeeded. Never automatically repeat it.
    if (remote.available === link.pending_target) {
      await saveBaseline(env, link, link.pending_target, "confirmed", link.baseline ?? link.stock);
    } else {
      throw new Error("Envio anterior sem confirmação. Confira os saldos e escolha qual manter antes de reenviar.");
    }
    return;
  }
  const decision = stockDecision(link.stock, remote.available, link.baseline);
  if (decision === "conflict") {
    await env.DB.prepare("UPDATE bling_stock_links SET status='conflict',error=?,updated_at=CURRENT_TIMESTAMP WHERE variant_id=?")
      .bind(`Alterações nos dois sistemas: site ${link.stock}, Bling ${remote.available}. Escolha qual saldo manter.`, link.variant_id).run();
    return;
  }
  if (decision === "pull") {
    // Keep a site edit/payment that occurred during the API call. Retry next run.
    await applyIncoming(env, link, remote.available, "bling_to_site");
    return;
  }
  if (decision === "equal") {
    await env.DB.prepare("UPDATE bling_stock_links SET baseline=?,status='synced',error=NULL,updated_at=CURRENT_TIMESTAMP WHERE variant_id=?")
      .bind(link.stock, link.variant_id).run();
    return;
  }
  if (remote.available === link.stock) {
    await saveBaseline(env, link, link.stock, "initial_equal", remote.available);
    return;
  }
  // Initial balance comes from the site. Later movements are deltas, preserving
  // a Bling edit that arrives between our GET and POST. An uncertain POST stays
  // pending and is never automatically repeated, avoiding duplicate deductions.
  await env.DB.prepare("UPDATE bling_stock_links SET pending_target=?,status='sending',error=NULL WHERE variant_id=?")
    .bind(link.stock, link.variant_id).run();
  await new Promise(resolve => setTimeout(resolve, 400));
  try {
    await bling(token, "/estoques", { produto: { id: link.bling_id }, deposito: { id: link.deposit_id },
      operacao: decision === "initialize" ? "B" : link.stock > remote.available ? "E" : "S",
      quantidade: decision === "initialize" ? link.stock + remote.reserved : Math.abs(link.stock - remote.available),
      observacoes: `Elegance site - vínculo ${link.variant_id}` });
  } catch(error) {
    if (error instanceof BlingRequestError && error.rejected) {
      await env.DB.prepare("UPDATE bling_stock_links SET pending_target=NULL WHERE variant_id=?").bind(link.variant_id).run();
    }
    throw error;
  }
  // Do not trust the POST alone: read the resulting stock next cycle.
}

export async function runStockSync(env: Env) {
  await stockSchema(env);
  const control = await env.DB.prepare("SELECT enabled FROM bling_stock_control WHERE id=1").first<{ enabled: number }>();
  if (!control?.enabled) return { skipped: true };
  const lease = await acquire(env);
  try {
    const token = await blingAccessToken(env);
    // Cap each cycle so it finishes before its lease expires; oldest first avoids starvation.
    const rows = await env.DB.prepare(`SELECT l.*,v.stock,p.name FROM bling_stock_links l
      JOIN product_variants v ON v.id=l.variant_id JOIN products p ON p.id=v.product_id
      ORDER BY l.updated_at,l.variant_id LIMIT 20`).all<Link>();
    const deadline = Date.now() + 90000;
    let processed = 0;
    for (const link of rows.results) {
      if (Date.now() > deadline) break;
      try { await syncLink(env, token, link); }
      catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao sincronizar estoque.";
        await env.DB.prepare("UPDATE bling_stock_links SET status='error',error=?,updated_at=CURRENT_TIMESTAMP WHERE variant_id=?")
          .bind(message, link.variant_id).run();
      }
      processed++;
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    await env.DB.prepare("UPDATE bling_stock_control SET last_run=CURRENT_TIMESTAMP,last_error=NULL WHERE id=1").run();
    return { processed };
  } catch (error) {
    await env.DB.prepare("UPDATE bling_stock_control SET last_run=CURRENT_TIMESTAMP,last_error=? WHERE id=1")
      .bind(error instanceof Error ? error.message : "Falha na integração.").run();
    throw error;
  } finally { await release(env, lease); }
}

export async function resolveStock(env: Env, variantId: number, source: "site" | "bling") {
  await stockSchema(env);
  const lease = await acquire(env);
  try {
    const link = await env.DB.prepare(`SELECT l.*,v.stock FROM bling_stock_links l JOIN product_variants v ON v.id=l.variant_id WHERE variant_id=?`)
      .bind(variantId).first<Link>();
    if (!link) throw new Error("Vínculo não encontrado.");
    const token = await blingAccessToken(env);
    const remote = await balance(token, link.bling_id, link.deposit_id);
    // Explicit operator decision only; an unconfirmed outgoing write isn't retried automatically.
    if (source === "bling") {
      if (!await applyIncoming(env, link, remote.available, "resolved_bling")) throw new Error("O site mudou durante a conferência. Atualize e tente novamente.");
    } else {
      await env.DB.prepare("UPDATE bling_stock_links SET baseline=?,pending_target=NULL,status='synced',error=NULL WHERE variant_id=?")
        .bind(remote.available, variantId).run();
    }
  } finally { await release(env, lease); }
}

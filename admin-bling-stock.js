(() => {
  let stock = null, catalog = null;
  const request = (action, body) => api('admin/bling-stock/' + action, body === undefined ? {} : {method:'POST',body:JSON.stringify(body)});
  const label = {initializing:'Aguardando saldo inicial do site',sending:'Enviado; conferindo no Bling',synced:'Conferido',conflict:'Conflito — conferir',error:'Atenção necessária'};
  async function show(loadCatalog = false) {
    const root = document.querySelector('#bling-stock-panel');
    if (!root) return;
    root.innerHTML = '<p role="status">Consultando integração…</p>';
    try {
      stock = await request('status');
      if (loadCatalog || !catalog) catalog = await request('catalog');
      const c = stock.control, links = stock.links;
      const free = catalog.variants.filter(v => !links.some(l => l.variant_id === v.id));
      const remote = catalog.products.filter(p => p.situacao === 'A' && p.formato === 'S' && !links.some(l => l.bling_id === p.id));
      root.innerHTML = `<h3>Estoque: site ↔ Bling</h3>
        <p>${c.enabled?'Sincronização habilitada para os produtos vinculados.':'Sincronização pausada.'} O saldo inicial vem do site. Depois, alterações em qualquer lado são conferidas a cada minuto; a confirmação pode levar mais um ciclo.</p>
        <p><strong>${links.length} produto(s) vinculado(s)</strong> · ${free.length} sem vínculo. Preços, descrições e notas fiscais não são sincronizados por este controle.</p>
        <p>Última execução: ${esc(c.last_run?formatDate(c.last_run):'Ainda não executou')}<br>Agendador: ${esc(c.last_tick?formatDate(c.last_tick):'Aguardando primeira execução')}</p>
        ${c.last_error?`<p role="alert">${esc(c.last_error)}</p>`:''}
        <div class="action-row"><button class="btn secondary" data-stock-toggle>${c.enabled?'Pausar':'Habilitar'} sincronização</button>
        <button class="btn secondary" data-stock-run ${c.enabled?'':'disabled'}>Sincronizar agora</button><button class="btn secondary" data-stock-refresh>Atualizar</button></div>
        ${table(['Produto do site','Site','Último saldo conferido','Bling / depósito','Situação'],links.map(l=>`<tr><td>${esc(l.name)}</td><td>${l.stock}</td><td>${l.baseline??'—'}</td><td>${esc(l.bling_id)} / ${esc(l.deposit_id)}</td><td>${esc(label[l.status]||l.status)}${l.error?`<p>${esc(l.error)}</p>`:''}${['conflict','error'].includes(l.status)?`<button class="btn secondary" data-stock-resolve="${l.variant_id}" data-source="site">Manter site</button> <button class="btn secondary" data-stock-resolve="${l.variant_id}" data-source="bling">Manter Bling</button>`:''}</td></tr>`))}
        <h3>Vincular um produto</h3><p>Confira se é exatamente a mesma peça. Ao habilitar, a quantidade atual do site será usada como saldo disponível inicial no depósito escolhido.</p>
        <form id="bling-stock-link" class="form-grid">
          <div class="field full"><label for="stock-variant">Produto do site</label><select id="stock-variant" required><option value="">Selecione…</option>${free.map(v=>`<option value="${v.id}">${esc(v.name)} — ${esc(v.sku)} — ${v.stock} un.</option>`).join('')}</select></div>
          <div class="field full"><label for="stock-remote">Produto existente no Bling</label><select id="stock-remote"><option value="">Selecione ou use Cadastrar no Bling…</option>${remote.map(p=>`<option value="${p.id}">${esc(p.nome)} — ${esc(p.codigo)}</option>`).join('')}</select></div>
          <div class="field full"><label for="stock-deposit">Depósito</label><select id="stock-deposit" required>${catalog.deposits.filter(d=>d.situacao===1).map(d=>`<option value="${d.id}">${esc(d.descricao)}</option>`).join('')}</select></div>
          <div class="action-row field full"><button class="btn primary" type="submit">Vincular existente</button><button class="btn secondary" type="button" data-stock-export>Cadastrar no Bling e vincular</button></div>
        </form><p>“Cadastrar no Bling” copia nome, código, preço e descrição uma única vez. Não preenche informações fiscais ausentes nem emite notas.</p>`;
    } catch(error) {
      root.innerHTML = `<p role="alert">${esc(error.message)}</p><button class="btn secondary" data-stock-open>Tentar novamente</button> <button class="btn secondary" data-stock-reconnect>Reconectar Bling</button>`;
    }
  }
  async function perform(button, action, body, reloadCatalog = false) {
    button.disabled = true;
    try { await request(action,body); await show(reloadCatalog); }
    catch(error) { toast(error.message,true); }
    finally { button.disabled = false; }
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-stock-open') || button.hasAttribute('data-stock-refresh')) return show(true);
    if (button.hasAttribute('data-stock-reconnect')) return location.assign('/api/admin/integrations/bling/connect');
    if (button.hasAttribute('data-stock-toggle')) {
      const enabled = !stock.control.enabled;
      if (enabled && !confirm('Habilitar estoque nos dois sentidos? Produtos ainda não inicializados usarão a quantidade do site como saldo disponível inicial no Bling.')) return;
      return perform(button,'enabled',{enabled});
    }
    if (button.hasAttribute('data-stock-run')) return perform(button,'run',{});
    if (button.hasAttribute('data-stock-resolve')) {
      if (!confirm(`Conferiu os dois saldos? Manter o saldo do ${button.dataset.source==='site'?'site':'Bling'} para este produto?`)) return;
      return perform(button,'resolve',{variant_id:Number(button.dataset.stockResolve),source:button.dataset.source});
    }
    if (button.hasAttribute('data-stock-export')) {
      const form = document.querySelector('#bling-stock-link');
      if (!form.reportValidity()) return;
      if (!confirm('Cadastrar este produto no Bling e vincular ao site? Confira antes se ele já existe com outro nome ou código para evitar duplicação.')) return;
      return perform(button,'export',{variant_id:Number(document.querySelector('#stock-variant').value),deposit_id:Number(document.querySelector('#stock-deposit').value)},true);
    }
  });
  document.addEventListener('submit', async event => {
    if (event.target.id !== 'bling-stock-link') return;
    event.preventDefault();
    const blingId = Number(document.querySelector('#stock-remote').value);
    if (!blingId) return toast('Selecione o produto correspondente no Bling.',true);
    if (!confirm('Confirmar que os dois cadastros representam a mesma peça e vincular seus estoques?')) return;
    await perform(event.target.querySelector('[type="submit"]'),'link',{variant_id:Number(document.querySelector('#stock-variant').value),bling_id:blingId,deposit_id:Number(document.querySelector('#stock-deposit').value)},true);
  });
})();

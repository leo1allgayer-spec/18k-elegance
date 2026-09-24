# Estoque site ↔ Bling

## Operação

Painel → Configurações → Gerenciar sincronização.

- Vincular por IDs, após conferir a peça e o depósito. Não há vínculo automático por nome parecido.
- O site define o saldo **disponível inicial**. Reservas do Bling são preservadas ao calcular o saldo físico inicial.
- Depois da inicialização, diferenças em apenas um sistema são propagadas ao outro.
- Se os dois sistemas mudam desde o último saldo conferido, o produto fica em conflito, inclusive quando ambos caem para a mesma quantidade. O operador escolhe qual saldo manter.
- O agendador roda a cada minuto. Um envio precisa de um segundo ciclo para confirmação. Falhas de API podem ampliar esse intervalo.
- Somente estoques de produtos vinculados são sincronizados. Não há exportação de pedidos, emissão de notas, nem sincronização contínua de preços/descrições.
- Cadastrar no Bling copia uma vez nome, SKU da variante, preço e descrição. Não inventa dados fiscais e não emite NF-e.
- Um produto novo no site precisa ser vinculado ou cadastrado no Bling por esta tela.
- Produtos inativos não aparecem como candidatos a novos vínculos. Um vínculo existente continua conferindo seu estoque físico até ser pausado globalmente.

## Proteções e limitações

Uma trava no D1 serializa as execuções e alterações de vínculos. A recepção de saldo usa comparação e atualização atômica em lote, para não sobrescrever uma venda do site ocorrida durante a consulta externa.

Depois do balanço inicial, envios são entradas/saídas pela diferença de saldo. Isso preserva uma movimentação no Bling que aconteça entre a consulta e a escrita. O Bling não oferece uma transação atômica compartilhada com o site; conflitos exigem conferência e a sincronização não substitui uma reserva distribuída de estoque. Vendas simultâneas nos dois canais ainda exigem controle operacional.

Um POST sem resultado confirmado nunca é repetido automaticamente. O sistema consulta o saldo e confirma se coincidir com o esperado; caso contrário, pede conferência. Respostas explícitas de rejeição HTTP 400/401/403/404/422/429 podem ser tentadas novamente após correção. A mesma cautela vale para criação de produtos.

Pedidos pagos seguem a baixa de estoque já existente no site. A integração só propaga o saldo resultante, sem emitir uma segunda baixa a partir do pedido. Importar futuramente os mesmos pedidos no Bling exigirá tratamento próprio para não descontar novamente.

## Componentes

- `functions/_lib/bling-stock.ts`: catálogo, vínculos, estados, reconciliação e registro de movimentos.
- `functions/api/admin/bling-stock/[[action]].ts`: endpoints administrativos autenticados.
- `functions/api/integrations/bling-stock-tick.ts`: chamada interna autenticada por HMAC com validade de 60 segundos.
- `workers/stock-scheduler`: Worker sem URL pública, agendado a cada minuto. Como Pages não pode ser destino de Service Binding, usa a URL fixa do mesmo projeto com assinatura. O segredo não aparece no cliente ou nos logs.
- Tabelas `bling_stock_control`, `bling_stock_links`, `bling_stock_exports`, `bling_stock_log` são criadas idempotentemente. Não remover o histórico de envios incertos para forçar tentativas.

## Verificação e publicação

```powershell
npm run typecheck
npm run test:stock
node --check admin-live.js
node --check admin-bling-stock.js
npx wrangler deploy --config workers/stock-scheduler/wrangler.jsonc --dry-run
npx wrangler deploy --config workers/stock-scheduler/wrangler.jsonc
```

Publicar o Pages usando uma pasta de staging com os arquivos públicos e `functions/`. Não enviar `tests/`, `workers/`, `docs/` ou arquivos locais de credenciais como assets.

O status administrativo mostra `last_tick` (agendador alcançou a API) e `last_run` (reconciliação executada). A programação pode levar alguns minutos para propagar após o primeiro deploy.

## Situação em 24/09/2026

- OAuth reconectado e acesso de consulta validado.
- Borboleta: variante do site 5 → produto Bling 16698750920, depósito Geral 14889126835. Correspondência confirmada pelo usuário. Saldo inicial de 1 enviado e conferido.
- Há 13 outros produtos ativos ainda sem vínculo e um produto inativo não exportado.
- POST de criação de produto retornou HTTP 403: falta autorização de cadastro de produtos. Nenhum cadastro novo foi criado. A tentativa rejeitada da sacola foi liberada para nova tentativa após corrigir o acesso.
- Browser do Bling voltou à tela de login. Para concluir o catálogo, entrar, liberar somente a permissão necessária no aplicativo e reconectar. Ampliação de acesso pela interface requer confirmação do usuário no momento da ação.

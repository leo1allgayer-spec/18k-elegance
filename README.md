# Elegance 18K

E-commerce da Elegance 18K hospedado no Cloudflare Pages. O front-end aprovado permanece em HTML, CSS e JavaScript; a API é executada por Pages Functions e utiliza Cloudflare D1.

## Estrutura

- `index.html` e demais arquivos `.html`: loja e páginas institucionais.
- `styles.css`, `store.css` e `script.js`: interface e interações.
- `assets/`: identidade visual e imagens.
- `functions/api/[[path]].ts`: rotas da API.
- `functions/_lib/`: autenticação, respostas HTTP e tipos compartilhados.
- `migrations/`: esquema e evoluções do banco D1.

## API inicial

- `GET /api/health`
- `GET /api/categories`
- `GET /api/products`
- `GET /api/products/:slug`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

## Desenvolvimento

```bash
npm install
npm run typecheck
```

## Configuração no Cloudflare

1. Criar um banco D1 chamado `elegance-18k`.
2. Vincular o banco ao projeto Pages usando o nome de binding `DB`.
3. Executar `migrations/0001_initial.sql` no banco de desenvolvimento e, após validação, no banco de produção.
4. Manter o diretório de saída do Pages como `/` e a branch de produção como `main`.

As integrações futuras deverão ser cadastradas como secrets, nunca salvas no GitHub:

- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_WEBHOOK_SECRET`
- `CORREIOS_API_TOKEN`

## Segurança já preparada

- Senhas derivadas com PBKDF2 e salt individual.
- Sessões com token aleatório, cookie `HttpOnly`, `Secure` e `SameSite=Lax`.
- Token de sessão armazenado no banco somente como hash.
- Consultas D1 parametrizadas.
- Credenciais privadas reservadas ao back-end.

## Próximas etapas

1. Painel administrativo e permissões de administrador.
2. Cadastro real de produtos, variações, fotos e estoque.
3. Carrinho e criação segura de pedidos.
4. Mercado Pago em ambiente de teste e confirmação por Webhook.
5. Cálculo de frete dos Correios, motoboy e retirada em loja.
6. Fidelidade, aniversário, cartão presente, cupons e avaliações.

As imagens temporárias dos produtos devem ser substituídas pelas fotografias reais antes do lançamento.

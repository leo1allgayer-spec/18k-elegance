# Segurança — rodada de 27/09/2026

## Implementado

- Sessão administrativa limitada a 8 horas, inclusive sessões antigas; cliente permanece com 30 dias. Cookies HttpOnly/Secure/SameSite.
- Hash PBKDF2-SHA256 versionado, elevado de 10 mil para 100 mil iterações; rehash no login válido, sem trocar a senha. Senhas novas/redefinidas: 12 a 128 caracteres. Hashes legados continuam verificáveis.
- Mutações exigem Origin exatamente igual ao site. Apenas webhook de pagamento e scheduler (com assinaturas próprias) são isentos.
- Limites de requisições em uploads, avaliações, recuperação de sacola, demais escritas e consultas públicas sensíveis; limite real de bytes antes de interpretar o corpo.
- Imagens: assinatura e estrutura JPG/PNG/WebP, tamanho máximo de 5 MB e dimensões máximas. Não aceita HTML/SVG disfarçado ou WebP animado.
- Upload de personalização vinculado a cookie aleatório HttpOnly (somente hash no banco), válido por 30 dias; aquisição atômica impede reutilização simultânea. Uploads antigos não vinculados exigem novo envio.
- Consulta de pedido: somente cliente dono, administrador ou cookie de acesso emitido no checkout, válido por 30 dias. Número de pedido sozinho não autoriza. Pedidos antigos podem ser vistos na conta/administração.
- CSP com nonce, bloqueio de scripts em atributos, frame-ancestors/X-Frame-Options, HSTS, nosniff, no-referrer e remoção de CORS aberto. Ajustada impressão administrativa para não depender de script inline sem nonce.
- Tipos de entrega e quantidades fracionárias rejeitados pelo backend; preços permanecem calculados pelo servidor.
- Redirecionamentos HTTP desativados nas integrações para evitar encaminhamento de credenciais. Diagnóstico de pagamento restrito; health público reduzido ao necessário para o frete.
- Dependências atualizadas e fixadas; npm audit sem vulnerabilidades conhecidas no momento do teste.
- Publicação por allowlist em `.deploy/site`, sem publicar o repositório. Middleware bloqueia caminhos internos e arquivos de configuração, incluindo URLs codificadas.

## Verificações

`npm run typecheck`, `npm run test:security` (19 testes), `npm run test:stock` (9 testes), `npm audit`, sintaxe dos scripts e build.
Wrangler local: cadastro 201, login 200 e consulta autenticada 200; arquivos privados 404, conta anônima 401; interface de conta sem violações CSP observadas. Pagamentos dos testes usam provedores simulados; nenhuma cobrança real.

## Publicação

1. Registrar bookmark D1 antes da migração.
2. Aplicar `0019_security_hardening.sql` uma única vez (adições de colunas não são repetíveis).
3. `npm run build` e `npx wrangler pages deploy .deploy/site --project-name site-18-kelegance --branch main`.
4. Verificar login, cabeçalhos, bloqueios e catálogo no domínio principal.

Bookmark pré-migração: `00000390-00000166-000050f3-4c5fd1461b7f96dcd78dd6c70d49da86`.
Não restaurar o banco apenas para reverter código; isso pode perder pedidos posteriores. A migração é aditiva e permite reverter o deployment mantendo os dados.

Publicação confirmada: `https://cd78a90a.site-18-kelegance.pages.dev`.
No domínio principal: home 200 com CSP/HSTS/DENY, `.env`/`.git/config`/`wrangler.toml` 404, conta anônima 401, administração anônima 403, mutações sem Origin ou com Origin externo 403. Login administrativo real e dashboard retornaram 200. Home inspecionada no navegador sem erros/warnings capturados.

## Limites / pendências conscientes

- Usuário preferiu adiar 2FA administrativo. Não está ativado.
- PBKDF2 100 mil é melhoria incremental compatível com workerd, não o parâmetro OWASP de 600 mil. Uma evolução para serviço de identidade/Argon2 ou infraestrutura apropriada continua recomendada; não afirmar adequação integral ao OWASP.
- Validação de estrutura não é antivírus nem decodificação/regravação completa; não declarar uploads imunes a todos os formatos maliciosos.
- Rate limit por IP não substitui defesa contra bots distribuídos/WAF. Sem alteração de plano pago, regras externas ou promessa de proteção total.
- Não foi realizado pentest independente nem compra real ponta a ponta. Não há certificação de todos os tópicos do vídeo; “Chumbinho” não tem definição técnica suficiente.
- Manter atualizações, monitoramento e teste de restauração. Não ativados trabalhos recorrentes sem pedido do usuário.

Referências: [Cloudflare Workers](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/), [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

# Configuração da Evolution API

Os fluxos de recuperação enviam mensagens de texto pela instância da Evolution API. A senha nunca é enviada: o cliente recebe um link temporário.

## Variáveis do Cloudflare Pages

Cadastre em produção e em preview quando necessário:

- **EVOLUTION_API_URL**: URL HTTPS da Evolution, sem o caminho do endpoint. Exemplo: https://evolution.seudominio.com
- **EVOLUTION_INSTANCE**: nome exato da instância conectada.
- **EVOLUTION_API_KEY**: chave usada no cabeçalho apikey. Mantenha como segredo.

O backend envia mensagens com:

- método: POST
- endpoint: /message/sendText/{instância}
- cabeçalho: apikey
- corpo: number, text, delay e linkPreview

Antes da publicação, aplique as migrações D1 remotas, cadastre as três variáveis e faça o deploy do Pages.

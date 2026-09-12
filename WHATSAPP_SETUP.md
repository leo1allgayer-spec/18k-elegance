# Configuração do WhatsApp

Os fluxos de recuperação usam a API oficial WhatsApp Business Cloud da Meta. Nenhuma senha é enviada por mensagem: o cliente recebe um link temporário.

## Modelos aprovados

Crie dois modelos em português do Brasil no WhatsApp Manager:

- **elegance_recuperar_senha**: corpo com duas variáveis, por exemplo: “Olá, {{1}}. Para criar uma nova senha da Elegance 18K, acesse {{2}}. O link expira em 30 minutos.”
- **elegance_recuperar_carrinho**: corpo com uma variável, por exemplo: “Seu carrinho Elegance 18K está guardado. Volte para suas joias por este link: {{1}}. O link expira em 7 dias.”

## Variáveis do Cloudflare Pages

Cadastre nos segredos/variáveis do projeto, em produção e preview quando necessário:

- **WHATSAPP_ACCESS_TOKEN**: token permanente da Meta; mantenha como segredo.
- **WHATSAPP_PHONE_NUMBER_ID**: ID do número remetente.
- **WHATSAPP_PASSWORD_TEMPLATE**: elegance_recuperar_senha.
- **WHATSAPP_CART_TEMPLATE**: elegance_recuperar_carrinho.
- **WHATSAPP_TEMPLATE_LANGUAGE**: pt_BR (opcional; já é o padrão).

Antes da publicação, aplique as migrações D1 remotas e depois faça o deploy do Pages.

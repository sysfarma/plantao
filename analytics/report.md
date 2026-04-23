# Relatório de Status - Integração Mercado Pago (Render.com)

**Data da Análise:** `22 de Abril de 2026`
**Domínio de Destino:** `https://farmaciasdeplantao.app.br`

Este relatório descreve o status atual da implementação da API do Mercado Pago (Cobranças via Pix e Cartão de Crédito/Checkout Pro) no sistema, voltado para a transição à hospedagem no Render.com.

---

## 1. Visão Geral do Sistema Atual

A aplicação é dividida em frontend (React/Vite) e backend (Server.ts integrado com Express). A comunicação com o Mercado Pago utiliza as credenciais configuradas em variáveis de ambiente e processa os webhooks (via assinatura assíncrona v1 do MP) para mudar o status na base Firestore. 

*   O Checkout implementa pagamentos independentes via Pix e Pre-Approvals via Cartão.
*   Uma interface do assinante no Dashboard fornece a habilidade de atualizar o cartão e (adicionado nesta análise) cancelar assinaturas ativas sem chamar o suporte.

## 2. O que falta configurar para funcionar no Render.com em Produção

Embora o código backend e frontend tenha alta cobertura funcional, certas configurações dependem de ações manuais ou variáveis exclusivas para a infraestrutura no **Render.com**.

### A. Variáveis de Ambiente Corretas (Backend/Render)

O Dashboard do Render exigirá o cadastro das seguintes chaves (exatamente com estes nomes). Verifiquei o código, e o servidor requer:

1.  `MERCADOPAGO_ACCESS_TOKEN`
    *   **Importante:** Deve ser o *Access Token de Produção* (`APP_USR-...`), obtido em "*Credenciais de Produção*" no painel de desenvolvedores do Mercado Pago. O token de teste (`TEST-...`) fará os pagamentos Pix expirarem na hora.
2.  `MERCADOPAGO_WEBHOOK_SECRET`
    *   O `server.ts` exige a assinatura (Hmac) para validar pagamentos usando o V1 signature validation.
    *   **Obtenção:** No painel do MP > "*Notificações Webhooks*" > Configure as permissões > Em seguida será exibida a Hash de Segurança, que deve ir para essa env.
3.  `APP_URL`
    *   O backend usa isso para preencher o `"notification_url"`. **Precisa obrigatoriamente estar definido como:** `https://farmaciasdeplantao.app.br`
    *   Sem isso, o webhook cairá em um endereço inacessível e os perfis Pix não serão ativados.

### B. Configuração do Webhook no Mercado Pago

O Mercado Pago precisa saber que deve enviar eventos para a hospedagem do Render. Você deverá:

1.  No painel do Mercado Pago (Developers > Webhooks), registrar a URL:
    *   `https://farmaciasdeplantao.app.br/webhooks`
2.  Inscrever-se nos seguintes eventos obrigatórios:
    *   **Pagamentos** (Aprovações/Cancelamentos do Pix)
    *   **Planos e Assinaturas (Preapproval)** (Aprovações/Rejeições de renovação via Cartão)

### C. Domínio do Cliente (Front-end CORS e Firebase)

Quando o servidor for transferido de `*.run.app` para `farmaciasdeplantao.app.br`, haverá problemas com o botão do Google e acessibilidade se não ajustar o DNS (Cloudflare/Render) e o painel Auth. O backend *Mercado Pago* não liga para o CORS na ida, apenas atente que a volta do Webhook seja na URL HTTPS correta para ser processada pelo Node.js e que a UI possa consumir pelo novo domínio.

---

## 3. Segurança & Resiliência Implementadas (Boas Práticas)

*   **Idempotência:** O código backend de criação do Pix utiliza Headers de idempotência via `uuidv4()`. Se houver duplo clique no app, não gerará dois pagamentos.
*   **Hash HMAC v1:** O webhook já confere os cabeçalhos `x-signature` e `x-request-id` enviados pelo MercadoPago, que barra invasores chamando `/webhooks` manualmente com payloads forjados, assumindo que `MERCADOPAGO_WEBHOOK_SECRET` não vaze.
*   **Filtros Otimizados Firestore:** Quando pagamentos/assinaturas ativam/cancelam, os campos da farmácia associados `is_active`, `sub_status` sincronizam automaticamente. O reciclo de assinaturas desativa a antiga se houver troca de plano (up/downgrades).

## 4. Onde Encontrar o Log de Debbug (Render)

Em caso de pagamentos reportarem "Aguardando Pagamento" indefinidamente após o usuário ter pago:
1.  Verifique a aba **Logs** do Web Service no Render.
2.  Filtre a saída pelas frases que inserimos no backend:
    *   `Webhook received ...` (Início)
    *   `Payment <id> verified and approved. Pharmacy <id> activated.` (Sucesso no Pix)
    *   `Error validating webhook signature` (Alerta para erro na Secret Key)
    *   `Invalid Signature` (Se o Hmac falhar)
    *   `Mercado Pago API Subscription Error:` ou `Mercado Pago API PIX Error:` (Falhas de Criação).

Ao aplicar todos os pontos da *Seção 2*, o fluxo financeiro na *Render.com* com o respectivo domínio estará pronto pra receber valores dos clientes da aplicação final.
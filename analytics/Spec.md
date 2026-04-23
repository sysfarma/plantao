# Especificação Técnica: Implementações Pendentes (Integração MP)

Esta especificação foi gerada com base no diagnóstico contido no arquivo `analytics/report.md`. Ela detalha estritamente os comportamentos (behaviors), componentes (components) e alterações visuais (pages) correspondentes às pendências exigidas para robustecer a infraestrutura existente do Mercado Pago.

---

## 1. Comportamentos (Behaviors - Lógica e Backend)

### 1.1 Tratar Reembolsos e Chargebacks no Webhook
- **Local:** `server.ts` (Rota do Webhook de Payment).
- **Contexto:** Garantir consistência nas contas quando uma devolução for processada pelas operadoras ou pelo próprio painel do MP.
- **Implementação:** Interceptar transições de status como `"refunded"`, `"charged_back"` e `"rejected"`. Adicionar lógica de negócio para setar `is_active: 0` na entidade de Farmácia e expurgar a respectiva assinatura.

### 1.2 Rota de Cancelamento Voluntário de Assinatura
- **Local:** `server.ts` (Nova Rota Autenticada Exemplo: `DELETE /api/subscriptions/cancel`).
- **Contexto:** Permitir cancelamento a pedido do lojista (Right to Cancel) para frear cobrança indevida.
- **Implementação:** Validar dono da Farmácia, localizar o `.mp_preapproval_id` real, dar update no `preApprovalClient` informando `{ status: "cancelled" }` e derrubar as permissões ativas `is_active = 0` no Firebase.

### 1.3 Mapeamento Detalhado e Completo de PreApproval Status
- **Local:** `server.ts` (Webhook de PreApproval em `app.post('/api/webhooks/payment')`).
- **Contexto:** Transparência nos relatórios de logs da Plataforma.
- **Implementação:** Acrescentar traduções ou interpretações específicas dos fluxos de falha como `"suspended"` e `"paused"`. Evitar que essas ocorrências sejam engolidas na variável base e salvas incorretamente como `"pending"`.

### 1.4 Webhook Async Processing (Correção Antibloqueio MP)
- **Local:** `server.ts` (Todo o gateway `/api/webhooks/*`).
- **Contexto:** Impede gargalos no banco ou quedas de serviço de e-mail de provocarem penalidades de Tries (Retries massivos) pela API do Mercado Pago por superarem Timeout.
- **Implementação:** Refatorar o middleware para que realize validação criptográfica (Hash `x-signature`) e, quando aprovado, imediatamente emita o `res.status(200).json(...)`. Só depois de "estancar" a porta HTTP, o backend dará seguimento as queries pesadas Firestore + EmailService em Promise/Background Task.

### 1.5 Injeção Dinâmica de Webhook URL (`notification_url`)
- **Local:** `server.ts` (Criação de transações: `/api/subscriptions/create`, `/api/payments/pix`, etc).
- **Contexto:** Tornar integrações imunes a inconsistência do IP/Sufixo se a plataforma for migrada ou movida de domínio.
- **Implementação:** Anexar forçadamente a chave `notification_url` nos corpos (body) das chamadas aos Clientes MP utilizando `process.env.APP_URL` de base, garantindo que o Webhook do preapproval vai mirar nativamente naquele Back-end.

---

## 2. Componentes (Components - Frontend UI)

### 2.1 Componente: `CancelSubscriptionModal`
- **Descrição:** Reutilizável de confirmação destrutiva.
- **Comportamento:** Ao ser disparado, alerta o lojista com gravidade que seus Plantões cadastrados serão removidos publicamente; Exigir duplo clique ou inserção de nome da Farmácia para destrancar botão principal; Ao acionar, varre Endpoint de Cancelamento reportando `(Loading) Processando interrupção...` com fallback visual.

---

## 3. Páginas (Pages)

### 3.1 Painel da Farmácia (`Dashboard.tsx`)
- **Seção a Intervir:** Aba ("Visão Geral").
- **Implementação Visual:**
  1. Embutir suporte textual à interpretação de status recém mapeados pelo lado da UI (Renderizar blocos cor Neutra/Aviso para farmácia que esteja de status *Suspensa* por falta de saldo e indicar regularização).
  2. Implementar link âncora vermelho ou sutil "*Desejo cancelar minha assinatura*" integrado ao status da Assinatura Ativa.
  3. Acoplar localmente o Modal `CancelSubscriptionModal` construído.

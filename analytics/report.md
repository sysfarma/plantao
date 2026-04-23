# Relatório Analítico: Backlog e Gaps da Integração Mercado Pago

**Objetivo:** Analisar o estado atual da integração ponta a ponta com a API do Mercado Pago no sistema e elencar exclusivamente os pontos pendentes, incompletos e fluxos ausentes obrigatórios para garantir segurança antifraude e consistência fiscal/comercial no ambiente de produção.

---

### 1. Tratamento de Reembolsos e Chargebacks (Incompleto/Vulnerável)
- **Cenário Atual:** O webhook que escuta pagamentos avulsos/Pix (`/api/webhooks/payment`) consegue ativar o plano quando o status é transicionado para `"approved"`. Entretanto, se ocorrer estorno na operadora ou no cartão de crédito, status como `"refunded"`, `"charged_back"` ou `"rejected"` são apenas atualizados passivamente no painel de transações do Firestore (`payments`).
- **Impacto Transacional:** Quando a devolução do dinheiro ocorre, a base do sistema **não atinge a tabela de farmácias para expurgar ou cancelar a inscrição no código atual**. O usuário recebe o dinheiro de volta, mas a sua farmácia e seu "Selo de Assinatura" (`is_active = 1`) continuam ativos indevidamente para sempre até o próximo ciclo ignorado.
- **Resolução:** Injetar um bloco `else if` que force a desativação da farmácia e de sua inscrição local caso cheguem payloads de ruptura de receita.

### 2. Fluxo de Cancelamento Voluntário pelo Usuário (Ausente Front-end/Back-end)
- **Cenário Atual:** A rota que finaliza preApprovals obsoletos (`cancelExistingSubscriptions`) atua somente nos bastidores quando uma **nova** contratação suplanta a antiga.
- **Impacto Transacional:** Pelas normas comuns de direito do consumidor e SaaS, o lojista deve conseguir interromper seu plano a hora que quiser (Impedimento da Renovação Automática). Atualmente, no `Dashboard.tsx`, não existe um botão "Cancelar Assinatura". O Backend também não provê uma rota acessível `/api/subscriptions/cancel` para ser chamada nativamente. 
- **Resolução:** Criar rota DELETE/PUT para cancelamento manual e integrá-la no Painel do usuário (UI) para evitar atrito ou chamados desgastantes no suporte via WhatsApp.

### 3. Sincronização Sensível de Status em Assinaturas (Requisitos SDK)
- **Cenário Atual:** O webhook do tipo `subscription_preapproval` varre e filtra as condições `"authorized"` para `"active"` ou `"cancelled"` para `"cancelled"`.
- **Impacto Transacional:** Assinaturas MP (`PreApprovals`) emitem outros microestados como `"paused"` (usado quando o lojista pausa do lado do aplicativo nativo do Mercado Pago na seção Minhas Assinaturas) ou `"suspended"` (usado quando o limite em cartão dá erro em sucessivas recuperações no fim do mês). Do jeito que o backend absorve isso hoje, a queda cairá no bloco raiz e ficará tida como `"pending"`. Isto barra a autenticação, porém perde-se a rastreabilidade contextual e detona alertas genéricos de "Pagamento Não Finalizado", confundindo tanto o admin quanto o usuário. 

### 4. Gargalo Crítico de Timeout em Webhooks (Risco Backend)
- **Cenário Atual:** A função do router responsável por receber do Mercado Pago faz a verificação do Hash criptográfico, busca o ID real via SDK, localiza os registros do Firestore, modifica-os e ainda invoca o provedor de disparo SMTP `emailService` **TUDO DE FORMA SÍNCRONA** (`await` encadeado sem retornar).
- **Impacto Transacional:** A documentação do Mercado Pago exige Retorno Imediato HTTP `200 OK`. Se o banco Firestore estiver mais lento no dia ou o servidor de e-mail engasgar e tudo passar de uns escassos segundos, o Mercado Pago fará o *Dropping* e executará a fila de reenvios consecutivos (*Retries*). O endpoint da infraestrutura levará rajadas, engajando duplicação de emails e stress processual.
- **Resolução:** Desacoplar a resposta da rede e a ação. Validou a assinatura? Responda imediatamente o `res.status(200)`. Deixe o resto do processamento em background sob promessa.

### 5. URL de Notificação Ativa Dinamicamente (Ausência de Flexibilidade)
- **Cenário Atual:** Na elaboração de `paymentClient.create(...)` e `preApprovalClient.create(...)` em `/api/subscriptions/create`, o atributo opcional `notification_url` foi excluído do JSON do *body*.
- **Impacto Transacional:** Essa omissão obriga o dependente (SysAdmin do projeto) a se lembrar de inserir a rota do sistema local estritamente pelo painel online e obscuro para webhooks (na área Developer do Mercado Pago). Se for gerada uma Preview, Staging, novo IP para testes – o webhook e a baixa manual de Pix morre, pois o Mercado Pago mandará para o link fixado do dashboard antigo. A adoção da propriedade injetada no momento do checkout previne configurações órfãs. 

---
*Status das implementações recentes verificadas e completas: Buscas "customer fallback" perfeitas (Issue #03), Expiração correta para Pix em 30 min (Issue #04) e Renovação direta de Token de cartão na conta da farmácia (Issue #05) todas implantadas.*

# Issue #07 - Fluxo de Cancelamento Voluntário (Backend e UI)

**Tipo:** Full-stack (Backend, Front-end Component e Integração com Página)

**Componente Fonte:** `/analytics/Spec.md` (Itens 1.2, 2.1 e 3.1)

## Descrição
Conceder ao lojista a autonomia para encerrar a própria assinatura ("Right to Cancel") desimpedindo o atrito de comunicação com suporte para evitar frustrações, processos e cobranças retroativas, um pré-requisito de sistemas modernos.

## Tarefas a Implementar

### Backend (`server.ts`)
- Criar a rota segura/autenticada: (Ex: `DELETE /api/subscriptions/cancel` ou `PUT /api/subscriptions/cancel`).
- Validar se o usuário que fez o request detém a propriedade da conta farmacêutica.
- Localizar a assinatura com modelo PreApproval (`mp_preapproval_id`) válido no Mercado Pago.
- Engatilhar a solicitação de quebra invocando `preApprovalClient.update` informando como corpo da requisição o `{ status: "cancelled" }`.
- Imediatamente setar a respectiva farmácia como inativa (`is_active: 0`), blindando o calendário dela perante novos acessos ao mapa público.

### Frontend (`CancelSubscriptionModal.tsx` / `Dashboard.tsx`)
- **Criar componente `CancelSubscriptionModal`**: Modal com alerta de coloração de "Destruição" (Avisando que sairá do modo premium e seus plantões agendados não vão aparecer até voltar a ativá-lo).
- O Modal deve ter o sistema de confirmação seguro: Pedir inserção de palavra-chave ou Duplo Clique para desbloquear o botão vermelho "Cancelar Assinatura".
- Emitir loading states com mensagem "Processando interrupção...".
- **Painel Visão Geral:** Adicionar o gatilho textual hiperlink vermelho "Desejo cancelar minha assinatura" adjunta à descrição de assinatura pendente/ativa no arquivo de Dashboard para engatilhar a aparição deste modal recém originado.

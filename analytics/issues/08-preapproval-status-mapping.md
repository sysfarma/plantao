# Issue #08 - Mapeamento de Status Específicos do PreApproval

**Tipo:** Backend e Frontend Rendering

**Componente Fonte:** `/analytics/Spec.md` (Itens 1.3 e 3.1)

## Descrição
Assinaturas criadas no Mercado Pago possuem particularidades transicionais (ex: o usuário pausa a cobrança direto do aplicativo no celular ou o cartão de crédito dá "erro de verificação por falta de limite"). Esses status em inglês não chegam limpos dentro da nossa malha lógica atual, caindo pelo buraco generalista e acabando em "Pending", frustrando ações.

## Tarefas a Implementar

### No Recebimento via Webhook (`server.ts`)
- Aumentar a ramificação lógica estrutural na parte central que ouve os eventos `"subscription_preapproval"`.
- Interceptar os relatórios literais de `"suspended"` e `"paused"`.
- Salvar exatamente este microestado contextualizado no update da Inscrição no Firestore, preservando a consistência dos relatórios (para fins de analytics).

### Renderização Front-end (`Dashboard.tsx`)
- Expandir a sessão nativa que relata "Visão Geral", criando um box alternativo que seja reativo também para esses novos estados.
- Caso a API mande a assinatura como "suspended", alertar a Farmácia num box de coloração Neutra ou Avisos (Amarelo) explicando a situação específica da suspensão e sugerindo regularização ou atualização do cartão (`UpdateCardTokenEndpoint` da Issue #05).

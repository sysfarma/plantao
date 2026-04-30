# Especificação Técnica: Implementações Pendentes (Roadmap de Correção)

**Data de Geração:** 30/04/2026 09:00:00 (Horário de Brasília)
**Objetivo:** Transição da arquitetura de "Baixa Escala" para "Produção Escalável"

---

## 1. Comportamentos de Backend (API)

### 1.1 Paginação Real com Firestore Cursors
- **Onde:** `server.ts` -> `/api/public/pharmacies`
- **O que falta:** 
    - Implementar suporte aos parâmetros `lastDocId` ou `offset` nas requisições.
    - Alterar a query do Firestore para usar `.startAfter(doc)` em vez de `.limit(2000)`.
    - Retornar o `lastVisibleId` para que o frontend saiba onde continuar a busca.

### 1.2 Otimização de Estatísticas Financeiras
- **Onde:** `server.ts` -> Função `updateDashboardStats`
- **O que falta:** 
    - Implementar uma coleção `system_stats` que armazena os totais mensais pré-calculados.
    - Criar uma trigger/lógica que incrementa o contador mensal apenas no momento da aprovação do pagamento, em vez de recalcular o ano inteiro a cada acesso.

### 1.3 Bloqueio de Assinaturas Duplicadas
- **Onde:** `server.ts` -> Provedor de Webhook e lógicas de pagamento.
- **O que falta:**
    - Antes de criar um `doc(db, 'subscriptions', ...)`, realizar um check: "Se existe assinatura para `pharmacy_id` com status `active/pending` e `mp_preapproval_id` idêntico, ignorar criação".

---

## 2. Componentes e Telas (Frontend)

### 2.1 Refatoração do Ciclo de Vida do Admin
- **Onde:** `src/pages/admin/Dashboard.tsx`
- **O que falta:** 
    - Implementar o padrão **Tab-Specific Loading**. Os dados de "Assinantes" só devem ser buscados quando a aba `subscribers` for ativada pelo usuário.
    - Utilizar `React.useMemo` ou um estado de cache para as farmácias, evitando que a mudança de página de 1 para 2 dispare o carregamento de estatísticas e configurações de sistema novamente.

### 2.2 Tradutor de Erros de Infraestrutura
- **Onde:** `src/components/FirebaseProvider.tsx` ou novo utilitário.
- **O que falta:** 
    - Criar um componente de "Toast de Sistema" que mapeia erros como `PERMISSION_DENIED` para "Sessão expirada, faça login novamente" e `RESOURCE_EXHAUSTED` para "Servidor ocupado, tente em 1 minuto".

### 2.3 UI Compacta de Busca (Mobile First)
- **Onde:** `src/pages/Home.tsx` e `src/pages/OnCall.tsx`
- **O que falta:** 
    - Implementar um componente de "Drawer" (gaveta) ou "Accordion" para os filtros de busca em telas menores que 768px.
    - O botão de "Usar minha localização" deve ser fixo ou flutuante para não competir com os cards de farmácia no topo da tela.

---

## 3. Tarefas de Consistência de Dados

### 3.1 Sanitização Universal de Respostas
- **Onde:** `server.ts` (Middleware de Resposta)
- **O que falta:** 
    - Garantir que nenhum objeto `pharmacy` saia do servidor sem passar pela função `sanitizePublicPharmacy`, independente do endpoint (on-call, highlights ou search).

---

## Próximos Passos Recomendados
1. Iniciar pela **Paginação no Servidor** (item 1.1) para aliviar a memória instantaneamente.
2. Aplicar o **Lazy Loading de Abas** no Admin (item 2.1) para mitigar os erros de cota excedida.

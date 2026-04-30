# Relatório de Análise Técnica de Erros e Vulnerabilidades

**Data de Geração:** 30/04/2026 08:55:00 (Horário de Brasília)
**Status do Sistema:** Operacional com Gargalos Identificados

---

## 1. Gargalos de Performance e Escalabilidade (Backend)

### 1.1 Consultas de Alta Intensidade no Firestore (Server-Side Filtering)
- **Local:** `server.ts` -> `/api/public/pharmacies` e `/api/public/on-call`
- **Problema:** O backend recupera grandes conjuntos de documentos (limite fixo de 2000 em `pharmacies`) para realizar filtragem por distância (Haversine) e normalização de nomes em memória (JavaScript).
- **Impacto:** Conforme a base de farmácias cresce (ex: > 5.000 por estado), o sistema deixará de encontrar farmácias que não estão entre as primeiras 2000 retornadas, além de consumir excesso de memória e tempo de CPU do Node.js.
- **Risco:** Latência crescente e custos operacionais elevados do Firestore por leituras desnecessárias.

### 1.2 Limite Rígido de Plantões (Hard Limit)
- **Local:** `server.ts` -> `/api/public/on-call` (Linha 919)
- **Problema:** A consulta de plantões para o dia atual tem um `limit(500)`.
- **Impacto:** Em um cenário de expansão nacional, se houver mais de 500 farmácias de plantão simultaneamente no Brasil, o sistema simplesmente não exibirá as excedentes, independentemente do filtro de estado ou cidade.

### 1.3 Ineficiência no Gerenciador de Estatísticas (`updateDashboardStats`)
- **Local:** `server.ts` -> Função `updateDashboardStats`
- **Problema:** A função realiza uma busca de TODOS os pagamentos aprovados do ano corrente (`yearPaymentsSnapshot`) para agrupar por mês em memória.
- **Impacto:** No final do ano, com milhares de assinaturas, esta função se tornará extremamente lenta e poderá causar timeouts, além de ser disparada em webhooks, podendo causar contenção.

---

## 2. Falhas de Arquitetura e Performance (Frontend Admin)

### 2.1 Refetching Excessivo no Painel Administrativo
- **Local:** `AdminDashboard.tsx` -> `useEffect` (Linha 402)
- **Problema:** O painel administrativo recarrega **todos** os dados (estatísticas, configurações, plantões, destaques e logs e assinantes) sempre que o usuário muda de página na tabela de farmácias ou realiza uma busca.
- **Impacto:** É a causa direta do erro **"Rate exceeded"** reportado. O administrador consome dezenas de chamadas de API pesadas para cada clique de navegação simples.

### 2.2 Dependência de "Simular Pagamento" Manual
- **Local:** `PharmacyDashboard.tsx` e `server.ts`
- **Problema:** O fluxo de ativação depende fortemente de webhooks ou simulação manual.
- **Impacto:** Inconsistência entre o status no Mercado Pago e o status local se o webhook falhar ou se o administrador não "sincronizar" os dados manualmente.

---

## 3. Vulnerabilidades e Consistência de Dados

### 3.1 Riscos de Duplicação de Assinaturas
- **Local:** `server.ts` -> Webhook e `simulate-payment`
- **Problema:** Ao aprovar um pagamento, o sistema cria uma nova entrada em `subscriptions` sem verificar se já existe uma assinatura ativa para aquele ciclo de pagamento/ID de preapproval.
- **Risco:** Criação de múltiplos registros de assinatura para a mesma farmácia, dificultando a auditoria financeira e o controle de expiração.

### 3.2 Exposição de Detalhes de Infraestrutura
- **Local:** `AdminDashboard.tsx` e `PharmacyDashboard.tsx`
- **Problema:** Erros técnicos do Firestore (como `Quota exceeded` ou JSONs de erro do sistema) são exibidos de forma "crua" para o usuário.
- **Risco:** Revela detalhes internos do banco de dados e gera uma percepção de instabilidade no sistema.

---

## 4. Problemas de UX e Layout

### 4.1 Visibilidade de Filtros em Dispositivos Móveis
- **Local:** `OnCall.tsx` e `Home.tsx`
- **Problema:** O layout de busca por CEP e localização atual ocupa muito espaço vertical, empurrando os resultados para "abaixo da dobra" em celulares.
- **Impacto:** Dificulta a usabilidade imediata para usuários que buscam ajuda rápida.

---

## Diagnóstico Final
O sistema é funcional e robusto em sua lógica de negócio, mas apresenta **arquitetura de consulta de "baixa escala"**. A solução para os erros de "indisponibilidade" (Rate/Quota exceeded) não é aumentar os limites do Firebase, mas sim **implementar paginação real no backend** e **desacoplar as atualizações de estatísticas** da navegação do usuário.

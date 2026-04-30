# Relatório de Erros e Vulnerabilidades do Sistema

Este relatório apresenta uma análise técnica detalhada dos erros, vulnerabilidades e gargalos de performance identificados no sistema de Farmácias de Plantão.

---

## 1. Gargalos de Performance e Escalabilidade (Backend)

### 1.1 Consultas de Alta Intensidade no Firestore
- **Local:** `server.ts` -> `api/public/pharmacies` e `api/public/on-call`
- **Problema:** O sistema recupera grandes conjuntos de documentos (até 2000 em `pharmacies` e todos os ativos de um estado em `on-call`) para realizar filtragem por distância, cidade ou nome em memória (via JavaScript).
- **Impacto:** Conforme o número de farmácias cadastradas cresce, o tempo de resposta aumentará linearmente, resultando em latência alta e estouro de memória no servidor. Além disso, causa um consumo excessivo de cotas de leitura do Firestore.

### 1.2 Atualização Ineficiente de Estatísticas
- **Local:** `server.ts` -> `updateDashboardStats`
- **Problema:** Esta função é chamada em quase todos os webhooks de pagamento e rotas administrativas. Ela realiza 5 consultas complexas e agregações sempre que é disparada.
- **Impacto:** O erro **"Rate exceeded"** reportado pelo administrador é causado por essa avalanche de operações simultâneas no Firestore durante picos de atividade (ex: processamento de webhooks de renovação).

### 1.3 Processamento Serial de Chunks (N+1)
- **Local:** `server.ts` -> `app.get('/api/public/on-call', ...)`
- **Problema:** A busca de detalhes das farmácias de plantão é feita em chunks de 30 documentos usando um loop `for` com `await` sequencial.
- **Impacto:** Cria um "gargalo de rede" onde cada requisição deve esperar a anterior terminar, aumentando artificialmente o tempo de carregamento para o usuário final.

---

## 2. Vulnerabilidades de Segurança e Privacidade

### 2.1 Exposição de PII (Informações Pessoais)
- **Local:** `server.ts` -> Diversas rotas públicas.
- **Problema:** Uso excessivo do operador spread `...doc.data()` em respostas públicas. Embora o utilitário `sanitizePublicPharmacy` seja utilizado, sua aplicação não é garantida em todos os fluxos de dados (ex: no mapeamento manual de plantões).
- **Risco:** Dados sensíveis como `user_id`, `email` de cadastro e `user_email` podem ser vazados para o frontend.

### 2.2 Rate Limiting Insuficiente para Webhooks
- **Local:** `server.ts` -> `app.post('/api/webhooks/mercadopago', ...)`
- **Problema:** Webhooks são portas de entrada críticas que disparam lógicas pesadas (`updateDashboardStats`). A proteção atual pode ser contornada, permitindo ataques de negação de serviço (DoS) que esgotam o orçamento/cota do Firebase (*Denial of Wallet*).

---

## 3. Falhas de Arquitetura e UX (Frontend)

### 3.1 Consultas Híbridas e Pesadas (Painel Admin)
- **Local:** `AdminDashboard.tsx`
- **Problema:** O componente realiza uma mistura de chamadas de API e leituras diretas via Firebase SDK (`getDoc`, `getDocs`) em cada montagem do componente.
- **Causa da Falha:** Isso duplica a carga no Firestore e é a fonte direta dos erros de cota excedida que o administrador visualiza.

### 3.2 Listeners Pesados no Cliente
- **Local:** `PharmacyDashboard.tsx`
- **Problema:** O uso de múltiplos `onSnapshot` sem filtros granulares do lado do servidor (ex: o listener de `clicks` baixa até 1000 documentos e filtra o `pharmacy_id` via JavaScript).
- **Impacto:** Dispositivos móveis de donos de farmácias sofrem com alto consumo de bateria e dados, além de lentidão na interface conforme o histórico de cliques cresce.

### 3.3 Tratamento de Erros Inadequado
- **Local:** `src/lib/firebaseError.ts` e componentes de Dashboard.
- **Problema:** Erros críticos de infraestrutura (como `Rate exceeded`) são serializados para JSON e exibidos diretamente para o usuário final.
- **UX:** Isso revela detalhes internos do sistema (UIDs, emails, caminhos da DB) e não oferece uma solução amigável ao usuário.

---

## 4. Inconsistência na Busca de Plantões
- **Local:** `OnCall.tsx` e `server.ts`
- **Problema:** A geração da variável `today` depende do fuso horário local e formato `sv-SE`. Divergências sutis entre o fuso do servidor e do cliente podem resultar em "Nenhum plantão encontrado" para usuários em regiões com fusos horários específicos durante as primeiras ou últimas horas do dia.

---

## Diagnóstico Final
O sistema possui uma base funcional robusta, mas os erros atuais de **"indisponibilidade"** e **"falhas de carregamento"** não são bugs de software, mas sim **consequências de um design de consultas ineficiente** que ultrapassa os limites gratuitos do Firestore e degrada a performance sob carga moderada.

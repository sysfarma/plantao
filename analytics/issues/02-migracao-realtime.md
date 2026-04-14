# 2. Migração para Atualizações em Tempo Real (Real-time)

* **Page:** `/plantao` (Plantões de Hoje) e `/pharmacy` (Dashboard da Farmácia)
* **Component:** `OnCall.tsx`, `Dashboard.tsx` (Pharmacy)
* **Behavior:** 
  - Substituir as requisições HTTP estáticas (`fetch` para a API Express) por ouvintes nativos do Firebase (`onSnapshot`).
  - Garantir que a interface reflita instantaneamente quaisquer alterações no banco de dados, como a adição de novos plantões ou atualizações de status da assinatura/farmácia.

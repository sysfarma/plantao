# Especificação de Funcionalidades Pendentes - Conexão Firebase (Spec.md)

Este documento detalha **exclusivamente** as implementações técnicas pendentes para finalizar a conexão com o banco de dados Firebase, com base no relatório de análise (`analytics/report.md`).

---

## 1. Tratamento de Erros Padronizado e Teste de Conexão
* **Page:** Global (Boot da Aplicação)
* **Component:** `FirebaseProvider` (a criar), `ErrorBoundary` (a criar), `App.tsx`
* **Behavior:** 
  - Implementar a função `handleFirestoreError` para capturar falhas de operação no Firebase e lançar erros estruturados em JSON (contendo detalhes da operação e do estado de autenticação).
  - Executar um teste de conexão via `getFromServer` no carregamento inicial dentro do `FirebaseProvider`.
  - Envolver a aplicação em um `ErrorBoundary` para capturar e exibir mensagens amigáveis ao usuário caso o cliente esteja offline ou ocorram erros de permissão.

## 2. Migração para Atualizações em Tempo Real (Real-time)
* **Page:** `/plantao` (Plantões de Hoje) e `/pharmacy` (Dashboard da Farmácia)
* **Component:** `OnCall.tsx`, `Dashboard.tsx` (Pharmacy)
* **Behavior:** 
  - Substituir as requisições HTTP estáticas (`fetch` para a API Express) por ouvintes nativos do Firebase (`onSnapshot`).
  - Garantir que a interface reflita instantaneamente quaisquer alterações no banco de dados, como a adição de novos plantões ou atualizações de status da assinatura/farmácia.

## 3. Hardening das Regras de Segurança (Firestore Rules)
* **Page:** Backend / Configuração (`firestore.rules`)
* **Component:** N/A
* **Behavior:** 
  - Adicionar limites de tamanho (`.size()`) em todos os campos de texto (ex: `name`, `street`, `neighborhood`) para prevenir ataques de exaustão de recursos (DoS).
  - Refinar as validações de tipo para usar verificações estritas (`is int`, `is timestamp`).
  - Bloquear vulnerabilidades de "Update Bypass", garantindo que documentos válidos não possam ser atualizados para estados inválidos.

## 4. Consistência de Contadores e Campos de Auditoria
* **Page:** Backend / Configuração (`firestore.rules`, `firebase-blueprint.json`)
* **Component:** N/A
* **Behavior:** 
  - Implementar validação atômica com `getAfter()` nas regras de segurança para qualquer lógica de incremento de contadores (ex: métricas de cliques em WhatsApp/Mapa).
  - Atualizar o `firebase-blueprint.json` para incluir o campo `updated_at` em todas as entidades relevantes.
  - Exigir nas regras do Firestore que o campo `updated_at` seja modificado corretamente e de forma imutável em relação ao criador em todas as operações de `update`.

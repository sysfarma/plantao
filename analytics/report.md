# Relatório de Análise - Conexão Firebase Database

Este relatório detalha o estado atual da integração com o Firebase no sistema **Farmácia de Plantão Brasil** e identifica as pendências para finalizar a conexão seguindo as melhores práticas de segurança e performance.

---

## 1. Status Atual da Integração
O sistema já possui uma base sólida de conexão:
- **Backend:** Utiliza `firebase-admin` para operações privilegiadas (Auth e Firestore).
- **Frontend:** Utiliza o SDK cliente do Firebase para autenticação e configuração.
- **Configuração:** Centralizada no arquivo `firebase-applet-config.json`.
- **Segurança:** Arquivo `firestore.rules` implementado com validações de domínio.
- **Estrutura:** `firebase-blueprint.json` define as entidades principais.

---

## 2. Pendências Críticas (O que falta terminar)

### 2.1. Robustez e Tratamento de Erros
- [ ] **Implementação do `handleFirestoreError`:** O backend e o frontend ainda utilizam blocos `try/catch` genéricos. É necessário implementar a função de tratamento de erro padronizada que retorna detalhes da operação e do estado de autenticação em formato JSON.
- [ ] **Teste de Conexão no Boot:** Falta implementar a chamada `getFromServer` no componente principal (`App.tsx` ou um Provider) para validar se o cliente está online e se as credenciais são válidas logo no início da aplicação.

### 2.2. Performance e Real-time
- [ ] **Migração para `onSnapshot`:** Atualmente, o frontend depende de chamadas `fetch` para a API Express para obter dados. Para uma experiência "Firebase nativa", as telas de **Plantões de Hoje** e **Dashboard da Farmácia** devem utilizar ouvintes em tempo real para refletir mudanças instantâneas no banco.
- [ ] **Otimização de Queries:** Revisar as consultas no backend para garantir que utilizam índices compostos onde necessário (ex: filtros por cidade + estado + is_active).

### 2.3. Segurança e Hardening (Regras de Firestore)
- [ ] **Proteção contra DoS (Size Limits):** Adicionar verificações `.size()` em todos os campos de string (ex: `name`, `street`, `bio`) nas `firestore.rules` para impedir o upload de payloads massivos (ataques de exaustão de recursos).
- [ ] **Validação de Integridade de Contadores:** Caso sejam implementados contadores de visualizações, utilizar o padrão `getAfter()` para garantir a consistência atômica entre o incremento e o registro do log de clique.
- [ ] **Devil's Advocate Attack:** Realizar uma auditoria completa nas regras para garantir que não existam brechas de "Update Bypass" (onde um usuário cria um documento válido mas o atualiza para um estado inválido).

### 2.4. Metadados e Blueprint
- [ ] **Sincronização de Campos de Auditoria:** Garantir que todos os modelos no `firebase-blueprint.json` incluam `updated_at` e que as regras de segurança exijam que este campo seja atualizado corretamente.
- [ ] **Validação de Tipos Estrita:** Refinar as regras para usar `is int`, `is float` ou `is timestamp` em vez de apenas `is number` onde aplicável.

---

## 3. Próximos Passos Recomendados
1. Implementar o componente `FirebaseProvider` no frontend para gerenciar o estado global da conexão.
2. Adicionar o Error Boundary específico para falhas de permissão do Firestore.
3. Executar o deploy final das regras após o hardening dos limites de tamanho.

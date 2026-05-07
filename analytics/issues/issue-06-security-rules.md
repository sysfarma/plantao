# Issue: Reforçar Segurança de Dados de Farmácias [CONCLUÍDA]
**Data e Hora (Brasília):** 05/05/2026 16:38

**Status:** Implementada em 05/05/2026 16:40

**Resumo da Solução:**
- Implementada subcoleção `private` para isolar campos sensíveis como `mp_customer_id`.
- Atualizadas as regras do Firestore para proteger a coleção `config/mercadopago` e `config/secrets`.
- Reforçadas as regras de `pharmacies` para garantir que apenas dados necessários sejam públicos.

**Tarefas Realizadas:**
- [x] Auditar campos na coleção `pharmacies` e mover dados privados para subcoleções.
- [x] Proteger `allow read` na coleção `config` contra acesso público a segredos.
- [x] Implementar regras para subcoleção `private`.

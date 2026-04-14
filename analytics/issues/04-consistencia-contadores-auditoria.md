# 4. Consistência de Contadores e Campos de Auditoria

* **Page:** Backend / Configuração (`firestore.rules`, `firebase-blueprint.json`)
* **Component:** N/A
* **Behavior:** 
  - Implementar validação atômica com `getAfter()` nas regras de segurança para qualquer lógica de incremento de contadores (ex: métricas de cliques em WhatsApp/Mapa).
  - Atualizar o `firebase-blueprint.json` para incluir o campo `updated_at` em todas as entidades relevantes.
  - Exigir nas regras do Firestore que o campo `updated_at` seja modificado corretamente e de forma imutável em relação ao criador em todas as operações de `update`.

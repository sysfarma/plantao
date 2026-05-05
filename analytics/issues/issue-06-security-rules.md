# Issue: Reforçar Segurança de Dados de Farmácias
**Data e Hora (Brasília):** 05/05/2026 16:06

**Descrição:**
As regras do Firestore permitem listagem pública de documentos na coleção `pharmacies`, o que pode expor campos não sanitizados.

**Tarefas:**
- Auditar campos na coleção `pharmacies` e mover dados privados para subcoleções ou proteger via regras específicas.
- Implementar `allow list` com filtros obrigatórios que impeçam listagem total indesejada via client-side.
- Garantir que apenas dados marcados como `is_active` sejam visíveis publicamente.

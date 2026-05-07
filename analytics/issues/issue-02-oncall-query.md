# Issue: Otimizar Consulta de Plantões (On-Call) [CONCLUÍDA]
**Data e Hora (Brasília):** 05/05/2026 16:13

**Status:** Implementado em 05/05/2026 16:13

**Resumo da Solução:**
- Adicionados os campos `city` e `state` na coleção `shifts`.
- Atualizados os endpoints de criação de plantão (Farmácia e Admin) para herdar cidade/estado do perfil da farmácia.
- Refatorada a rota `/api/public/on-call` para filtrar por `state` diretamente na consulta do Firestore, eliminando o gargalo do `limit(500)` global.
- Aumentado o limite para 1000 quando filtrado por estado, garantindo cobertura total em estados populosos.

**Tarefas Realizadas:**
- [x] Refatorar query para filtrar por `state` diretamente.
- [x] Adicionar `city` e `state` no schema de `shifts`.
- [x] Corrigir o limite de 500 para algo mais dinâmico.
- [x] Atualizar script de seed para suportar os novos campos.

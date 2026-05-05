# Issue: Otimizar Consulta de Plantões (On-Call)
**Data e Hora (Brasília):** 05/05/2026 16:06

**Descrição:**
A rota `/api/public/on-call` busca plantões com um limite global de 500, o que pode causar falta de resultados em buscas locais se houver muitos plantões cadastrados.

**Tarefas:**
- Refatorar query para filtrar por `state` e `city` (se fornecidos) antes de aplicar o limite.
- Garantir que a filtragem por distância ocorra de forma eficiente ou use paginação por cursor.
- Corrigir o limite de 500 para algo mais dinâmico ou regional.

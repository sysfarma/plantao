# Issue: Padronizar Traduções de Erros [CONCLUÍDA]
**Data e Hora (Brasília):** 05/05/2026 16:42

**Status:** Implementada em 05/05/2026 16:45

**Resumo da Solução:**
- Centralizadas mensagens de erro no `server.ts` através de um objeto constante `ERRORS`.
- Traduzidas as mensagens mais comuns do backend de Inglês para Português-BR.
- Verificada a consistência no frontend utilizando a função `translateError` para exibir mensagens amigáveis aos usuários.

**Tarefas Realizadas:**
- [x] Centralizar mensagens de erro no `server.ts` em Português-BR.
- [x] Revisar o frontend em busca de alertas/textos em Inglês remanescentes.
- [x] Padronizar o formato de resposta de erro das APIs.

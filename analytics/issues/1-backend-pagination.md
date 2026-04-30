# Issue 1: Paginação Real com Firestore Cursors
**Data de Geração:** 30/04/2026 09:02:00 (Horário de Brasília)

## Descrição
Atualmente o sistema limita as buscas a 2000 documentos e as filtra em memória. É necessário implementar a paginação real no backend para suportar grandes volumes de dados.

## Requisitos
- **Local:** `server.ts` -> `/api/public/pharmacies`
- Adicionar suporte aos query params `lastDocId` ou `offset`.
- Utilizar `.startAfter()` do Firestore SDK para buscar os próximos resultados.
- Retornar o ID do último documento visível no payload da resposta.

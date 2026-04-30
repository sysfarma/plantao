# Issue 5: Tradutor de Erros de Infraestrutura
**Data de Geração:** 30/04/2026 09:02:00 (Horário de Brasília)

## Descrição
Evitar a exibição de mensagens de erro técnicas do Firestore/Node.js para o usuário final.

## Requisitos
- **Local:** `src/components/FirebaseProvider.tsx` ou componente `Toast`.
- Implementar um mapeamento (dictionary) de códigos de erro:
    - `RESOURCE_EXHAUSTED` -> "O sistema está temporariamente sobrecarregado. Tente novamente em instantes."
    - `PERMISSION_DENIED` -> "Seu acesso expirou ou você não tem permissão para esta ação."
- Aplicar este tradutor em todos os catches globais.

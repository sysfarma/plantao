# Issue 4: Refatoração do Ciclo de Vida do Admin
**Data de Geração:** 30/04/2026 09:02:00 (Horário de Brasília)

## Descrição
O painel administrativo recarrega dados globais desnecessariamente ao navegar entre páginas ou abas.

## Requisitos
- **Local:** `src/pages/admin/Dashboard.tsx`
- Implementar **Lazy Loading** por aba: os dados de "Assinantes" ou "Audit" só devem ser buscados quando a respectiva aba for selecionada.
- Memorizar consultas globais (configurações) para que não sejam disparadas novamente ao mudar a página da tabela de farmácias.

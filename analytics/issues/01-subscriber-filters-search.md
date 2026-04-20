# Issue 01: Filtros e Busca de Assinantes

## Descrição
Melhorar a experiência do Admin na aba de Assinantes adicionando capacidades de filtragem e busca dinâmica.

## Tarefas
- [x] Criar o componente `SubscriberFilters`.
- [x] Adicionar campo de busca (ícone Search do Lucide).
- [x] Adicionar Select Dropdown para Status (Ativo, Pendente, Cancelado, Expirado).
- [x] Implementar a lógica de filtragem no `AdminDashboard` (local ou via query params).
- [x] Garantir que o estado do filtro seja mantido durante a navegação entre abas.

## Critérios de Aceite
- O Admin consegue filtrar 100+ assinantes por status em menos de 1 segundo.
- A busca por texto deve filtrar simultaneamente por Nome da Farmácia ou E-mail.

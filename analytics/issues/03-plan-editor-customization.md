# Issue 03: Editor Dinâmico de Planos

## Descrição
Retirar os textos de planos do código (hardcoded) e permitir que o Admin Master edite os benefícios, títulos e configurações MP diretamente pelo painel.

## Tarefas
- [x] Criar o componente `PlanEditorForm`.
- [x] Implementar CRUD de "Benefícios" (Array de strings).
- [x] Adicionar campos: Nome do Plano, Descrição, Preço.
- [x] Salvar dados no documento `config/subscription_plans`.
- [x] Adicionar funcionalidade de "Criar Novo Plano" (além dos níveis Mensal/Anual).

## Critérios de Aceite
- Alterações feitas no Admin refletem imediatamente na página de Preços do cliente.
- Suporte a múltiplos benefícios por plano com interface de lista simples.

# Issue 02: Histórico de Pagamentos do Assinante

## Descrição
Permitir que o Admin visualize o histórico financeiro completo de uma farmácia específica dentro do painel de controle.

## Tarefas
- [x] Criar o componente `PaymentHistoryTable` (Integrado no Modal).
- [x] Adicionar botão "Histórico" ou ícone em cada linha da tabela de Assinantes.
- [x] Criar Modal para exibir os pagamentos filtrados por `pharmacy_id`.
- [x] Integrar com a coleção `payments` do Firestore (via backend API).
- [x] Formatadores de moeda (BRL) e data (PT-BR) aplicados.

## Critérios de Aceite
- Ao clicar em uma farmácia, um modal abre com a lista cronológica de transações Mercado Pago.
- Exibe Status (Aprovado, Pendente, Falho) de cada transação.

# Especificação Técnica: Implementações Pendentes

Esta especificação detalha os componentes, comportamentos e atualizações de página necessários para atingir 100% de conclusão nos módulos de Assinaturas e Planos, conforme identificado no relatório de analytics.

## 1. Componentes (Components)

### `SubscriberFilters`
- **Descrição:** Barra de ferramentas para filtrar a lista de assinantes.
- **Props/Estado:** 
  - `onFilterChange`: Callback para enviar os critérios ao backend ou filtrar localmente.
- **Elementos:** Campo de busca (Search input) e Select Dropdown (Status: Ativo, Expirado, Pendente, Cancelado).

### `PaymentHistoryTable`
- **Descrição:** Modal ou seção expansível dentro da aba de Assinantes.
- **Funcionalidade:** Listar todos os documentos da coleção `payments` filtrados por `pharmacy_id`. Deve exibir ID MP, Valor, Método, Status e Data.

### `PlanEditorForm`
- **Descrição:** Formulário dinâmico para edição de planos.
- **Campos:** 
  - Nome Amigável (Título do card).
  - Descrição Curta.
  - Lista de Benefícios (CRUD de itens simples).
  - Configurações MP: Parcelas permitidas, Desconto no anual (%).

### `MercadoPagoTester`
- **Descrição:** Botão acoplado à configuração de credenciais.
- **Comportamento:** Chama uma rota de debug que tenta instanciar o `MercadoPagoConfig` e buscar as informações da conta (endpoint `/v1/account`) para validar a chave.

## 2. Comportamentos (Behaviors)

### `PlanUpgradeFlow` (Upgrade/Downgrade)
- **Lógica:** Implementar no `/server.ts` a rota `PUT /api/subscriptions/update`.
- **Regra:** Se o usuário já tem uma assinatura ativa, deve cancelar a anterior (ou fazer o update do valor no MP) e gerar o novo ciclo. Preferencialmente, redirecionar para o checkout para confirmar o novo método/valor.

### `DataExportAction` (CSV Export)
- **Lógica:** Função auxiliar no frontend que recebe o array `adminSubscribers`, converte para formato CSV (utilizando os cabeçalhos da tabela) e dispara o download via Blob.

### `EnhancedWebhookHandler`
- **Lógica:** Atualizar a rota `/api/webhooks/payment` no `server.ts` para capturar os estados de `refunded` (estorno) e `cancelled` (cancelamento pelo portal MP).
- **Ação:** Deve disparar o e-mail de notificação de cancelamento e setar `is_active: 0` na farmácia imediatamente.

### `AuditLogger`
- **Lógica:** Toda alteração manual feita pelo Admin via `PUT /api/admin/subscriptions/:id` deve criar um documento na coleção `audit_logs` registrando: `admin_id`, `target_id`, `previous_state`, `new_state`, `timestamp`.

## 3. Páginas (Pages)

### `AdminDashboard` (Atualizações)
- **Aba Assinantes:** Integrar `SubscriberFilters` e `PaymentHistoryTable`.
- **Aba Planos:** Migrar de campos estáticos para o `PlanEditorForm` e adicionar funcionalidade de "Novo Plano" que cria documentos dinâmicos em `config/subscription_plans`.
- **Aba Configurações:** Inserir o componente `MercadoPagoTester`.

### `PharmacyDashboard` / `Checkout` (Atualizações)
- **Visual:** Implementar estados de *Skeleton Loading* enquanto o checkout do Mercado Pago carrega.
- **Feedback:** Modal de sucesso/erro mais descritivo baseado na resposta do `init_point` ou processamento do Pix.
- **Gerenciamento:** Se já houver assinatura, substituir os botões de "Comprar" por "Alterar Plano" (acionando o `PlanUpgradeFlow`).

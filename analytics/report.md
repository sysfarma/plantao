# Relatório de Status: Assinantes e Planos de Assinatura

Este relatório detalha o estado atual do desenvolvimento das funcionalidades de **Controle de Assinantes** e **Configuração de Planos**, identificando o que já foi implementado e as lacunas restantes para a finalização completa.

## 1. Controle de Assinantes (Admin Master)

### O que já funciona:
- **Visualização:** Tabela centralizada listando Farmácia, E-mail, Plano contratado, Status e Data de Expiração.
- **Edição Manual:** O Admin pode alterar manualmente o status (Ativo, Pendente, Cancelado, Expirado) e as datas de faturamento/expiração via modal.
- **Exclusão:** Possibilidade de remover uma assinatura permanentemente, o que desativa automaticamente a farmácia.
- **Sincronização:** Alterações no status da assinatura refletem imediatamente no acesso da farmácia ao sistema (campo `is_active` e `subscription_active`).

### O que falta implementar:
- **Filtros e Busca:** Adicionar filtros por Status (Ativos, Expirados, Pendentes) e um campo de busca por nome ou e-mail da farmácia.
- **Histórico de Pagamentos:** Uma visualização detalhada de todos os pagamentos (Pix ou Cartão) realizados por aquele assinante específico.
- **Logs de Auditoria:** Rastrear quem alterou o status da assinatura e quando (essencial para segurança).
- **Exportação de Dados:** Botão para exportar a lista de assinantes em CSV/Excel para controle financeiro externo.

---

## 2. Planos de Assinatura e Configuração (Admin Master)

### O que já funciona:
- **Configuração de API:** Interface para salvar a `Public Key` e o `Access Token` do Mercado Pago diretamente no Firestore (`config/mercadopago`).
- **Gestão de Preços:** Possibilidade de ativar/desativar e alterar os valores dos planos Mensal e Anual.
- **Integração Backend:** Rotas para persistir essas configurações e servir os preços dinâmicos para a página de checkout das farmácias.

### O que falta implementar:
- **Criação de Novos Planos:** Atualmente o sistema está "hardcoded" para apenas Mensal e Anual. Falta uma interface para criar novos tipos de planos (ex: Semestral, Trimestral).
- **Configurações Avançadas de Checkout:** Opções para configurar parcelamento, descontos automáticos no plano anual e período de teste gratuito (Free Trial).
- **Validação de Credenciais:** Botão de "Testar Conexão" que valide se as chaves do Mercado Pago inseridas são válidas antes de salvar.
- **Customização Visual:** Permitir que o admin altere a descrição e os benefícios listados em cada plano diretamente pelo painel.

---

## 3. Integração com Mercado Pago (Core)

### O que já funciona:
- **Checkout:** Geração de assinaturas recorrentes (Pre-approval) e pagamentos via Pix.
- **Webhooks:** O servidor já processa notificações de pagamento aprovado e status de assinatura.
- **Segurança:** Regras do Firestore protegem o `Access Token`, permitindo que apenas o Admin Master o visualize.

### O que falta implementar:
- **Troca de Plano (Upgrade/Downgrade):** Fluxo para o cliente mudar do plano mensal para o anual sem duplicar cobranças.
- **Tratamento de Falhas Progressivo:** Melhorar o tratamento de webhooks para casos de estorno (chargeback) ou cancelamento direto no portal do Mercado Pago.
- **Interface de Checkout Superior:** Melhorar a UI da farmácia durante o processo de pagamento, incluindo estados de carregamento e feedback visual mais rico do Mercado Pago.

---

## Conclusão Geral do Sistema
O sistema possui uma base sólida e funcional (back-to-front). O foco agora deve ser em **UX Administrativa** (filtros e organização) e **Resiliência Financeira** (detalhes de pagamento e trocas de plano).

**Status Geral:** 85% Concluído.

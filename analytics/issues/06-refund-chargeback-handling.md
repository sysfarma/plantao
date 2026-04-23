# Issue #06 - Tratar Reembolsos e Chargebacks no Webhook

**Tipo:** Backend / Lógica de Negócio

**Componente Fonte:** `/analytics/Spec.md` (Item 1.1)

## Descrição
Atualmente o sistema não repassa para o banco de dados quando ocorre uma devolução, reintegração de posse ou disputa e perde-se o valor transacionado por fatores externos à farmácia. Isso permite que uma farmácia cancele o pagamento na operadora de cartão ou estorne o pix através do banco logrando fraude e ainda retenha o selo "Ativo" no mapa de plantões.

## Tarefas a Implementar
- **No arquivo `server.ts` (Webhook de Payment):** 
  - Interceptar também transições de status maliciosas/devolutivas oriundas do payload do MP, especificamente a trinca: `"refunded"`, `"charged_back"` e `"rejected"`.
  - Construir um fluxo que identifique a farmácia pelo `paymentDoc` e atualize o parâmetro vital na coleção `pharmacies` para `is_active: 0` e `subscription_active: false`.
  - Logar o cancelamento ou estorno passivamente para fácil visualização futura.

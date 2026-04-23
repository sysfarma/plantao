# Issue #10 - Injeção Dinâmica do Notification URL (Webhooks Resilientes)

**Tipo:** Backend Configs / Prevenção

**Componente Fonte:** `/analytics/Spec.md` (Item 1.5)

## Descrição
Quando as subscrições são mandadas avulsas e o back-end omite a declaração primária de quem vai ouvir elas dinamicamente, a infraestrutura obriga a que haja apenas 1 webhook fixado via painel invisível pela UI do Mercado Pago Developer account. Quando subimos Preview URLs do Google AI Studio para testes, todas assinaturas passam como mortas pois o ping está atrelado a hostnames arcaicos em produção.

## Tarefas a Implementar
- No momento da confecção do `body` payload na montagem das faturas (`/api/subscriptions/create`, transações em lotes do Cartão, e principalmente pagamentos esparsos de `Pix`), forçar nativamente o envio do atributo estrito `notification_url`.
- Esse atributo deve puxar a variável de ambiente (Environment Variable) raiz referida como `process.env.APP_URL` ou congêneres de forma interpolada:
`notification_url: \`\${process.env.APP_URL}/api/webhooks/payment\``
- Desse modo, o Mercado Pago será soberanamente direcionado e responderá ao hostname dinâmico instanciado sem perder conexões independentemente de ser homologação, local dev ou deployment em Cloud Run.

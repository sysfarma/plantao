# Issue #09 - Processamento Assíncrono de Webhooks

**Tipo:** Backend / Otimização de Rede (Performance e Segurança Fix)

**Componente Fonte:** `/analytics/Spec.md` (Item 1.4)

## Descrição
A documentação mandatória dos webhooks do Mercado Pago exige um Retorno Transacional Imediato HTTP 200 OK. O tempo de limite é mínimo. Nosso gateway aguarda a validação do Payload Firestore e disparos robustos de e-mail ao cliente (`await emailService`) para então, por último, entregar os bytes finais do `.json(success)`. Isso causa a quebra de Timeout (Timeout Dropping) do provedor na alta volumetria.

## Tarefas a Implementar

### Escopo do Refactor em `/api/webhooks/*`
- Preservar perfeitamente e estritamente o trecho de código que lida com a chave criptográfica de verificação `hmac` comparando `x-signature` com payload bruto do `secret`.
- Caso aprovado a permissão, reescrever e soltar no meio do topo uma reposta imediata HTTP finalizando a camada HTTP Protocolar:
```typescript
res.status(200).json({ success: true, message: 'Webhook recebido em fila' });
```
- Criar a camada subjacente com uma operação em `Promise` ou função assíncrona não obstrutiva (`background process`) para continuar rodando pelo Node silenciosamente toda a extensa rotina de interações aos bancos de dados paralelos ou requisições complexas ligadas a faturamento fiscal com segurança e resiliência total nos servidores sem depender indiretamente dos pipes de Timeout restritos da API externa.

# Issue 5: Lógica de Erros e UI de Feedback

## Descrição
Erros técnicos são exibidos ao usuário e falta feedback visual sobre a estabilidade do sistema.

## Tarefas
- [ ] Refatorar `src/lib/firebaseError.ts` para interceptar erros de cota e permissão, traduzindo-os para mensagens de usuário.
- [ ] Criar componente `StabilityToast` para avisar sobre falhas temporárias de serviço.
- [ ] Implementar mecanismo de "Retry with Backoff" nas chamadas de API que falharem por rate-limit.

## Arquivos Afetados
- `src/lib/firebaseError.ts`
- `src/components/` (novo componente)
- `src/lib/api.ts` (lógica de retry)

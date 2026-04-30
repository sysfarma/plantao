# Issue 4: Segurança, Privacidade e Sincronização

## Descrição
Exposição de dados sensíveis em rotas públicas e inconsistência de datas nos plantões.

## Tarefas
- [ ] Garantir aplicação do `sanitizePublicPharmacy` em todos os retornos de rotas `/api/public/*`.
- [ ] Implementar Rate Limiting por IP/Token no endpoint de webhook do Mercado Pago.
- [ ] Criar endpoint `/api/status/time` para o frontend obter a data YYYY-MM-DD oficial do servidor.
- [ ] Sincronizar `src/pages/OnCall.tsx` para usar a data do servidor na busca de plantões.

## Arquivos Afetados
- `server.ts`
- `src/pages/OnCall.tsx`

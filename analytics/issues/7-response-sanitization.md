# Issue 7: Sanitização Universal de Respostas
**Data de Geração:** 30/04/2026 09:02:00 (Horário de Brasília)

## Descrição
Garantir que dados sensíveis de usuários (PII) nunca vazem em endpoints públicos.

## Requisitos
- **Local:** `server.ts`
- Implementar um wrapper ou middleware que aplique `sanitizePublicPharmacy` em **todos** os arrays de farmácias retornados (endpoints: search, on-call, highlights).
- Revisar a rota de plantões (`/api/public/on-call`) para garantir que os dados da farmácia anexados ao plantão também sejam sanitizados.

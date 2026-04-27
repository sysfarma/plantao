# Spec - Correções de Segurança Pendentes

Com base no relatório de segurança, as seguintes correções precisam ser implementadas no sistema:

## 1. Webhook do Mercado Pago (Backend)
- **File:** `server.ts`
- **Component:** Rota `POST /webhooks`
- **Behavior:** O fluxo de webhook deve rejeitar imediatamente a requisição abortando o processo se os cabeçalhos de assinatura (`x-signature` ou `x-request-id`) estiverem ausentes ou inválidos. A execução do processamento das assinaturas (assíncrono) não pode ocorrer se a verificação falhar ou os cabeçalhos não forem enviados.

## 2. Proteção de Cliques das Farmácias (Firestore Rules)
- **File:** `firestore.rules`
- **Component:** `match /pharmacies/{pharmacyId}` -> `allow update`
- **Behavior:** Ao permitir atualizações restritas aos campos `whatsapp_clicks` e `map_clicks`, a regra deve exigir obrigatoriamente que a atualização ocorra mediante um incremento ou ser limitada via Backend, mitigando fraudes e abuso por usuários anônimos.

## 3. Validação Relacional em Plantões e Pagamentos (Backend/Firestore Rules)
- **File:** `firestore.rules` e `server.ts`
- **Component:** Operações de criação para `shifts` e `payments`
- **Behavior:** Na regra de criação (`allow create`) ou na rota de API de criação correspondente em `server.ts`, é estritamente necessário verificar se a `pharmacy_id` atrelada ao request pertence, de fato, ao portfólio de farmácias do `request.auth.uid`. Usuários não podem vincular registros em IDs de farmácias alheias.

## 4. Vazamento de Dados do Administrador (Backend)
- **File:** `server.ts`
- **Component:** Rota `GET /api/debug/admin-check`
- **Behavior:** Proteger rigorosamente o endpoint utilizando o middleware `authenticateToken` e certificar-se de garantir acesso exclusivo à roles administrativas e limitar drasticamente as chaves devolvidas na Response, ou remover a rota em caso de desuso continuado.

## 5. Prevenção a E-mail Bombing no Forgot Password (Backend)
- **File:** `server.ts`
- **Component:** Rota `POST /api/auth/forgot-password`
- **Behavior:** É preciso implementar mecanismos de Throttling/Rate Limiting nesta rota, utilizando IP, verificação temporal no último registro disparado pela coleção `password_resets` para a conta, impedindo que requisições repetitivas resultem em envio massivo e descontrolado de e-mails para o SMTP Target.

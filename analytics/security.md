# Relatório de Falhas de Segurança - Farmácias de Plantão

**Data da Auditoria:** 27 de Abril de 2026

Após análise da base de código (Regras do Firestore, Arquivo `server.ts` de Backend e rotas de acesso), foram identificadas as seguintes vulnerabilidades de segurança:

---

## 1. Falha Crítica: Bypass de Autenticação em Webhook (Backend)
- **Local:** `server.ts` -> Rota `POST /webhooks`
- **Descrição:** A rota de recebimento de notificações do Mercado Pago efetua a validação das assinaturas via HMAC (`x-signature` header), porém possui uma falha lógica severa na condição. Caso o atacante simplesmente não envie o header `x-signature` ou `x-request-id`, o código cai num bloco `else` que dispara um `console.warn` mas **permite a continuação do fluxo e processamento síncrono e assíncrono do Webhook**, rotulando-o fiduciariamente sem verificação.
- **Risco (Impacto Crítico):** Permite ataques de "Webhook Spoofing" em que invasores disparam callbacks inverídicos para aprovar assinaturas fictícias sem arcarem com cobrança real, configurando desfalque comercial automático à plataforma.

## 2. Falha Crítica: Acesso Não Autenticado aos Contadores das Farmácias (Firestore Rules)
- **Local:** `firestore.rules` -> `match /pharmacies/{pharmacyId}`
- **Descrição:** Múltiplas restrições de permissões no `allow update` foram estabelecidas na coleção de farmácias. Uma das condições libera qualquer atualização livre se apenas for restrita aos cliques de estatísticas (terceira cláusula condicional: `request.resource.data.diff(resource.data).affectedKeys().hasOnly(['whatsapp_clicks', 'map_clicks', 'updated_at'])`).
Ao permitir que essas três propriedades sejam atualizadas isoladamente, a regra **inadvertidamente esquece de validar** o `isAuthenticated()`.
- **Risco (Impacto Crítico):** Qualquer usuário anônimo e totalmente não autenticado na internet pode reescrever deliberadamente os cliques de WhatsApp e Mapa de todos os concorrentes para valores irreais arbitrariamente altos ou zerá-los intencionalmente em ataques de defacing do serviço.

## 3. Falha Alta: Escalonamento Horizontal / Broken Access Control em Entidades Relacionais (Firestore Rules)
- **Local:** `firestore.rules` -> `match /shifts/{shiftId}` e `match /payments/{paymentId}`
- **Descrição:** Nas regras que autorizam criação de **plantões** e **pagamentos**, o Firestore assegura que a entidade vinculou seu próprio UID (`request.resource.data.user_id == request.auth.uid`). No entanto, o `firestore.rules` e o validador interno `isValidShift` esquecem de verificar se a `request.resource.data.pharmacy_id` recebida no body dessa requisição realmente PERTENCE àquele mesmo usuário (`request.auth.uid`). 
- **Risco (Impacto Alto):** Um ator malicioso, que tem uma conta válida no sistema de Farmácia e um provedor de UID válido, pode criar milhares de plantões e boletos atrelados propositalmente a **farmácias rivais e id's de terceiros**, gerando caos nas vitrines de plantão público, já que a vinculação é desprovida da checagem relacional primária.

## 4. Falha Alta: Exposição Sensível de UID Administrativa (Information Disclosure)
- **Local:** `server.ts` -> Rota `GET /api/debug/admin-check`
- **Descrição:** É mantido exposto um endpoint de "diagnóstico e auditoria em tempo de execução" que retorna livremente o UID, o papel (role), a existência no Auth e o ID do projeto GCP do Administrador Root. Além de omitir o fluxo de sessão de middleware exigido para proteger essas chaves.
- **Risco (Impacto Alto):** Informações confidenciais facilitam a escalada de privilégios. Com os IDs verdadeiros dos adms nas mãos do atacante, ele constrói payloads com os exatos dados da propriedade original e direciona com maior precisão os testes de representação (Spoofing).

## 5. Falha Média: Possibilidade de Ataque *E-mail Bombing* e Uso Indevido de Recursos 
- **Local:** `server.ts` -> Rota `POST /api/auth/forgot-password`
- **Descrição:** O envio do e-mail de redefinição de senha utilizando o método "sendPasswordRecoveryEmail" executa abertamente por e-mail validado no banco, omitindo recursos antiabuso (*Rate Limiter*, Limitação de Concorrência ou IP Throttling).
- **Risco (Impacto Médio):** Possibilita campanhas em que serviços disparadores lotam massivamente as caixas de correspondência. Devido a limites e cobranças unitárias nos e-mails transacionais (como SES/Mailgun), as chaves SMTP podem cair em negação por abuso originado neste único endpoint gerando lentidão irrestrita ao serviço.

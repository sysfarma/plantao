# Relatório de Análise Técnica - Sistema Farmácias de Plantão Brasil

Este relatório detalha os erros, vulnerabilidades e inconsistências identificados durante a análise técnica do sistema. Foram analisados o backend (Express/Firebase Admin), o frontend (React/Vite/Firebase SDK) e as regras de segurança do Firestore.

## 1. Erros Críticos de Funcionamento

### 1.1 Incompatibilidade de Roles no Sync de Usuários
- **Local:** `server.ts` (linha 250) vs `firestore.rules` (linha 134)
- **Descrição:** O endpoint `/api/auth/google-sync` define o papel do usuário como `'client'` para novos usuários que não são administradores. No entanto, a regra de validação `isValidUser` no Firestore permite apenas os papéis `['admin', 'pharmacy']`.
- **Impacto:** Qualquer novo usuário que tente fazer login via Google (e não seja o admin) falhará ao criar seu perfil no banco de dados, tornando o sistema inutilizável para clientes.

### 1.2 Bloqueio de Métricas para Visitantes
- **Local:** `Home.tsx` (função `handleTrackClick`) e `firestore.rules` (linha 235)
- **Descrição:** O rastreamento de cliques utiliza um `writeBatch` que adiciona um documento na coleção `clicks` e incrementa um contador no documento da `pharmacy`. Embora a regra de criação de cliques não exija autenticação, a regra de atualização da farmácia exige (`isAuthenticated()`).
- **Impacto:** Visitantes não autenticados (o público-alvo principal) não conseguem clicar nos links de WhatsApp ou Mapa sem que o sistema gere um erro de permissão negada no console, falhando em registrar a métrica.

### 1.3 Inconsistência de Esquema de Dados (Backfill)
- **Local:** `backfill_userid.ts` vs `firestore.rules`
- **Descrição:** O script de manutenção `backfill_userid.ts` adiciona o campo `user_id` em documentos das coleções `subscriptions`, `payments`, `clicks` e `shifts`. No entanto, os validadores nestas regras (ex: `isValidShift`) utilizam `hasOnlyAllowedFields` e NÃO incluem o campo `user_id`.
- **Impacto:** Se um administrador tentar atualizar um documento que foi processado pelo script de backfill através da interface, a operação falhará por "campos não permitidos".

## 2. Vulnerabilidades de Segurança

### 2.1 Exposição de Dados Sensíveis (Leitura Aberta)
- **Local:** `firestore.rules` (linhas 243 e 257)
- **Descrição:** As regras para as coleções `subscriptions` e `payments` permitem leitura para qualquer usuário autenticado (`isAuthenticated()`).
- **Impacto:** Um usuário mal-intencionado autenticado como "Farmácia A" pode consultar todos os pagamentos e status de assinatura da "Farmácia B", "Farmácia C", etc., expondo dados financeiros e comerciais.

### 2.2 Tokens de Recuperação em Texto Plano
- **Local:** `server.ts` (linha 186) e `firestore.rules`
- **Descrição:** Os tokens de recuperação de senha são gerados e armazenados em texto plano na coleção `password_resets`.
- **Impacto:** Se o banco de dados for comprometido ou se um admin mal-intencionado consultar a coleção, ele poderá sequestrar contas de usuários antes que o token expire.

### 2.3 Administração Hardcoded
- **Local:** `server.ts` (múltiplos locais) e `firestore.rules` (linha 97)
- **Descrição:** O e-mail do administrador `sys.farmaciasdeplantao@gmail.com` está hardcoded no código e nas regras de segurança.
- **Impacto:** Falta de flexibilidade para trocar o administrador e risco de segurança caso este e-mail específico seja alvo de ataques direcionados.

## 3. Inconsistências Lógicas e Riscos Operacionais

### 3.1 Divergência de Lógica de Autenticação
- **Local:** `server.ts` (Auth Middleware vs Google Sync)
- **Descrição:** O middleware de autenticação atribui o papel `'pharmacy'` por padrão para e-mails não administrativos, enquanto o sync do Google atribui `'client'`. 
- **Impacto:** Confusão de permissões e comportamentos imprevisíveis, como blocos de código destinados a farmácias nunca serem executados para usuários que entraram pelo Google Sync.

### 3.2 Usuários "Dummy" sem Acesso
- **Local:** `server.ts` (linha 1248)
- **Descrição:** Na criação de farmácias pelo admin, se o Firebase Auth falhar, o sistema cria um `userId` com prefixo `dummy_`. 
- **Impacto:** Estes usuários existem no Firestore mas não podem fazer login (pois não possuem conta no Auth), e o sistema não fornece uma forma clara de converter esse usuário em um usuário real sem intervenção manual complexa.

### 3.3 Risco de Bloqueio em APIs de Geocodificação
- **Local:** `src/pages/Home.tsx`
- **Descrição:** O uso da API Nominatim do OpenStreetMap sem um cabeçalho de User-Agent identificável e específico desrespeita a política de uso da API sob alto volume.
- **Impacto:** Risco de bloqueio de IP do servidor/cliente, inutilizando a busca geográfica do sistema.

---
**Fim do Relatório.**

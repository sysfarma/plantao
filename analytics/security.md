# Relatório de Falhas de Segurança Mapeadas

Esta é a análise atualizada focada em vulnerabilidades e falhas arquiteturais com impacto em segurança identificadas na atual versão do backend (`server.ts`). Nenhuma correção foi aplicada, mantendo-se estritamente o caráter de auditoria e especificação.

## 1. Information Disclosure / PII Leakage (CRÍTICO)
**Alvo:** Rotas `GET /api/public/pharmacies` e `GET /api/public/on-call` (`server.ts`: linhas 583 e 666)

**Descrição:**
A resposta que devolve as listagens para qualquer usuário não-autenticado usa o destrutor javascript `...doc.data()`, o que espelha exatamente a estrutura do banco de dados na resposta HTTP JSON. 
- **Problema:** Ao fazer isso, a aplicação submetida à internet publica o `user_id` do Firebase Auth do dono da farmácia, o `email` primário de contato/gestão, e potencialmente o `mp_customer_id` (Mercado Pago). Isso fere princípios de Least Privilege e LGPD, facilitando cross-referencing e spam contra os e-mails e UIDs de owners. 
- **Solução Arquitetural:** O mapeamento deve extrair em um novo objeto estritamente os campos públicos (`id`, `name`, `street`, `phone`, `whatsapp`, etc).

## 2. Injeção de Falha de Disponibilidade na Resposta a Escalas (ALTA)
**Alvo:** Rota `GET /api/public/on-call` (`server.ts`: linha 626 e 664)

**Descrição:** 
Como paliativo a problemas de "Denial of Wallet", adicionou-se na engine um limite genérico `.limit(100)` à query que lista todas as farmácias. Na sequência, recuperam-se de forma independente até 200 plantões de *hoje*, interligando "em memória" as chaves. 
- **Problema:** Um criminoso não consegue mais esgotar a RAM, mas esse paliativo mascarou a lógica da aplicação quebrando o pilar de *Availability* (Disponibilidade Securitária). Se o banco possuir 150 farmácias ativas e a listagem barrar em 100, todos os shifts associados às 50 últimas farmácias descartadas pela query jamais aparecerão na resposta pública (silenciosamente omitidos porque a condição no laço local não o encontra o map). Isso impede que os cidadãos sejam encaminhados para a respectiva infraestrutura crítica vital (saúde). O SQL/NoSQL Join "em memória" deve ser refeito utilizando os recursos de indices ou Queries do Firebase, puxando os documentos através da referência real.

## 3. Denial of Service (OOM) via Abuso em Esquecimentos de Senha (ALTA)
**Alvo:** Rota `POST /api/auth/forgot-password` (`server.ts`: linha 344)

**Descrição:**
A fim de prevenir o envio duplicado de e-mails de redefinição, a aplicação busca o "último token gerado". O trâmite busca TODOS os registros de redefinição daquele e-mail em `.where('email', '==', email).get()`, mapeia os vetores localmente na API e resolve a limitação via instrução JavaScript: `recentDocs.sort((a,b)...`.
- **Problema:** Este handler, por iterar um carregamento horizontal, serve como vetor DoS de exaustão de Memória e Denial of Wallet do Firestore. Se um atacante spammar a rota para o *mesmo* alvo (simulando diversos IPs e bypassando o check local em banco do IP Rate Limit), o banco fará retornos cada vez maiores (100... 5.000... 10.000 documentos da coleção de resets). A conversão `.map` esgotará a RAM local do node escalando o custo de Cloud Functions / Run ao limite da conta. A busca jamais deveria trazer tudo para memória, devendo utilizar `.where('email', '==', email).orderBy('created_at', 'desc').limit(1).get()`.

## 4. NoSQL Request Parameter Pollution / Type Juggling (MÉDIA)
**Alvo:** Rotas Públicas `GET` que filtram CEP ou Nomes (`server.ts`: linhas 590, 699)

**Descrição:** 
A captura dos params `const { cep, name } = req.query;` considera passivamente que o formato enviado na string web sempre será um tipo Literal String.
- **Problema:** Motores web como Express compilam URLs complexas como `?cep[$ne]=2&cep[]=123` em Objetos ou Arrays internamente. Quando essa variável chega aos castings diretos nas validações como `(cep as string).replace(...)` ou `p.name.toLowerCase().includes((name as string).toLowerCase())`, a engine do Node aborta e acusa _TypeError: includes is not a function_, estourando erros brutos 500 para requisições poluídas não parseadas (Crash por falta de higienização de input).

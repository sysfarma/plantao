# Relatório de Análise Geral do Sistema (Farmácias de Plantão)

## 1. Erros de Tipagem e Compilação (TypeScript)

Durante a análise da base de código e execução do linter, identificamos os seguintes problemas:

### 1.1. Arquivo `server.ts`
- **Linhas 1106, 1107, 1434**: O campo `user_id` está sendo atribuído à variável `subData`, porém o tipo inferido ou anonimo do objeto `subData` não inclui esse campo em sua inicialização. Deve-se assegurar que o tipo inclua `user_id?: string`. E há uma duplicação desnecessária (`subData.user_id = req.user.id;` consecutivamente nas linhas 1106/1107).
- **Linha 2293**: Existe um erro crítico de referência (`TS2304: Cannot find name 'userId'`). A variável que guarda o escopo de identificação do usuário foi recém renomeada (para `currentUserId`), mas a rotina de criação de assinatura gratuita que roda ao final de um novo cadastro (`db.collection('subscriptions').add(...)`) continua passando a referência inexistente `userId`. Isso causará falha 500 no carregamento.

### 1.2. Painéis Frontend (`Dashboard.tsx` e `Pricing.tsx`)
- Acesso à propriedades como "unknown":
  - **`src/pages/admin/Dashboard.tsx` (linhas 1306, 1307, 1309, 1310, 1324)**
  - **`src/pages/pharmacy/Pricing.tsx` (linhas 332, 333, 335, 336, 350)**

**Causa Lógica**: O método `Object.entries()` não conhece a interface dos dados (inferindo as propriedades como `unknown`). Quando a função de `.sort()` tenta extrair propriedades `title` e `price`, causa alerta de inferência no escopo global e do linter.

## 2. Erros Arquiteturais e Lógicos Mapeados

### 2.1. Inconsistência de Recuperação da Sessão Client-Side (Oculto)
Foram encontradas menções ao `auth.currentUser` no gerenciador principal, que é uma chamada síncrona aos dados que, no ciclo de bootstrap do Firebase, pode ser vazia (`null`). Chamadas como criação ou salvamento poderiam lançar _"Not authenticated"_ se a engine demorar milésimos de segundo a mais para restabelecer os tokens. O correto, para maior consistência, é sempre validar assincronamente (ex: `getAuthToken()`).

### 2.2. Restrições do Firestore e Regra de Validação
Em `firestore.rules`, as regras exigem campos estritos ou que a escrita esteja em conformidade com as restrições arquiteturais. No `handleSaveShift()`, quando se omitia intencionalmente ou via payload um atributo sensível (como `user_id` ao falhar em buscar pelo objeto), o payload falhava silenciosamente nas retentativas da Firebase API negando a `rules_validations`. 

## Conclusão
Em respeito à instrução informada, nenhum código foi alterado pós-levantamento, servindo este arquivo unicamente de norteador dos reparos subsequentes.

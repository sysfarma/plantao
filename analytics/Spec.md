# Especificação de Implementação (Spec.md)

Com base no relatório apontado em `analytics/error.md`, as seguintes implementações e correções diretas ("somente o que falta implementar") precisam ser executadas no sistema.

## 1. Back-end e Serviços Firestore
**Arquivo associado:** `server.ts`
*   **Componente:** Controladores de Webhooks e Registro de Assinaturas Genéricas.
*   **Behavior (Comportamento Esperado):**
    *   **Tipagem em `subData`:** Ajustar as linhas onde `subData` é inicializado, declarando uma interface/tipo que inclua as propriedades explícitas utilizadas no escopo, tal como `user_id?: string`. Remover a diretiva duplicada do `user_id` nas linhas adjacentes.
    *   **Resolução Exceção 500 (ReferenceError):** Na rotina de registro (`db.collection('subscriptions').add()`), substituir permanentemente o termo `userId` por `currentUserId`, ajustando ao contexto real das variáveis geradas no ciclo atual para novos cadastros.

## 2. Tipagem de Objetos nas Dashboards (Type Cast)
**Arquivo associado:** `src/pages/admin/Dashboard.tsx` e `src/pages/pharmacy/Pricing.tsx`
*   **Componente:** Interfaces Visuais, Seção de Planos de Pagamento e Relatórios.
*   **Behavior (Comportamento Esperado):**
    *   No mapeamento usando `Object.entries()`, predefinir que os valores iterados sigam o modelo customizado para evitar erros de leitura, aplicando _type casting_ nos objetos contendo `{ title, price }`. Exemplo técnico: inferir a interface da dupla chave/valor atráves de `as [string, { title: string, price: number }][]` ou pre-tipando no originador da propriedade `.sort()`. 

## 3. Sicronia Segura e Sessão de Usuário
**Arquivo associado:** UI Geral e Managers (principalmente chamadas via Front-end/Dashboard)
*   **Componente:** Rotinas de submissão (formulários, salvamentos, listagens de perfis autorais).
*   **Behavior (Comportamento Esperado):**
    *   Identificar em todo workflow principal (ex: gerador de objetos de UI ou instâncias do Firebase Storage) ocorrências síncronas usando estritamente o `auth.currentUser`.
    *   Refatorar os validadores para fluxo seguro _async_ (via utilitários existentes como `await getAuthToken()`), ou utilizando monitoramento dinâmico em um _Hook_ especializado que certifique a existência do token não-nulo antes da montagem e disparo das mutações.

## 4. Consistência e Constraints no Firebase API
**Arquivo associado:** Callbacks de mutação de Plantões (`handleSaveShift`).
*   **Componente:** Painel Operacional / Formulários Administrativos e de Farmácia de Plantão.
*   **Behavior (Comportamento Esperado):**
    *   Inspecionar o processo de composição de _payload_ no `handleSaveShift`. Adicionar lógicas no momento da construção do _document_ que incluam imperativamente o `user_id` na estrutura.
    *   Certificar-se de capturar o dado através da malha de credenciais assíncronas do aplicativo (agora refatorada pela issue anterior), validando e forçando a conformidade com as exigências prévias de validação estrita (size match/fields type) configuradas no arquivo `firestore.rules`.

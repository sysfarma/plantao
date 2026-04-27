# 3. Sicronia Segura e Sessão de Usuário
**Arquivo associado:** UI Geral e Managers (principalmente chamadas via Front-end/Dashboard)
*   **Componente:** Rotinas de submissão (formulários, salvamentos, listagens de perfis autorais).
*   **Behavior (Comportamento Esperado):**
    *   Identificar em todo workflow principal (ex: gerador de objetos de UI ou instâncias do Firebase Storage) ocorrências síncronas usando estritamente o `auth.currentUser`.
    *   Refatorar os validadores para fluxo seguro _async_ (via utilitários existentes como `await getAuthToken()`), ou utilizando monitoramento dinâmico em um _Hook_ especializado que certifique a existência do token não-nulo antes da montagem e disparo das mutações.

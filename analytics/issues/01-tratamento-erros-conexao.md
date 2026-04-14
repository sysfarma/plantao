# 1. Tratamento de Erros Padronizado e Teste de Conexão

* **Page:** Global (Boot da Aplicação)
* **Component:** `FirebaseProvider` (a criar), `ErrorBoundary` (a criar), `App.tsx`
* **Behavior:** 
  - Implementar a função `handleFirestoreError` para capturar falhas de operação no Firebase e lançar erros estruturados em JSON (contendo detalhes da operação e do estado de autenticação).
  - Executar um teste de conexão via `getFromServer` no carregamento inicial dentro do `FirebaseProvider`.
  - Envolver a aplicação em um `ErrorBoundary` para capturar e exibir mensagens amigáveis ao usuário caso o cliente esteja offline ou ocorram erros de permissão.

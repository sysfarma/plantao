# 4. Consistência e Constraints no Firebase API
**Arquivo associado:** Callbacks de mutação de Plantões (`handleSaveShift`).
*   **Componente:** Painel Operacional / Formulários Administrativos e de Farmácia de Plantão.
*   **Behavior (Comportamento Esperado):**
    *   Inspecionar o processo de composição de _payload_ no `handleSaveShift`. Adicionar lógicas no momento da construção do _document_ que incluam imperativamente o `user_id` na estrutura.
    *   Certificar-se de capturar o dado através da malha de credenciais assíncronas do aplicativo (agora refatorada pela issue anterior), validando e forçando a conformidade com as exigências prévias de validação estrita (size match/fields type) configuradas no arquivo `firestore.rules`.

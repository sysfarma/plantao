# 3. Hardening das Regras de Segurança (Firestore Rules)

* **Page:** Backend / Configuração (`firestore.rules`)
* **Component:** N/A
* **Behavior:** 
  - Adicionar limites de tamanho (`.size()`) em todos os campos de texto (ex: `name`, `street`, `neighborhood`) para prevenir ataques de exaustão de recursos (DoS).
  - Refinar as validações de tipo para usar verificações estritas (`is int`, `is timestamp`).
  - Bloquear vulnerabilidades de "Update Bypass", garantindo que documentos válidos não possam ser atualizados para estados inválidos.

# Especificação de Implementações Pendentes
**Data e Hora (Brasília):** 05/05/2026 16:05

Com base no relatório de erros gerado, as seguintes implementações são necessárias para garantir a estabilidade, performance e usabilidade do sistema.

## 1. Otimizações de Backend (Node.js/Express)
- **Implementar Cache no Sitemap:** Mudar a lógica do sitemap para gerar e salvar um arquivo estático ou usar Redis/Cache em memória com expiração de 24h.
- **Refatoração da Consulta de Plantões:**
  - Adicionar filtros de estado/cidade diretamente na query de `shifts` para evitar o limite de 500 documentos globais.
  - Implementar paginação real baseada em cursor para as listagens públicas.
- **Geolocalização Nativa:** Migrar a filtragem de distância de "memória" para consultas baseadas em filtros de latitude/longitude no Firestore (ou Geohashes).
- **Triggers para Estatísticas:** Implementar Cloud Functions ou lógica de backend que atualize os documentos de estatísticas do dashboard no momento de cada pagamento, eliminando a função de "recovery scan".

## 2. Melhorias de Interface (React)
- **Componente ScrollToTop:** Criar um hook ou componente global que resete a posição do scroll para (0,0) em cada mudança de rota.
- **Cartão de Farmácia Unificado:** Atualizar o `PharmacyCard` da Home para suportar exibição de "Badge de Status" (Aberto, 24h, Fechado) baseado nos dados de plantão recebidos.
- **Code Splitting:** Configurar `React.lazy` e `Suspense` para as rotas principais (Admin, Pharmacy Dashboard) para reduzir o tamanho dos chunks.

## 3. Padronização e Traduções
- **Dicionário de Erros:** Criar um arquivo central de constantes para mensagens de erro em Português-BR no `server.ts`.
- **Validação de CEP:** Melhorar a regex de CEP no backend para aceitar formatos com e sem hífen de forma mais flexível.

## 4. Segurança do Banco de Dados
- **Reforço de Firestore Rules:**
  - Restringir a listagem de `pharmacies` para retornar apenas campos sanitizados ou mover dados sensíveis para uma subcoleção `/private`.
  - Auditar todas as coleções em busca do padrão "Master Gate" conforme o blueprint de segurança.

---
*Gerado por AI Coding Agent*

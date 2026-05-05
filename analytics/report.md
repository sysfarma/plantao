# Relatório de Análise do Sistema
**Data e Hora (Brasília):** 05/05/2026 16:04

## Resumo da Análise
O sistema foi analisado em busca de erros de performance, segurança, usabilidade e lógica de negócio. Abaixo estão os problemas identificados.

## 1. Erros de Performance e Escalabilidade (Backend)
- **Sitemap Ineficiente:** A rota `/sitemap.xml` busca TODAS as farmácias ativas do banco de dados sem paginação ou cache. Em um cenário com milhares de farmácias, isso causará timeout e consumo excessivo de memória.
- **Limite Rígido de Plantões:** A rota `/api/public/on-call` possui um `limit(500)` na busca de plantões. Se houver mais de 500 plantões ativos no país, os resultados locais podem ser omitidos dependendo da ordem de inserção.
- **Filtro de Localização em Memória:** As rotas de busca pública realizam filtragem de distância (raio de 20km) em memória após buscar até 2000 documentos. O Firestore suporta `geohashes` ou consultas de proximidade que seriam mais eficientes.
- **Contagem de Pagamentos sem Cache:** A função de recuperação de estatísticas do dashboard percorre todos os pagamentos do ano para recalcular totais. Isso deve ser feito via triggers incrementais.

## 2. Erros de Interface e Usabilidade (Frontend)
- **Scroll Position:** As páginas `Home`, `OnCall` e `Pricing` não garantem o retorno ao topo do scroll ao serem carregadas/navegadas, o que pode prejudicar a experiência do usuário se ele vier de uma página longa.
- **Informações de Plantão em Destaques:** Os "Destaques" na Home não exibem o horário do plantão atual da farmácia, dificultando a decisão rápida do usuário.
- **Tamanho dos Chunks de Build:** O build do Vite reporta arquivos acima de 500kB, indicando necessidade de code-splitting para melhorar o carregamento inicial.

## 3. Erros de Localização (Internationalization)
- **Mensagens de Erro Híbridas:** Algumas rotas do servidor retornam mensagens em Inglês (ex: "Internal Server Error", "Payment failed") enquanto outras estão em Português. É necessária a padronização.

## 4. Segurança (Database)
- **PII Leak em Listagens:** A regra de segurança para a coleção `pharmacies` permite `list: if true`. Embora o backend sanitize os dados, um acesso direto via client SDK poderia listar campos sensíveis se não estiverem devidamente protegidos em subcoleções.

---
*Gerado por AI Coding Agent*

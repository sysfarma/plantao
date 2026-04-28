# Issue 4: Sitemap Dinâmico no Backend

## Descrição
Criar um endpoint que gere um sitemap XML automático contendo todas as páginas de cidades atendidas para acelerar a indexação pelo Google.

## Tarefas
- [ ] No `server.ts`, criar o endpoint `GET /sitemap.xml`.
- [ ] A lógica deve buscar no banco de dados (coleção `pharmacies`) todas as combinações únicas de `city` e `state` (is_active == 1).
- [ ] Gerar o XML seguindo o protocolo standard de sitemaps.
- [ ] Incluir a homepage (`/`) e URLs dinâmicas (`/plantao/:uf/:city`).
- [ ] (Opcional) Adicionar o cabeçalho `Content-Type: application/xml`.

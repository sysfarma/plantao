# Issue 1: Rotas Dinâmicas e SEO Head Dinâmico

## Descrição
Implementar rotas amigáveis para SEO e garantir que cada página de cidade tenha metatags exclusivas (título e descrição).

## Tarefas
- [ ] No `src/App.tsx`, adicionar a rota `/plantao/:uf/:city`.
- [ ] No `src/pages/OnCall.tsx`, usar `useParams` para extrair `uf` e `city`.
- [ ] Se `uf` e `city` estiverem presentes na URL, disparar a busca automaticamente no carregamento da página.
- [ ] Instalar `react-helmet-async`.
- [ ] Criar componente `SEOHandler` para atualizar o `<title>` e `<meta name="description">` dinamicamente conforme a cidade e o mês/ano atual.
- [ ] Sincronizar os filtros de busca com a URL (redirecionar para `/plantao/:uf/:city` após busca manual).

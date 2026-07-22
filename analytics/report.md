# Relatório de Análise Geral de Indexação e SEO nos Motores de Busca

**Data e Hora de Geração:** 22 de Julho de 2026 às 16:45 (Horário Oficial de Brasília - BRT)  
**Projeto:** Farmácias de Plantão (`farmaciasdeplantao.app.br`)  
**Status do Diagnóstico:** Concluído  

---

## 🔍 Resumo Executivo

Este relatório apresenta a análise diagnóstica abrangente sobre os fatores técnicos, estruturais e de configuração que estão impedindo o portal **Farmácias de Plantão** de ser indexado e exibido nos motores de busca (Google, Bing, Yahoo, DuckDuckGo) e assistentes de IA (ChatGPT, Claude, Perplexity).

Identificamos **7 Causas Raiz Principais** que explicam a ausência do site nos resultados de pesquisa, divididas entre aspectos de arquitetura SPA (Single Page Application), meta tags estáticas, rel canonical conflitante, falta de verificação no Google Search Console e estrutura de sitemap/links internos.

---

## 🚨 Causas Raiz Identificadas

### 1. Conflito do Tag Canonical Estático (`<link rel="canonical">`)
* **Problema Encontrado:** No arquivo `index.html`, a meta tag canonical está fixada para a página inicial:
  ```html
  <link rel="canonical" href="https://farmaciasdeplantao.app.br/" />
  ```
* **Impacto no SEO:** Quando o Googlebot e o Bingbot rastreiam qualquer subpágina do site (ex: `/plantao/pr/cascavel`, `/farmacia/drogaria-sao-paulo`, `/sobre`), eles encontram a tag canonical apontando diretamente para a Home (`/`). Isso sinaliza explicitamente para os motores de busca: *"Esta subpágina é uma duplicata da página inicial, desconsidere e não indexe este URL separadamente."*
* **Severidade:** **CRÍTICA (Bloqueador de Indexação de Páginas Internas)**

---

### 2. Renderização no Lado do Cliente (SPA) sem Meta Tags Dinâmicas ou SSR/Prerender
* **Problema Encontrado:** A aplicação é construída como um SPA React no modelo CSR (Client-Side Rendering). O servidor Express entrega o mesmo arquivo `index.html` estático para qualquer rota acessada.
* **Impacto no SEO:**
  * Motores de busca e robôs de indexação rápida recebem inicialmente apenas um documento HTML com `<div id="root"></div>` e o título/meta description genéricos da página inicial.
  * Todas as rotas de cidades (`/plantao/:state/:city`) e páginas de farmácias compartilham o mesmo `<title>` e `<meta name="description">` no HTML inicial antes da execução do JavaScript.
  * O Google pode considerar que o site possui conteúdo duplicado massivo ou páginas vazias no primeiro ciclo de rastreamento (First Wave Indexing).
* **Severidade:** **ALTA**

---

### 3. Falta de Validação e Submissão no Google Search Console & Bing Webmaster Tools
* **Problema Encontrado:** Não há registro da meta tag de validação do Google (`<meta name="google-site-verification" content="..." />`) no `index.html`, nem registros de envio ativo do mapa do site para as ferramentas oficiais de webmasters.
* **Impacto no SEO:**
  * Domínios novos ou em crescimento sem submissão explícita de Sitemap no **Google Search Console (GSC)** dependem exclusivamente de descoberta passiva por links externos (backlinks).
  * Sem a solicitação de indexação via GSC, o Googlebot pode levar semanas ou meses para descobrir e processar novos URLs dinâmicos.
* **Severidade:** **ALTA**

---

### 4. Divergência entre Sitemap Estático (`public/sitemap.xml`) e Dinâmico (`server.ts`)
* **Problema Encontrado:**
  * No arquivo estático `public/sitemap.xml`, constam URLs de exemplo desatualizados com a estrutura `/cidade/sao-paulo-sp`.
  * No servidor backend (`server.ts`), a rota `/sitemap.xml` gera dinamicamente a estrutura correta `/plantao/:state/:city`.
* **Impacto no SEO:** Se robôs ou ferramentas de auditoria lerem o arquivo estático da pasta `public/` em vez da resposta dinâmica do servidor, tentarão rastrear URLs inexistentes ou desatualizados, resultando em erros 404 e perda de orçamento de rastreamento (*Crawl Budget*).
* **Severidade:** **MÉDIA**

---

### 5. Navegação por JavaScript em Vez de Links Nativos HTML (`<a href="...">`)
* **Problema Encontrado:** Em diversos componentes da interface, a navegação entre páginas de farmácias e cidades utiliza manipuladores de eventos em botões/cards (`onClick={() => navigate('/plantao/...')} `) em vez de elementos de link HTML semânticos `<a href="...">`.
* **Impacto no SEO:** O robô do Google segue a teia da web navegando por tags `<a>`. Quando encontra botões com `onClick`, o robô não identifica que há um link a ser seguido para descobrir novas páginas, reduzindo drasticamente a profundidade de rastreamento (*Crawl Depth*).
* **Severidade:** **MÉDIA-ALTA**

---

### 6. Ausência de Dados Estruturados Schema.org Dinâmicos (`Pharmacy` / `LocalBusiness`)
* **Problema Encontrado:** O arquivo `index.html` possui apenas um esquema genérico do tipo `WebSite`. Não há inclusão dinâmica de esquemas JSON-LD do tipo `Pharmacy` ou `LocalBusiness` nas páginas das farmácias.
* **Impacto no SEO:** O Google utiliza o esquema `Pharmacy` para exibir cartões ricos e resultados locais em buscas como *"farmácia de plantão perto de mim"* ou *"drogaria 24 horas em [Cidade]"*. A ausência desses dados impede a inclusão do site no bloco de buscas locais e mapas do Google.
* **Severidade:** **MÉDIA**

---

### 7. Autoridade do Domínio Nova e Ausência de Backlinks
* **Problema Encontrado:** O domínio `farmaciasdeplantao.app.br` é recente e não possui uma rede de links externos apontando para ele (portais de notícias locais, prefeituras, blogs de saúde, redes sociais).
* **Impacto no SEO:** O algoritmo do Google prioriza a indexação de sites que possuem relevância e autoridade comprovadas (*Domain Authority* / *PageRank*).
* **Severidade:** **MÉDIA (Fator de Ranqueamento Externo)**

---

## 📊 Tabela Resumo dos Diagnósticos

| Item | Fator Diagnosticado | Impacto na Indexação | Severidade |
|---|---|---|---|
| 1 | Canonical fixado na Home (`/`) em todas as páginas | Força o Google a ignorar páginas internas como duplicatas | 🔴 Crítica |
| 2 | Renderização CSR sem meta tags dinâmicas por rota | HTML retornado traz apenas título e descrição genéricos | 🟠 Alta |
| 3 | Ausência de validação no Google Search Console | Atraso na descoberta passiva e indexação do domínio | 🟠 Alta |
| 4 | Divergência no padrão de URLs do `sitemap.xml` | Rastreamento de URLs incorretos ou em cache | 🟡 Média |
| 5 | Links de navegação via `onClick` em vez de `<a href>` | Dificuldade do Googlebot para descobrir subpáginas | 🟠 Alta |
| 6 | Ausência de Schema.org `Pharmacy` / `LocalBusiness` | Não exibição em Rich Snippets e buscas locais | 🟡 Média |
| 7 | Domínio recente sem histórico e backlinks | Baixo orçamento de rastreamento inicial do Googlebot | 🟢 Informativo |

---

## 💡 Plano de Ação Recomendado (Para Implementação Futura)

1. **Ajuste de Meta Tags Dinâmicas e Canonical:**
   * Utilizar gerenciador de cabeçalhos HTML para atualizar dinamicamente o `<title>`, `<meta name="description">` e `<link rel="canonical">` de cada cidade e farmácia acessada.

2. **Configuração no Google Search Console:**
   * Reivindicar a propriedade do domínio `farmaciasdeplantao.app.br` no Google Search Console.
   * Adicionar a tag de verificação do Google no `<head>`.
   * Submeter formalmente a URL `https://farmaciasdeplantao.app.br/sitemap.xml`.

3. **Padronização de Links Semânticos:**
   * Substituir o uso de `onClick` por componentes `<Link to="...">` ou `<a href="...">` em todos os cards e listagens de farmácias e cidades.

4. **Injeção de Schema.org Dinâmico:**
   * Incluir blocos JSON-LD de `Pharmacy` / `LocalBusiness` com nome, endereço, telefone, coordenadas geográficas e horários de funcionamento.

5. **Consistência do Sitemap e Robots.txt:**
   * Remover o arquivo estático `public/sitemap.xml` ou sincronizá-lo completamente com o gerador dinâmico do `server.ts`.

---

*Relatório gerado automaticamente para análise e diagnóstico de visibilidade web.*

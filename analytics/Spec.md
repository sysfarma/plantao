# Spec: SEO Local e Autoridade

Este documento descreve as implementações técnicas necessárias para atender aos requisitos de SEO Local e Autoridade detalhados no `analytics/report.md`.

## 1. Novas Rotas e Páginas (Pages)

### Rota Dinâmica por Localidade
*   **Arquivo:** `/src/App.tsx`
*   **Implementação:** Adicionar suporte para `/plantao/:uf/:city`.
*   **Comportamento:** A página deve carregar os dados de plantão automaticamente baseada nos parâmetros da URL, sem depender exclusivamente de seleção manual no formulário.

### Refatoração de OnCall.tsx
*   **Arquivo:** `/src/pages/OnCall.tsx`
*   **Implementação:** 
    *   Detectar parâmetros `uf` e `city` da URL (via `useParams`).
    *   Se presentes, disparar a busca automaticamente para carregar as farmácias daquela cidade.
    *   Sincronizar o estado dos filtros com a URL (Redirecionar de `?city=...&state=...` para `/plantao/uf/cidade`).

## 2. Componentes (Components)

### SEOHandler (Novo Componente)
*   **Objetivo:** Gerenciar tags `<title>` e `<meta>` dinamicamente.
*   **Implementação:** Usar `react-helmet-async`.
*   **Lógica:**
    *   Default: "Plantões de Hoje | Farmácias de Plantão"
    *   Cidade selecionada: "Plantão de farmácia em [Cidade] [UF] hoje - [Mês] [Ano]"
    *   Description: "Confira a escala de plantão das farmácias de [Cidade] [UF] atualizada para hoje. Veja endereços, telefones e localização."

### PharmacySchema (Novo Componente)
*   **Objetivo:** Injetar JSON-LD nos cards de farmácia.
*   **Implementação:** Gerar um script `application/ld+json` do tipo `Pharmacy`.
*   **Campos obrigatórios:** `name`, `address`, `telephone`, `geo` (lat/lng), `openingHours` (se disponível).

### FreshnessBanner (Novo Componente)
*   **Objetivo:** Exibir a data de atualização.
*   **Localização:** Topo da lista de resultados na `OnCall.tsx`.
*   **Implementação:** "Última atualização: [Data Atual] às [Hora Atual]". A data deve ser gerada no momento da requisição bem-sucedida à API.

## 3. Comportamentos e Backend (Behavior)

### Sitemap Dinâmico
*   **Arquivo:** `/server.ts`
*   **Implementação:** Novo endpoint `GET /sitemap.xml`.
*   **Lógica:**
    1.  Buscar todas as combinações únicas de `city` e `state` na coleção `pharmacies`.
    2.  Gerar um XML compatível com Sitemaps contendo as URLs `/plantao/:uf/:city`.
    3.  Incluir a página inicial e páginas estáticas (Privacidade, Contato).

### Otimização de Assets
*   **Comportamento:** Implementar `loading="lazy"` em todas as imagens de logotipo de farmácia.
*   **Behavior:** Garantir que o `alt` das imagens contenha o nome da farmácia para acessibilidade e SEO.

### Redirecionamento Canônico
*   **Behavior:** Caso o usuário acesse `/plantao` via busca convencional, atualizar a URL no navegador para a versão limpa `/plantao/es/castelo` assim que os resultados forem filtrados, incentivando o compartilhamento de URLs amigáveis.

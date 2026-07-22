# Especificação Técnica de Correções para Indexação e SEO (Spec.md)

**Data e Hora de Geração:** 22 de Julho de 2026 às 16:48 (Horário Oficial de Brasília - BRT)  
**Projeto:** Farmácias de Plantão (`farmaciasdeplantao.app.br`)  
**Baseado em:** `analytics/report.md`  

---

## 📋 Visão Geral

Esta especificação define os requisitos funcionais e técnicos necessários exclusivamente para corrigir os problemas de indexação, rastreabilidade e SEO identificados no portal **Farmácias de Plantão**.

---

## 🎯 Escopo de Correções (O Que Falta Corrigir)

### 1. Correção do Tag Canonical e Gerenciamento Dinâmico de SEO Head
* **Componente / Página:** `index.html`, `src/components/SEOHead.tsx` (ou similar) e rotas principais (`Home`, `OnCall`, `PharmacyDetail`, `CityOnCall`).
* **Comportamento Esperado:**
  * Remover o `<link rel="canonical" href="https://farmaciasdeplantao.app.br/" />` fixo do `index.html`.
  * Implementar atualização dinâmica do `<title>`, `<meta name="description">`, `<meta property="og:*">` e `<link rel="canonical">` para refletir exatamente a URL e o contexto da página carregada.
  * Por exemplo: na página de plantão de Cascavel/PR (`/plantao/pr/cascavel`), o canonical deve ser `https://farmaciasdeplantao.app.br/plantao/pr/cascavel` e o título deve ser *"Farmácias de Plantão em Cascavel - PR | Plantão 24h"*.

---

### 2. Links Semânticos HTML para Descoberta de Páginas pelo Googlebot
* **Componente / Página:** `src/components/PharmacyCard.tsx`, `src/pages/Home.tsx`, `src/pages/OnCall.tsx`, componentes de busca e listagem de cidades.
* **Comportamento Esperado:**
  * Substituir manipuladores `onClick={() => navigate(...)` em elementos genéricos (`<div>`, `<button>`) por tags semânticas `<a href="...">` ou componentes `<Link to="...">` do `react-router-dom`.
  * Garantir que todas as farmácias e cidades listadas contenham elementos `<a>` rastreáveis com atributos `href` válidos para o Googlebot seguir a teia de links.

---

### 3. Injeção de Dados Estruturados Schema.org Dinâmicos
* **Componente / Página:** `src/components/PharmacySchema.tsx`, páginas de detalhes de farmácia e páginas de plantão por cidade.
* **Comportamento Esperado:**
  * Gerar blocos JSON-LD no formato `Pharmacy` e `LocalBusiness` contendo:
    * Nome da farmácia, endereço completo (`streetAddress`, `addressLocality`, `addressRegion`, `postalCode`), telefone, WhatsApp, coordenadas geográficas (`geo`: `latitude`, `longitude`) e horários de funcionamento.
  * Adicionar dados estruturados do tipo `BreadcrumbList` nas subpáginas para destacar a hierarquia (`Home > Plantão > Paraná > Cascavel`).

---

### 4. Sincronização do Sitemap Dinâmico e Limpeza do Sitemap Estático
* **Componente / Página:** `server.ts`, `public/sitemap.xml`.
* **Comportamento Esperado:**
  * Garantir que a rota `/sitemap.xml` servida pelo Express seja a única fonte da verdade, contendo todas as rotas ativas (`/`, `/plantao`, `/plantao/:state/:city`, `/farmacia/:slug`).
  * Atualizar o arquivo estático `public/sitemap.xml` para que reflita a mesma estrutura do sitemap dinâmico ou redirecione para a rota dinâmica do servidor.

---

### 5. Campo para Meta Tag de Verificação do Google Search Console (GSC)
* **Componente / Página:** `index.html`, `server.ts` / painel de configuração.
* **Comportamento Esperado:**
  * Permitir a inserção da meta tag de validação do Google Search Console (`<meta name="google-site-verification" content="..." />`) no `<head>` do `index.html`.

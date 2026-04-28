# Relatório de SEO Local e Autoridade - Farmácias de Plantão

Este relatório detalha as melhorias necessárias no sistema para otimizar o posicionamento nos mecanismos de busca (SEO), focando em relevância local e autoridade técnica.

## 1. Conteúdo Localizado e Específico

### Páginas Dedicadas por Cidade
*   **Estado Atual:** O sistema utiliza busca baseada em estados globais e parâmetros de consulta (`?city=...`). Isso impede o Google de indexar páginas individuais para cada localidade.
*   **Ajuste Necessário:** Implementar rotas dinâmicas como `/plantao/:uf/:cidade` (ex: `/plantao/es/castelo`).
*   **Benefício:** Cada cidade passa a ter uma URL única, indexável e com autoridade própria.

### Palavras-chave e Títulos Dinâmicos
*   **Estado Atual:** Títulos de página são estáticos ("Plantões de Hoje").
*   **Ajuste Necessário:** O título da página (`<title>`) e o cabeçalho principal (`<h1>`) devem ser dinâmicos com base na cidade selecionada.
    *   Exemplo: `<h1>Plantão de farmácia em Castelo ES hoje</h1>`.
    *   Exemplo de texto: `Escala de farmácias Castelo - Abril 2026`.

### Dados Estruturados (Schema Markup)
*   **Estado Atual:** Existe apenas uma marcação básica de `WebSite` no `index.html`.
*   **Ajuste Necessário:** Injetar JSON-LD de `Pharmacy` ou `MedicalOrganization` nos cartões de farmácia, incluindo:
    *   Nome da empresa.
    *   Endereço completo (Street, City, UF).
    *   Telefone e WhatsApp.
    *   Horário de funcionamento (is24h).
    *   Geolocalização (Lat/Lng).

## 2. Atualização e Recorrência (Frescor do Conteúdo)

### Indicação Visual de Atualização
*   **Estado Atual:** O site menciona "Plantões de Hoje", mas não exibe a data e hora exata da última sincronização.
*   **Ajuste Necessário:** Adicionar uma frase explícita: "Atualizado em: [Data de Hoje] às [Hora]". Isso comunica frescor tanto ao usuário quanto ao algoritmo do Google.

### Sitemap Dinâmico
*   **Estado Atual:** Não há um sitemap gerado dinamicamente para as cidades cadastradas.
*   **Ajuste Necessário:** Criar um endpoint `/sitemap.xml` que liste todas as combinações de cidades/estados presentes no banco de dados, enviando-o periodicamente ao Google Search Console.

## 3. Velocidade e Experiência Mobile

### Performance
*   **Estado Atual:** O site utiliza React/Vite, que é naturalmente rápido, mas depende totalmente do carregamento via cliente (CSR).
*   **Ajuste Necessário:** Considerar o uso de Pre-rendering (SSG) para as principais cidades ou garantir que os Meta Tags sejam injetados via servidor para que o Google veja o conteúdo sem precisar executar o JavaScript pesado (embora o Googlebot faça isso, o processamento direto é mais rápido).
*   **Otimização de Imagens:** Garantir que logos de farmácias sejam servidos em formatos modernos (WebP) e com lazy-loading.

## 4. Próximos Passos Recomendados (Resumo)

1.  **Refatoração de Rotas:** Migrar de uma Single Page App de busca para uma estrutura de rotas dinâmicas por localidade.
2.  **Injeção de Schema:** Adicionar marcação `LocalBusiness` em todos os resultados de busca.
3.  **SEO On-Page Dinâmico:** Atualizar `Document Title` e `Meta Description` dinamicamente conforme a cidade.
4.  **Sitemap:** Automatizar a listagem de páginas de cidades para indexação massiva.

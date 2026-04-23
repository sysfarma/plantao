# Estratégia de SEO - Farmácias de Plantão

Abaixo está o mapeamento técnico completo para indexar "farmaciasdeplantao.app.br" no topo do Google.

## 1. SEO Técnico & Estrutura

### Meta Title & Description
**Homepage:**
- **Title (máx. 60 char):** Farmácia de Plantão: Encontre Farmácias Abertas Agora
- **Description (máx. 155 char):** Precisa de remédios urgentes? Descubra a farmácia de plantão aberta agora na sua cidade. Veja telefones, localização e rotas de drogarias 24h.

### Estrutura de Heading (Exemplo da Homepage)
- **H1:** Encontre a Farmácia de Plantão Mais Próxima Aberta Agora
- **H2:** Como funciona o mapa de farmácias de plantão?
- **H2:** Quais farmácias estão abertas hoje em [Nome da Cidade]? *(Dinâmico)*
- **H3:** Farmácias 24 horas e Delivery de Medicamentos
- **H3:** Dúvidas Frequentes

### URLs Amigáveis (Clean URLs)
- **CERTO:** `https://farmaciasdeplantao.app.br/cidade/sao-paulo-sp`
- **ERRADO:** `https://farmaciasdeplantao.app.br/busca?id=123&state=sp`
> *Nota: É imperativo usar Server-Side Rendering (SSR) ou Prerendering (Next.js/Remix ou Vite SSR) nestas rotas, pois o Googlebot tem dificuldades em renderizar SPAs puras montadas com JS pesado.*

## 2. Palavras-Chave (Keyword Landscape)

**Primárias (Fundo de funil - Alta Intenção/Urgência):**
- farmácia de plantão
- farmácia aberta agora
- farmácia 24 horas
- qual farmácia está de plantão hoje

**Secundárias (SEO Local - Muito importantes!):**
- farmácia de plantão em [Cidade] (Ex: farmácia de plantão em Campinas)
- droga raia aberta agora [Cidade]
- farmácia com delivery 24h em [Bairro]
- telefone farmácia plantão [Cidade]

## 3. Marcação de Dados Estruturados (JSON-LD Schema.org)

Para sinalizar perfeitamente ao Google Places/Rich Snippets sobre o que se baseia a página das farmácias específicas. É ideal injetar dinamicamente na página local de uma Farmácia.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "MedicalBusiness",
  "name": "Drogaria São Paulo - Unidade Centro",
  "image": "https://farmaciasdeplantao.app.br/images/facade-1.jpg",
  "@id": "https://farmaciasdeplantao.app.br/farmacia/drogaria-sao-paulo-centro",
  "url": "https://farmaciasdeplantao.app.br/farmacia/drogaria-sao-paulo-centro",
  "telephone": "+5511999999999",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Rua das Flores, 123",
    "addressLocality": "São Paulo",
    "addressRegion": "SP",
    "postalCode": "01000-000",
    "addressCountry": "BR"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": -23.5505199,
    "longitude": -46.6333094
  },
  "openingHoursSpecification": {
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": [
      "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
    ],
    "opens": "00:00",
    "closes": "23:59"
  },
  "medicalSpecialty": "Pharmacy"
}
</script>
```

**FAQPage Schema (Para a Home page):**
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [{
    "@type": "Question",
    "name": "Como descobrir qual farmácia está de plantão hoje?",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "Através do site Farmácias de Plantão, sua localização é detectada via GPS para listar instantaneamente todas as drogarias 24h ou em regime de plantão no dia de hoje em sua cidade."
    }
  }]
}
</script>
```

## 4. Conteúdo Otimizado para a Homepage (~500 palavras)

*(Incluir este texto preferencialmente abaixo do Fold (abaixo do campo principal de busca/mapa) para alimentar o robô do Google sem atrapalhar a UI do usuário buscar a farmácia).*

**<H1> Encontre a Farmácia de Plantão Mais Próxima (Aberta Agora) </H1>**

Ficar doente ou precisar de remédios de madrugada é um imprevisto que acontece com qualquer pessoa. Saber qual **farmácia está de plantão hoje** em sua cidade evita que você rode pelas ruas em busca de atendimento durante a madrugada, feriados ou finais de semana. 

O aplicativo **Farmácias de Plantão** foi criado justamente para resolver esse problema com um clique. Nós reunimos os calendários oficiais dos conselhos regionais e das secretarias municipais de saúde, cruzamos os dados em tempo real e mostramos para você exatamente qual drogaria ou farmácia está **aberta agora** perto de você.

**<H2> Como funciona o nosso buscador de plantões? </H2>**

Nossa plataforma inteligente consegue identificar a "farmácia aberta perto de mim" através dos sensores de geolocalização do seu celular ou do IP do seu computador. Quando você busca pela sua cidade, nosso sistema traz resultados com:

- **Endereço Completo:** Rota com integração direta com Google Maps e Waze.
- **Informações de Contato:** O telefone ou WhatsApp da drogaria, ideal para se você precisa tirar dúvidas com o farmacêutico.
- **Delivery de Medicamentos:** Indicações de se a drogaria possui frota de entrega na madrugada.

As prefeituras costumam fazer um rodízio obrigatório (o chamado Regime de Plantão) para que bairros nunca fiquem desassistidos. Contudo, essa lista é muitas vezes um PDF escondido em sites governamentais. Nós mastigamos esses dados para você visualizar na tela.

**<H2> Farmácia 24 Horas vs. Farmácia de Plantão: Qual a diferença? </H2>**

Embora muitos usem os termos no mesmo sentido, a **farmácia 24 horas** é uma bandeira (como grandes redes, Drogasil, Pague Menos) que optou, por viabilidade comercial, manter suas grandes unidades rodando dia e noite ininterruptamente. 

Já a **farmácia de plantão** é normalmente uma drogaria tradicional, muitas vezes de bairro, que em um dia normal fecharia às 19h, mas que está escalada por uma lei municipal para virar a madrugada aberta por obrigação daquele dia do mês civil. Nosso site consolida exatamente as duas modalidades para sua segurança e conforto. 

Em uma urgência médica onde se receitou antibióticos ou analgésicos às pressas, utilize nossa busca de plantonistas. Mantenha nosso site adicionado à sua tela inicial (somos um PWA) e não seja pego desprevenido nas madrugadas!

## 5. Performance (Core Web Vitals) & UX

Para rankear no Brasil (onde a internet 4G/3G oscila):
1. **LCP (Largest Contentful Paint) < 2.5s:** O mapa e os botões devem ser renderizados velozmente. Evite injetar bibliotecas JavaScript gigantes antes do DOM principal caregar. Adie a execução de widgets de chat.
2. **CLS (Cumulative Layout Shift) < 0.1:** Ao carregar as farmácias da cidade na tela, não empurre o header para baixo abruptamente. Utilize *Skeleton Loaders* (blocos cinzas piscando com tamanho fixo) enquanto a API busca o Firebase.
3. **Imagens WebP:** Os logos ou fachadas das farmácias devem ser guardados rigorosamente em formato `.webp` na nuvem pública.

## 6. Estratégia Prática de SEO Local

- **Gerar URLs por Cidade:** O seu sucesso recai em criar centenas de URLs indexáveis pelo robô mapeadas como rotas. O React Router (se for SPA) não é visível. Você deve usar sitemaps e links reais. Exemplo: Tenha uma listagem no rodapé `[AC] [AL]  ... [SP]`. Quando a pessoa clica em SP, vai para `domain.com.br/estado/sp` (com tag `<a>` real).
- Lojistas que se cadastrarem devem ser incentivados no painel deles a atualizar seu link do **Google Meu Negócio (My Business)** cruzado com seu aplicativo.

## 7. Checklist Final de Implementação 🚀

- [x] Atualizar tag `<title>` meta `description` no `index.html` (Já implementado!).
- [x] Inserir `robots.txt` orientando bots de busca e bloqueando apis (Já implementado!).
- [x] Inserir `sitemap.xml` para submissão imediata no Google Search Console (Já implementado Base).
- [x] Adicionar o script estático JSON-LD (`WebSite` mode) no `<head>` (Já implementado!).
- [x] Adicionar OpenGraph (OG:) e Twitter Cards pro WhatsApp exibir previews bonitos.
- [ ] Pegar o conteúdo "4. Conteúdo Otimizado" e alocar em um `<article>` amigável (talvez na tela inicial se o mapa estiver vazio ou numa página "Sobre Nós" linkada no rodapé).
- [ ] Mudar ou garantir que o servidor crie rotas de SSR (Node.js/Express `req.params.cidade`) enviando HTMLs puros se um robô do Google as tentar ler. Se não for habilitar SSR, use um serviço de Prerender (ex: *prerender.io*).
- [ ] Abrir conta no [Google Search Console] e enviar o seu `sitemap.xml` da pasta `/public/`.

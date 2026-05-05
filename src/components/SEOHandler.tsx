import React from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOHandlerProps {
  city?: string;
  uf?: string;
  title?: string;
  description?: string;
}

const SEOHandler: React.FC<SEOHandlerProps> = ({ city, uf, title: customTitle, description: customDescription }) => {
  const now = new Date();
  const monthNames = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
  ];
  const currentMonth = monthNames[now.getMonth()];
  const currentYear = now.getFullYear();

  const title = customTitle || (city && uf
    ? `Plantão de farmácia em ${city} ${uf.toUpperCase()} hoje - ${currentMonth} ${currentYear}`
    : 'Plantões de Hoje | Farmácias de Plantão');

  const description = customDescription || (city && uf
    ? `Confira a escala de plantão das farmácias de ${city} (${uf.toUpperCase()}) atualizada para hoje. Veja endereços, telefones e localização das farmácias abertas agora.`
    : 'Encontre farmácias de plantão hoje na sua região. Escalas atualizadas de farmácias 24 horas e plantonistas em todo o Brasil.');

  const canonicalUrl = city && uf
    ? `https://farmaciasdeplantao.app.br/plantao/${uf.toLowerCase()}/${city.toLowerCase().replace(/\s+/g, '-')}`
    : 'https://farmaciasdeplantao.app.br/plantao';

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />
      
      {/* Open Graph */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={canonicalUrl} />
      
      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
    </Helmet>
  );
};

export default SEOHandler;

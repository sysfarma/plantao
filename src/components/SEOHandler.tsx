import React from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOHandlerProps {
  city?: string;
  uf?: string;
  title?: string;
  description?: string;
  canonicalUrl?: string;
  children?: React.ReactNode;
}

const SEOHandler: React.FC<SEOHandlerProps> = ({ 
  city, 
  uf, 
  title: customTitle, 
  description: customDescription,
  canonicalUrl: customCanonical,
  children
}) => {
  const now = new Date();
  const monthNames = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
  ];
  const currentMonth = monthNames[now.getMonth()];
  const currentYear = now.getFullYear();

  const title = customTitle || (city && uf
    ? `Farmácia de Plantão em ${city} - ${uf.toUpperCase()} Hoje - ${currentMonth} ${currentYear}`
    : 'Farmácias de Plantão: Encontre Farmácias Abertas Agora');

  const description = customDescription || (city && uf
    ? `Confira a escala de plantão das farmácias de ${city} (${uf.toUpperCase()}) atualizada para hoje. Veja endereços, telefones e localização das farmácias abertas agora.`
    : 'Encontre farmácias de plantão hoje na sua região. Escalas atualizadas de farmácias 24 horas e plantonistas em todo o Brasil.');

  const canonicalUrl = customCanonical || (city && uf
    ? `https://farmaciasdeplantao.app.br/plantao/${uf.toLowerCase()}/${city.toLowerCase().trim().replace(/\s+/g, '-')}`
    : typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : 'https://farmaciasdeplantao.app.br/');

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
      <meta property="og:image" content="https://farmaciasdeplantao.app.br/images/FARMACIAS-DE-PLANTAO.png" />
      
      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content="https://farmaciasdeplantao.app.br/images/FARMACIAS-DE-PLANTAO.png" />
      {children}
    </Helmet>
  );
};

export default SEOHandler;

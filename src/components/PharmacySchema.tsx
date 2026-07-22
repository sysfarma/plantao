import React from 'react';

interface PharmacySchemaProps {
  pharmacy: {
    id?: string;
    slug?: string;
    name: string;
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    phone: string;
    whatsapp?: string;
    lat?: number;
    lng?: number;
  };
}

const PharmacySchema: React.FC<PharmacySchemaProps> = ({ pharmacy }) => {
  const pharmacyUrl = `https://farmaciasdeplantao.app.br/farmacia/${pharmacy.slug || pharmacy.id}`;
  const cityUrl = `https://farmaciasdeplantao.app.br/plantao/${pharmacy.state.toLowerCase()}/${pharmacy.city.toLowerCase().trim().replace(/\s+/g, '-')}`;

  const schemaGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Pharmacy',
        '@id': `${pharmacyUrl}#pharmacy`,
        name: pharmacy.name,
        url: pharmacyUrl,
        telephone: pharmacy.phone,
        address: {
          '@type': 'PostalAddress',
          streetAddress: `${pharmacy.street}, ${pharmacy.number}`,
          addressLocality: pharmacy.city,
          addressRegion: pharmacy.state,
          addressCountry: 'BR',
        },
        ...(pharmacy.lat && pharmacy.lng ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: pharmacy.lat,
            longitude: pharmacy.lng,
          }
        } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${pharmacyUrl}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Início',
            item: 'https://farmaciasdeplantao.app.br/'
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: `Plantão ${pharmacy.city} - ${pharmacy.state.toUpperCase()}`,
            item: cityUrl
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: pharmacy.name,
            item: pharmacyUrl
          }
        ]
      }
    ]
  };

  return (
    <script type="application/ld+json">
      {JSON.stringify(schemaGraph)}
    </script>
  );
};

export default PharmacySchema;

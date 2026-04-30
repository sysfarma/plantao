import React from 'react';

interface PharmacySchemaProps {
  pharmacy: {
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
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Pharmacy',
    name: pharmacy.name,
    address: {
      '@type': 'PostalAddress',
      streetAddress: `${pharmacy.street}, ${pharmacy.number}`,
      addressLocality: pharmacy.city,
      addressRegion: pharmacy.state,
      addressCountry: 'BR',
    },
    telephone: pharmacy.phone,
    ...(pharmacy.lat && pharmacy.lng ? {
      geo: {
        '@type': 'GeoCoordinates',
        latitude: pharmacy.lat,
        longitude: pharmacy.lng,
      }
    } : {}),
    url: window.location.href, // Canonical link or current page
  };

  return (
    <script type="application/ld+json">
      {JSON.stringify(schema)}
    </script>
  );
};

export default PharmacySchema;

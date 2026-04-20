/**
 * Nominatim Geocoding Utility
 * 
 * This utility centralizes calls to the OpenStreetMap Nominatim API,
 * ensuring compliance with its Usage Policy (custom User-Agent)
 * and providing robust error handling.
 */

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'FarmaciasDePlantaoBrasil/1.0';

interface GeocodeResult {
  lat: number;
  lng: number;
  display_name?: string;
}

interface ReverseGeocodeResult {
  address: {
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    state?: string;
    state_code?: string;
    country?: string;
    [key: string]: any;
  };
}

/**
 * Searches for coordinates given an address
 */
export async function geocodeAddress(street: string, city: string, state: string): Promise<GeocodeResult | null> {
  const query = encodeURIComponent(`${street}, ${city}, ${state}, Brazil`);
  const url = `${NOMINATIM_BASE_URL}/search?format=json&q=${query}&limit=1`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'pt-BR'
      }
    });

    if (!response.ok) {
      console.warn(`Nominatim Search API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.warn('Nominatim returned non-JSON response:', text);
      return null;
    }

    const data = await response.json();
    
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        display_name: data[0].display_name
      };
    }
  } catch (error) {
    console.error('Error during Nominatim geocoding:', error);
  }

  return null;
}

/**
 * Gets address information given coordinates
 */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  const url = `${NOMINATIM_BASE_URL}/reverse?format=json&lat=${lat}&lon=${lng}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'pt-BR'
      }
    });

    if (!response.ok) {
      console.warn(`Nominatim Reverse API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.warn('Nominatim returned non-JSON response:', text);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error during Nominatim reverse geocoding:', error);
  }

  return null;
}

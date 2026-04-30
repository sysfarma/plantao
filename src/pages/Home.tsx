import React, { useState, useEffect, Fragment } from 'react';
import { Search, MapPin, Phone, MessageCircle, Star, Clock } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { safeJsonFetch } from '../lib/api';
import { clearCachedLocation } from '../lib/userCache';
import { geocodeAddress } from '../lib/geocoding';
import { useLocation } from '../hooks/useLocation';
import { getDistance, formatName } from '../lib/utils';
import SEOHandler from '../components/SEOHandler';
import PharmacySchema from '../components/PharmacySchema';
import { PharmacyCardSkeleton } from '../components/PharmacyCardSkeleton';
import { Alert } from '../components/ui/Alert';

interface Pharmacy {
  id: string;
  user_id?: string;
  name: string;
  phone: string;
  whatsapp: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  lat?: number;
  lng?: number;
}

interface Highlight extends Pharmacy {
  type: 'day' | 'week' | 'month';
  date_start?: string;
  date_end?: string;
}

export default function Home() {
  const navigate = useNavigate();
  const { 
    status: locationStatus, 
    location, 
    coords: userCoords, 
    detectLocation, 
    setLocation, 
    setCoords: setUserCoords, 
    setStatus: setLocationStatus 
  } = useLocation();

  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [cep, setCep] = useState('');
  const [name, setName] = useState('');
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Sync internal state with hook location
  useEffect(() => {
    if (location) {
      setCity(location.city);
      setState(location.state);
      setCep(location.cep || '');
    }
  }, [location]);

  useEffect(() => {
    detectLocation();
  }, [detectLocation]);

  useEffect(() => {
    if (locationStatus === 'detected' && location && !hasSearched) {
      setHasSearched(true);
      fetchPharmacies(location.city, location.state, name, userCoords ? { lat: userCoords.lat, lng: userCoords.lng } : undefined, location.cep);
    } else if (locationStatus === 'failed' && !hasSearched) {
      setHasSearched(true);
      fetchPharmacies('', '', '');
    }
  }, [locationStatus, location, hasSearched, userCoords]);

  const fetchPharmacies = async (searchCity: string, searchState: string, searchName: string, coords?: {lat: number, lng: number}, searchCep?: string, p: number = 1) => {
    if (p === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);

    try {
      const queryParams: any = {
        page: p,
        limit: 12
      };
      if (searchCity) queryParams.city = searchCity;
      if (searchState) queryParams.state = searchState;
      if (searchName) queryParams.name = searchName;
      if (searchCep) queryParams.cep = searchCep;
      if (coords) {
        queryParams.lat = coords.lat;
        queryParams.lng = coords.lng;
      }

      const [pharmRes, highData] = await Promise.all([
        safeJsonFetch<{ data: Pharmacy[], pagination: { total: number, page: number, pages: number } }>('/api/public/pharmacies', { query: queryParams }),
        p === 1 ? safeJsonFetch<Highlight[]>('/api/public/highlights', { query: queryParams }) : Promise.resolve([])
      ]);

      let finalPharmData = pharmRes?.data || [];
      
      // If we have coords and results, the server already filtered/sorted, 
      // but we add distance property for UI if missing
      if (coords) {
        finalPharmData = finalPharmData.map((p: any) => {
          if (p.lat && p.lng && !p.distance) {
            const dist = getDistance(coords.lat, coords.lng, Number(p.lat), Number(p.lng));
            return { ...p, distance: dist };
          }
          return p;
        });
      }
      
      if (p === 1) {
        setHighlights(highData || []);
        setPharmacies(finalPharmData);
      } else {
        setPharmacies(prev => [...prev, ...finalPharmData]);
      }

      setHasMore((pharmRes?.pagination?.pages || 0) > p);
      setPage(p);
    } catch (error) {
      console.error('Error fetching data', error);
      setError('Ocorreu um erro ao buscar as farmácias. Por favor, tente novamente.');
      if (p === 1) {
        setHighlights([]);
        setPharmacies([]);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    fetchPharmacies(city, state, name, userCoords ? { lat: userCoords.lat, lng: userCoords.lng } : undefined, cep, page + 1);
  };

  const handleCepSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    setLoading(true);
    setLocationStatus('detecting');
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (!data.erro) {
        const detectedCity = data.localidade;
        const detectedState = data.uf;
        setCity(detectedCity);
        setState(detectedState);
        setHasSearched(true);
        
        // Geocode CEP to get coords
        const geoData = await geocodeAddress(data.logradouro, detectedCity, detectedState);
        
        if (geoData) {
          const newCoords = { lat: geoData.lat, lng: geoData.lng };
          setUserCoords(newCoords);
          setLocationStatus('detected');
          setLocation({ city: detectedCity, state: detectedState, cep: cleanCep, lat: newCoords.lat, lng: newCoords.lng, type: 'manual' });
          fetchPharmacies(detectedCity, detectedState, name, newCoords, cleanCep);
        } else {
          setUserCoords(null);
          setLocationStatus('idle');
          setLocation({ city: detectedCity, state: detectedState, cep: cleanCep, type: 'manual' });
          fetchPharmacies(detectedCity, detectedState, name, undefined, cleanCep);
        }
      }
    } catch (err) {
      console.error('Error searching CEP', err);
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (city && state && !name) {
      const citySlug = city.toLowerCase().trim().replace(/\s+/g, '-');
      navigate(`/plantao/${state.toLowerCase()}/${citySlug}`);
    } else {
      setHasSearched(true);
      setUserCoords(null);
      setLocationStatus('idle');
      setLocation({ city, state, cep: '', type: 'manual' });
      fetchPharmacies(city, state, name, undefined, '');
    }
  };

  const handleTrackClick = async (id: string, type: 'whatsapp' | 'map') => {
    try {
      await safeJsonFetch(`/api/public/pharmacies/${id}/click`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type })
      });
    } catch (err) {
      console.error('Error tracking click', err);
    }
  };

  const dayHighlights = highlights.filter(h => h.type === 'day');
  const weekHighlights = highlights.filter(h => h.type === 'week');
  const monthHighlights = highlights.filter(h => h.type === 'month');

  const showResultsFirst = hasSearched && pharmacies.length > 0;

  const highlightsSection = (
    <div className="space-y-12">
      {dayHighlights.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4 border-b pb-2 flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
            Destaques do Dia
          </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {dayHighlights.map(pharmacy => (
          <PharmacyCard key={pharmacy.id} pharmacy={pharmacy} onTrackClick={handleTrackClick} />
        ))}
      </div>
        </section>
      )}

      {weekHighlights.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4 border-b pb-2 flex items-center gap-2">
            <Star className="w-5 h-5 text-emerald-500 fill-emerald-500" />
            Destaques da Semana
          </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {weekHighlights.map(pharmacy => (
          <PharmacyCard key={pharmacy.id} pharmacy={pharmacy} onTrackClick={handleTrackClick} />
        ))}
      </div>
        </section>
      )}

      {monthHighlights.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4 border-b pb-2 flex items-center gap-2">
            <Star className="w-5 h-5 text-blue-500 fill-blue-500" />
            Destaques do Mês
          </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {monthHighlights.map(pharmacy => (
          <PharmacyCard key={pharmacy.id} pharmacy={pharmacy} onTrackClick={handleTrackClick} />
        ))}
      </div>
        </section>
      )}
    </div>
  );

  const resultsSection = (
    <section id="results-section">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <h2 className="text-2xl font-bold text-gray-900 border-l-4 border-emerald-500 pl-4">
          {hasSearched ? 'Resultado da Pesquisa' : 'Todas as Farmácias'}
        </h2>

        {locationStatus === 'detecting' && (
          <span className="text-sm text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full flex items-center gap-2 animate-pulse">
            <MapPin className="w-3 h-3" />
            Detectando sua localização...
          </span>
        )}
        
        {cep && (
          <span className="text-sm text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full flex items-center gap-2 border border-emerald-100">
            <MapPin className="w-3 h-3" />
            Restringindo à região do CEP: {cep.substring(0, 5)}
          </span>
        )}
        
        {!cep && userCoords && locationStatus === 'detected' && (
          <span className="text-sm text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full flex items-center gap-2 border border-emerald-100">
            <MapPin className="w-3 h-3" />
            Mostrando resultados num raio de 20km
          </span>
        )}

        {locationStatus === 'failed' && (
          <span className="text-sm text-amber-700 bg-amber-50 px-3 py-1 rounded-full flex items-center gap-2 border border-amber-100">
            <MapPin className="w-3 h-3" />
            Localização não detectada. Mostrando por cidade.
          </span>
        )}
      </div>

      {error && (
        <div className="mb-6">
          <Alert 
            message={error} 
            onClose={() => setError(null)} 
          />
        </div>
      )}

      {loading || locationStatus === 'detecting' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <PharmacyCardSkeleton key={i} />
          ))}
        </div>
      ) : pharmacies.length > 0 ? (
        <Fragment>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pharmacies.map(pharmacy => (
              <PharmacyCard key={pharmacy.id} pharmacy={pharmacy} onTrackClick={handleTrackClick} />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center mt-12">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="bg-white text-emerald-700 border-2 border-emerald-600 px-10 py-4 rounded-full font-bold hover:bg-emerald-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 shadow-md hover:shadow-lg"
              >
                {loadingMore && <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>}
                {loadingMore ? 'Carregando...' : 'Carregar Mais Farmácias'}
              </button>
            </div>
          )}
        </Fragment>
      ) : (
        <div className="text-center py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 text-gray-500">
          <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma farmácia encontrada</h3>
          <p className="max-w-xs mx-auto text-sm mb-6">
            Não encontramos farmácias abertas agora para esta busca.
          </p>
          <button 
            onClick={() => {
              setCity('');
              setState('');
              setCep('');
              setName('');
              setHasSearched(false);
              clearCachedLocation();
              // Trigger reload init basically
              window.location.reload();
            }}
            className="text-emerald-600 font-bold text-sm hover:underline"
          >
            Tentar detectar minha localização novamente
          </button>
        </div>
      )}
    </section>
  );

  return (
    <div className="pb-12">
      <SEOHandler />
      {/* Hero Search Section */}
      <section className="bg-emerald-600 text-white pt-4 pb-16 px-4">
        <div className="w-full max-w-[90%] mx-auto text-center">
          <h1 className="text-4xl font-bold mb-4">Encontre as Farmácias de Plantão</h1>
          <p className="text-emerald-100 mb-8 text-lg">Busque por farmácias abertas agora na sua cidade{city && state ? `: ${formatName(city)} - ${state.toUpperCase()}` : ''}</p>
          
          <div className="flex flex-col gap-4">
            <div className="bg-white p-2 rounded-lg shadow-lg">
              <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 flex items-center px-3 bg-gray-50 rounded-md border border-gray-200">
                  <MapPin className="text-gray-400 w-5 h-5" />
                  <input 
                    type="text" 
                    placeholder="Cidade" 
                    className="w-full bg-transparent border-none focus:ring-0 text-gray-900 p-3 outline-none"
                    value={formatName(city)}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>
                <div className="flex-1 flex items-center px-3 bg-gray-50 rounded-md border border-gray-200">
                  <Search className="text-gray-400 w-5 h-5" />
                  <input 
                    type="text" 
                    placeholder="Nome da Farmácia (Opcional)" 
                    className="w-full bg-transparent border-none focus:ring-0 text-gray-900 p-3 outline-none"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="w-full sm:w-24 flex items-center px-3 bg-gray-50 rounded-md border border-gray-200">
                  <input 
                    type="text" 
                    placeholder="UF" 
                    maxLength={2}
                    className="w-full bg-transparent border-none focus:ring-0 text-gray-900 p-3 outline-none uppercase"
                    value={state}
                    onChange={(e) => setState(e.target.value.toUpperCase())}
                  />
                </div>
                <button 
                  type="submit"
                  className="bg-emerald-700 hover:bg-emerald-800 text-white px-6 py-3 rounded-md font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <Search className="w-5 h-5" />
                  Buscar
                </button>
              </form>
            </div>

            <div className="bg-white p-2 rounded-lg shadow-lg">
              <form onSubmit={handleCepSearch} className="flex gap-2">
                <div className="flex-1 flex items-center px-3 bg-gray-50 rounded-md border border-gray-200">
                  <MapPin className="text-gray-400 w-5 h-5" />
                  <input 
                    type="text" 
                    placeholder="Buscar por CEP (ex: 01001-000)" 
                    className="w-full bg-transparent border-none focus:ring-0 text-gray-900 p-3 outline-none"
                    value={cep}
                    onChange={(e) => setCep(e.target.value)}
                  />
                </div>
                <button 
                  type="submit"
                  className="bg-emerald-700 hover:bg-emerald-800 text-white px-8 py-3 rounded-md font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <Search className="w-5 h-5" />
                  CEP
                </button>
              </form>
            </div>
          </div>

          <div className="flex flex-col items-center gap-3 mt-8">
            <p className="text-emerald-100 text-sm font-medium">Ou use o acesso rápido:</p>
            <Link 
              to={city && state 
                ? `/plantao/${state.toLowerCase()}/${city.toLowerCase().trim().replace(/\s+/g, '-')}`
                : `/plantao${userCoords ? `?lat=${userCoords.lat}&lng=${userCoords.lng}&city=${encodeURIComponent(formatName(city))}&state=${encodeURIComponent(state)}` : ''}`
              }
              className="bg-white text-emerald-700 hover:bg-emerald-50 px-8 py-4 rounded-full font-bold flex items-center justify-center gap-3 transition-all shadow-xl hover:scale-105 active:scale-95 border-2 border-[#b9b9b9]"
            >
              <Clock className="w-6 h-6 animate-pulse" />
              <span className="text-lg">Ver Plantão Hoje na Minha Região</span>
            </Link>
            <p className="text-emerald-200 text-xs">
              {userCoords ? '✓ Localização detectada' : 'Detectando sua localização...'}
            </p>
          </div>
        </div>
      </section>

      <div className="w-full max-w-full sm:max-w-[90%] mx-auto px-4 sm:px-6 lg:px-8 mt-12 space-y-12">
        {showResultsFirst ? (
          <>
            <div className="w-full">
              {resultsSection}
            </div>
            {highlightsSection}
          </>
        ) : (
          <>
            {highlightsSection}
            <div className="w-full">
              {resultsSection}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PharmacyCard({ pharmacy, onTrackClick }: { pharmacy: Pharmacy; onTrackClick: (id: string, type: 'whatsapp' | 'map') => void; key?: React.Key }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 w-full flex flex-col h-full group">
      <PharmacySchema pharmacy={pharmacy} />
      <div className="flex-1">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-xl font-bold text-gray-900 group-hover:text-emerald-600 transition-colors">{pharmacy.name}</h3>
          {(pharmacy as any).distance !== undefined && (
             <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md">
               {Number((pharmacy as any).distance).toFixed(1)} km
             </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          <span className="block font-medium text-gray-700">{pharmacy.street}, {pharmacy.number}</span>
          {pharmacy.neighborhood} - {pharmacy.city}/{pharmacy.state}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row">
        <a 
          href={`tel:${pharmacy.phone}`} 
          className="flex items-center justify-center gap-2 bg-gray-50 text-gray-700 p-3 rounded-xl hover:bg-gray-100 text-xs font-bold transition-all sm:flex-1"
        >
          <Phone className="w-4 h-4 text-emerald-600" />
          LIGAR
        </a>
        <a 
          onClick={() => onTrackClick(pharmacy.id, 'whatsapp')} 
          href={`https://wa.me/55${pharmacy.whatsapp.replace(/\D/g, '')}`} 
          target="_blank" 
          rel="noreferrer" 
          className="flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 p-3 rounded-xl hover:bg-emerald-100 text-xs font-bold transition-all sm:flex-1"
        >
          <MessageCircle className="w-4 h-4 text-emerald-500" />
          WHATSAPP
        </a>
        <a 
          onClick={() => onTrackClick(pharmacy.id, 'map')} 
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pharmacy.street + ', ' + pharmacy.number + ' - ' + pharmacy.city)}`} 
          target="_blank" 
          rel="noreferrer" 
          className="col-span-2 flex items-center justify-center gap-2 bg-blue-50 text-blue-700 p-3 rounded-xl hover:bg-blue-100 text-xs font-bold transition-all sm:flex-1 border border-blue-100 shadow-sm"
        >
          <MapPin className="w-4 h-4 text-blue-500" />
          MAPA
        </a>
      </div>
    </div>
  );
}

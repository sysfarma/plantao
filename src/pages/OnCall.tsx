import React, { useState, useEffect } from 'react';
import { Search, MapPin, Phone, MessageCircle, Clock, Navigation, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { safeJsonFetch } from '../lib/api';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { clearCachedLocation } from '../lib/userCache';
import { geocodeAddress } from '../lib/geocoding';
import { useLocation } from '../hooks/useLocation';
import { getDistance, formatName } from '../lib/utils';
import SEOHandler from '../components/SEOHandler';
import PharmacySchema from '../components/PharmacySchema';
import FreshnessBanner from '../components/FreshnessBanner';
import { OnCallPharmacyCardSkeleton } from '../components/PharmacyCardSkeleton';
import { Alert } from '../components/ui/Alert';

interface Shift {
  start_time: string;
  end_time: string;
  is_24h: number;
}

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
  distance?: number;
  shift: Shift;
}

export default function OnCall() {
  const { uf, city: cityParam } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { status: locationStatus, location, coords: userCoords, detectLocation, setLocation, setCoords: setUserCoords, setStatus: setLocationStatus } = useLocation();
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [cep, setCep] = useState('');
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [serverDate, setServerDate] = useState<string | null>(null);
  const [noShiftsInSystem, setNoShiftsInSystem] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const unsubscribeRef = React.useRef<(() => void) | null>(null);

  // Sync internal state with hook location
  useEffect(() => {
    if (location) {
      setCity(location.city);
      setState(location.state);
      setCep(location.cep || '');
    }
  }, [location]);

  useEffect(() => {
    fetchServerTime();
    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
    };
  }, []);

  const fetchServerTime = async () => {
    try {
      const data = await safeJsonFetch<{date: string}>('/api/status/time');
      if (data?.date) setServerDate(data.date);
    } catch (e) {
      console.warn('Failed to fetch server time', e);
    }
  };

  const fetchOnCallPharmacies = async (searchCity: string, searchState: string, coords?: {lat: number, lng: number}, searchCep?: string) => {
    setLoading(true);
    setError(null);
    try {
      const queryParams: any = {};
      if (searchCity) queryParams.city = searchCity;
      if (searchState) queryParams.state = searchState;
      if (searchCep) queryParams.cep = searchCep;
      if (coords) {
        queryParams.lat = coords.lat;
        queryParams.lng = coords.lng;
      }

      const data = await safeJsonFetch<Pharmacy[]>('/api/public/on-call', {
        query: queryParams
      });

      if (!data || data.length === 0) {
        setNoShiftsInSystem(true);
        setPharmacies([]);
        setLoading(false);
        return;
      }

      setNoShiftsInSystem(false);
      let onCallPharmacies = data;

      if (coords) {
        onCallPharmacies = onCallPharmacies.map(p => {
          if (p.lat && p.lng) {
            const dist = getDistance(coords.lat, coords.lng, Number(p.lat), Number(p.lng));
            return { ...p, distance: dist };
          }
          return p;
        }).sort((a, b) => (a.distance || 0) - (b.distance || 0));
      }

      setPharmacies(onCallPharmacies);
      setLastSync(new Date());
    } catch (error) {
      console.error('Error fetching on-call data:', error);
      setError('Ocorreu um erro ao buscar os plantões. Por favor, tente novamente.');
      setPharmacies([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCepSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    setLoading(true);
    setLocationStatus('detecting');
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setCity(data.localidade);
        setState(data.uf);
        
        // Geocode CEP to get coords for distance filtering
        const geoData = await geocodeAddress(data.logradouro, data.localidade, data.uf);
        
        if (geoData) {
          const coords = { lat: geoData.lat, lng: geoData.lng };
          setUserCoords(coords);
          setLocationStatus('detected');
          setLocation({ city: data.localidade, state: data.uf, cep: cleanCep, lat: coords.lat, lng: coords.lng, type: 'manual' });
          fetchOnCallPharmacies(data.localidade, data.uf, coords, cleanCep);
        } else {
          // Fallback to just city/state if geocoding fails
          setUserCoords(null);
          setLocationStatus('idle');
          setLocation({ city: data.localidade, state: data.uf, cep: cleanCep, type: 'manual' });
          fetchOnCallPharmacies(data.localidade, data.uf, undefined, cleanCep);
        }
      }
    } catch (err) {
      console.error('Error searching CEP', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    const urlLat = searchParams.get('lat');
    const urlLng = searchParams.get('lng');
    
    // Priority 1: URL Params (/plantao/es/castelo)
    if (uf && cityParam) {
      const decodedCity = cityParam.replace(/-/g, ' ');
      setCity(decodedCity);
      setState(uf.toUpperCase());
      fetchOnCallPharmacies(decodedCity, uf.toUpperCase());
      return;
    }

    // Priority 2: Query Params (?lat=...&lng=... or ?city=...&state=...)
    if (urlLat && urlLng) {
      const coords = { lat: parseFloat(urlLat), lng: parseFloat(urlLng) };
      setUserCoords(coords);
      setLocationStatus('detected');
      fetchOnCallPharmacies(searchParams.get('city') || '', searchParams.get('state') || '', coords);
      return;
    } else if (searchParams.get('city') && searchParams.get('state')) {
      const qCity = searchParams.get('city') || '';
      const qState = searchParams.get('state') || '';
      setCity(qCity);
      setState(qState);
      fetchOnCallPharmacies(qCity, qState);
      return;
    }

    // Priority 3: Detection
    detectLocation();
  }, [uf, cityParam, searchParams, detectLocation]);

  useEffect(() => {
    if (locationStatus === 'detected' && location && !uf && !cityParam) {
      fetchOnCallPharmacies(location.city, location.state, userCoords ? { lat: userCoords.lat, lng: userCoords.lng } : undefined, location.cep);
    } else if (locationStatus === 'failed' && !uf && !cityParam) {
      fetchOnCallPharmacies('', '', undefined);
    }
  }, [locationStatus, location, uf, cityParam, userCoords]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (city && state) {
      const citySlug = city.toLowerCase().trim().replace(/\s+/g, '-');
      navigate(`/plantao/${state.toLowerCase()}/${citySlug}`);
    } else {
      setUserCoords(null);
      setLocationStatus('idle');
      setLocation({ city, state, cep: '', type: 'manual' });
      fetchOnCallPharmacies(city, state, undefined, '');
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

  return (
    <div className="pb-12">
      <SEOHandler city={city} uf={state} />
      {/* Hero Search Section */}
      <section className="bg-emerald-600 text-white pt-4 pb-16 px-4">
        <div className="w-full max-w-[90%] mx-auto text-center">
          <h1 className="text-4xl font-bold mb-4">Plantões de Hoje</h1>
          {serverDate ? (
            <p className="text-emerald-50 text-sm mb-4 bg-emerald-700/30 inline-block px-3 py-1 rounded-full border border-emerald-500/30">
              Data oficial do sistema: <span className="font-bold">{serverDate.split('-').reverse().join('/')}</span>
            </p>
          ) : (
            <div className="h-6 w-48 bg-emerald-700/30 animate-pulse mx-auto mb-4 rounded-full" />
          )}
          <p className="text-emerald-100 mb-8 text-lg">Veja as farmácias que estão de plantão hoje na sua região{city && state ? `: ${formatName(city)} - ${state.toUpperCase()}` : ''}</p>
          
          <div className="max-w-4xl mx-auto flex flex-col gap-6">
            {/* Mobile Search Toggle */}
            <button 
              onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
              className="sm:hidden w-full bg-white text-emerald-700 py-4 px-6 rounded-2xl font-bold mb-2 flex items-center justify-between shadow-lg active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-3">
                <Search className="w-5 h-5" />
                <span>{isMobileSearchOpen ? 'Fechar Pesquisa' : 'Mudar Cidade ou CEP'}</span>
              </div>
              {isMobileSearchOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>

            <div className={`${isMobileSearchOpen ? 'block' : 'hidden'} sm:block space-y-4`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Search by City/State */}
                <form onSubmit={handleSearch} className="bg-white p-2 rounded-xl shadow-lg flex flex-col sm:flex-row gap-2">
                  <div className="flex-1 flex items-center px-3 bg-gray-50 rounded-lg border border-gray-100 focus-within:border-emerald-200 transition-all">
                    <MapPin className="text-gray-400 w-5 h-5" />
                    <input 
                      type="text" 
                      placeholder="Cidade" 
                      className="w-full bg-transparent border-none focus:ring-0 text-gray-900 p-3 outline-none font-medium"
                      value={formatName(city)}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </div>
                  <div className="w-full sm:w-24 flex items-center px-3 bg-gray-50 rounded-lg border border-gray-100 focus-within:border-emerald-200 transition-all">
                    <input 
                      type="text" 
                      placeholder="UF" 
                      maxLength={2}
                      className="w-full bg-transparent border-none focus:ring-0 text-gray-900 p-3 outline-none uppercase font-bold text-center"
                      value={state}
                      onChange={(e) => setState(e.target.value.toUpperCase())}
                    />
                  </div>
                  <button 
                    type="submit"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
                  >
                    <Search className="w-5 h-5" />
                    Buscar
                  </button>
                </form>

                {/* Search by CEP */}
                <form onSubmit={handleCepSearch} className="bg-white p-2 rounded-xl shadow-lg flex gap-2">
                  <div className="flex-1 flex items-center px-3 bg-gray-50 rounded-lg border border-gray-100 focus-within:border-emerald-200 transition-all">
                    <MapPin className="text-gray-400 w-5 h-5" />
                    <input 
                      type="text" 
                      placeholder="Busca por CEP (ex: 01001-000)" 
                      className="w-full bg-transparent border-none focus:ring-0 text-gray-900 p-3 outline-none font-medium"
                      value={cep}
                      onChange={(e) => setCep(e.target.value)}
                    />
                  </div>
                  <button 
                    type="submit"
                    className="bg-emerald-700 hover:bg-emerald-800 text-white px-6 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
                  >
                    Localizar
                  </button>
                </form>
              </div>
            </div>

            <button 
              onClick={detectLocation}
              disabled={detecting}
              className="flex items-center justify-center gap-2 text-emerald-100 hover:text-white transition-colors text-sm font-medium self-center bg-emerald-700/30 px-6 py-3 rounded-full border border-emerald-500/30 hover:bg-emerald-700/50 active:scale-95"
            >
              <Navigation className={`w-4 h-4 ${detecting ? 'animate-pulse' : ''}`} />
              {detecting ? 'Detectando sua localização...' : 'Usar minha localização atual'}
            </button>
          </div>
        </div>
      </section>

      <div className="w-full max-w-[90%] mx-auto px-4 sm:px-6 lg:px-8 mt-12">
        <FreshnessBanner lastUpdated={lastSync} />
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <h2 className="text-2xl font-bold text-gray-900 border-l-4 border-emerald-500 pl-4">Farmácias de Plantão</h2>
          
          <div className="flex flex-wrap gap-2">
            {locationStatus === 'detecting' && (
              <span className="text-xs sm:text-sm text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full flex items-center gap-2 animate-pulse border border-emerald-100">
                <Navigation className="w-3 h-3" />
                Detectando...
              </span>
            )}
            
            {cep && (
              <span className="text-xs sm:text-sm text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full flex items-center gap-2 border border-emerald-100">
                <MapPin className="w-3 h-3" />
                Região do CEP: {cep.substring(0, 5)}
              </span>
            )}

            {!cep && userCoords && locationStatus === 'detected' && (
              <span className="text-xs sm:text-sm text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full flex items-center gap-2 border border-emerald-100">
                <MapPin className="w-3 h-3" />
                Raio de 20km
              </span>
            )}

            {locationStatus === 'failed' && (
              <span className="text-xs sm:text-sm text-amber-700 bg-amber-50 px-3 py-1 rounded-full flex items-center gap-2 border border-amber-100">
                <MapPin className="w-3 h-3" />
                Localização não detectada
              </span>
            )}
          </div>
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
              <OnCallPharmacyCardSkeleton key={i} />
            ))}
          </div>
        ) : pharmacies.length > 0 ? (
          <div className={`grid gap-6 ${
            pharmacies.length === 1 ? 'grid-cols-1' :
            pharmacies.length === 2 ? 'grid-cols-1 md:grid-cols-2' :
            'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
          }`}>
            {pharmacies.map(pharmacy => (
              <div key={pharmacy.id} className="bg-white border border-emerald-100 rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 relative overflow-hidden flex flex-col w-full h-full group">
                <PharmacySchema pharmacy={pharmacy} />
                <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[10px] font-extrabold px-4 py-1.5 rounded-bl-2xl flex items-center gap-1.5 uppercase tracking-widest z-10 shadow-sm transition-all group-hover:scale-105 origin-top-right">
                  <Clock className="w-3.5 h-3.5" />
                  {pharmacy.shift.is_24h ? '24 Horas' : `${pharmacy.shift.start_time} - ${pharmacy.shift.end_time}`}
                </div>
                
                <div className="flex-1 mb-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-emerald-600 transition-colors">{pharmacy.name}</h3>
                  <div className="flex items-start gap-3 text-gray-500 text-sm leading-relaxed">
                    <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-500" />
                    <p>
                      <span className="font-medium text-gray-700">{pharmacy.street}, {pharmacy.number}</span><br/>
                      {pharmacy.neighborhood}, {pharmacy.city} - {pharmacy.state}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <a href={`tel:${pharmacy.phone}`} className="flex items-center justify-center gap-2 bg-gray-50 text-gray-700 p-3 rounded-xl hover:bg-gray-100 text-xs font-bold transition-all border border-gray-100">
                    <Phone className="w-4 h-4 text-emerald-600" />
                    LIGAR
                  </a>
                  <a 
                    onClick={() => handleTrackClick(pharmacy.id, 'whatsapp')} 
                    href={`https://wa.me/55${pharmacy.whatsapp.replace(/\D/g, '')}`} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 p-3 rounded-xl hover:bg-emerald-100 text-xs font-bold transition-all"
                  >
                    <MessageCircle className="w-4 h-4 text-emerald-500" />
                    WHATSAPP
                  </a>
                </div>
                
                <a 
                  onClick={() => handleTrackClick(pharmacy.id, 'map')} 
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pharmacy.street + ', ' + pharmacy.number + ' - ' + pharmacy.city)}`} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="w-full flex items-center justify-center gap-2 bg-blue-50 text-blue-700 p-3 rounded-xl hover:bg-blue-100 text-xs font-bold transition-all border border-blue-100"
                >
                  <Navigation className="w-4 h-4 text-blue-500" />
                  VER NO MAPA
                </a>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 text-gray-500">
            <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum plantão encontrado</h3>
            <p className="max-w-xs mx-auto text-sm">
              {noShiftsInSystem 
                ? "Ainda não há farmácias de plantão cadastradas para hoje no sistema."
                : "Não encontramos farmácias de plantão hoje para esta localização num raio de 20km."}
            </p>
            <button 
              onClick={() => {
                setCity('');
                setState('');
                setCep('');
                clearCachedLocation();
                detectLocation();
              }}
              className="mt-6 text-emerald-600 font-bold text-sm hover:underline"
            >
              Tentar novamente com minha localização
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

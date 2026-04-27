import React, { useState, useEffect } from 'react';
import { Search, MapPin, Phone, MessageCircle, Clock, Navigation } from 'lucide-react';
import { safeJsonFetch } from '../lib/api';
import { handleFirestoreError, OperationType } from '../lib/firebaseError';
import { collection, query, where, getDocs, doc, getDoc, addDoc, onSnapshot, writeBatch, increment } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import { db } from '../lib/firebase';
import { getCachedLocation, setCachedLocation, clearCachedLocation } from '../lib/userCache';
import { geocodeAddress, reverseGeocode } from '../lib/geocoding';

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

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

export default function OnCall() {
  const [searchParams] = useSearchParams();
  const [city, setCity] = useState(searchParams.get('city') || '');
  const [state, setState] = useState(searchParams.get('state') || '');
  const [cep, setCep] = useState('');
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [noShiftsInSystem, setNoShiftsInSystem] = useState(false);
  const [userCoords, setUserCoords] = useState<{lat: number, lng: number} | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'detecting' | 'detected' | 'failed' | 'idle'>('idle');
  const unsubscribeRef = React.useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
    };
  }, []);

  const fetchOnCallPharmacies = async (searchCity: string, searchState: string, coords?: {lat: number, lng: number}, searchCep?: string) => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    setLoading(true);
    try {
      const today = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());

      // Fetch today's shifts
      const shiftsQ = query(collection(db, 'shifts'), where('date', '==', today));
      const shiftsSnap = await getDocs(shiftsQ);

      if (shiftsSnap.empty) {
        setNoShiftsInSystem(true);
        setPharmacies([]);
        setLoading(false);
        return;
      }

      setNoShiftsInSystem(false);

      // Fetch active pharmacies
      let pQuery: any = query(collection(db, 'pharmacies'), where('is_active', '==', 1));
      if (searchCity && searchState && !searchCep) {
        pQuery = query(pQuery, where('city', '==', searchCity), where('state', '==', searchState));
      }

      const pSnap = await getDocs(pQuery);
      const pharmaciesMap = new Map();
      pSnap.docs.forEach(doc => pharmaciesMap.set(doc.id, { id: doc.id, ...(doc.data() as any) }));

      // Map shifts directly to pharmacies
      let onCallPharmacies: Pharmacy[] = [];
      const cleanSearchCep = searchCep ? searchCep.replace(/\D/g, '').substring(0, 5) : null;

      shiftsSnap.docs.forEach(doc => {
        const shift = doc.data() as any;
        const pharmacy = pharmaciesMap.get(shift.pharmacy_id);
        
        if (pharmacy) {
          if (cleanSearchCep) {
            const pharmCep = (pharmacy.cep || pharmacy.zip || '').replace(/\D/g, '').substring(0, 5);
            if (pharmCep !== cleanSearchCep) return;
          }
          
          if (searchCity && searchState && !searchCep) {
            if ((pharmacy.city || '').toLowerCase() !== searchCity.toLowerCase() || 
                (pharmacy.state || '').toLowerCase() !== searchState.toLowerCase()) {
              return;
            }
          }

          onCallPharmacies.push({
            ...pharmacy,
            shift: {
              start_time: shift.start_time,
              end_time: shift.end_time,
              is_24h: shift.is_24h
            }
          });
        }
      });

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
    } catch (error) {
      console.error('Error fetching on-call data:', error);
      handleFirestoreError(error, OperationType.GET, 'public/on-call');
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
          setCachedLocation({ city: data.localidade, state: data.uf, cep: cleanCep, lat: coords.lat, lng: coords.lng, type: 'manual' });
          fetchOnCallPharmacies(data.localidade, data.uf, coords, cleanCep);
        } else {
          // Fallback to just city/state if geocoding fails
          setUserCoords(null);
          setLocationStatus('idle');
          setCachedLocation({ city: data.localidade, state: data.uf, cep: cleanCep, type: 'manual' });
          fetchOnCallPharmacies(data.localidade, data.uf, undefined, cleanCep);
        }
      }
    } catch (err) {
      console.error('Error searching CEP', err);
      setLoading(false);
    }
  };

  const detectLocation = () => {
    setDetecting(true);
    setLocationStatus('detecting');
    
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
          setUserCoords(coords);
          setLocationStatus('detected');
          
          // Try to get city/state/cep from coords
          try {
            const data = await reverseGeocode(coords.lat, coords.lng);
            if (data && data.address) {
              const detectedCity = data.address.city || data.address.town || data.address.village || data.address.suburb || data.address.municipality || '';
              let detectedState = data.address.state_code || '';
              const detectedCep = data.address.postcode || '';
              
              // Robust state/UF detection
              if (!detectedState && data.address['ISO3166-2-lvl4']) {
                const parts = data.address['ISO3166-2-lvl4'].split('-');
                detectedState = parts.length > 1 ? parts[1] : parts[0];
              }
              
              if (!detectedState) {
                const stateCandidate = data.address.state || data.address.region || data.address.province;
                if (stateCandidate) {
                  const stateMap: Record<string, string> = {
                    'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM',
                    'bahia': 'BA', 'ceara': 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES',
                    'goias': 'GO', 'maranhao': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
                    'minas gerais': 'MG', 'para': 'PA', 'paraiba': 'PB', 'parana': 'PR',
                    'pernambuco': 'PE', 'piaui': 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN',
                    'rio grande do sul': 'RS', 'rondonia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC',
                    'sao paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO'
                  };
                  const normalized = stateCandidate.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                  detectedState = stateMap[normalized] || stateCandidate.substring(0, 2).toUpperCase();
                }
              }
              
              // Final sanitize
              if (detectedState && detectedState.length > 2) {
                detectedState = detectedState.substring(0, 2).toUpperCase();
              }
              
              setCity(detectedCity);
              setState(detectedState || '');
              if (detectedCep) setCep(detectedCep);
              setCachedLocation({ 
                city: detectedCity, 
                state: detectedState || '', 
                cep: detectedCep,
                lat: coords.lat, 
                lng: coords.lng, 
                type: 'gps' 
              });
              fetchOnCallPharmacies(detectedCity, detectedState || '', coords, detectedCep);
            } else {
              fetchOnCallPharmacies('', '', coords);
            }
          } catch (e) {
            fetchOnCallPharmacies('', '', coords);
          }
          
          setDetecting(false);
        },
        async () => {
          fallbackToIp();
        },
        { timeout: 8000, enableHighAccuracy: true }
      );
    } else {
      fallbackToIp();
    }
  };

  const fallbackToIp = async () => {
    try {
      const res = await fetch('https://ipwho.is/');
      const data = await res.json();
      if (data.success && data.latitude && data.longitude) {
        const detectedCep = data.postal || '';
        const coords = { lat: data.latitude, lng: data.longitude };
        setUserCoords(coords);
        setLocationStatus('detected');
        setCity(data.city || '');
        setState(data.region_code || '');
        if (detectedCep) setCep(detectedCep);
        setCachedLocation({ 
          city: data.city || '', 
          state: data.region_code || '', 
          cep: detectedCep,
          lat: coords.lat, 
          lng: coords.lng, 
          type: 'ip' 
        });
        fetchOnCallPharmacies(data.city || '', data.region_code || '', coords, detectedCep);
      } else {
        setLocationStatus('failed');
        fetchOnCallPharmacies(city, state);
      }
    } catch (error) {
      console.error('Error detecting location', error);
      setLocationStatus('failed');
      fetchOnCallPharmacies(city, state);
    } finally {
      setDetecting(false);
    }
  };

  useEffect(() => {
    const urlLat = searchParams.get('lat');
    const urlLng = searchParams.get('lng');
    const urlCity = searchParams.get('city');
    const urlState = searchParams.get('state');

    if (urlLat && urlLng) {
      const coords = { lat: parseFloat(urlLat), lng: parseFloat(urlLng) };
      setUserCoords(coords);
      setLocationStatus('detected');
      fetchOnCallPharmacies(urlCity || '', urlState || '', coords);
      return;
    } else if (urlCity && urlState) {
      fetchOnCallPharmacies(urlCity, urlState);
      return;
    }

    const cached = getCachedLocation();
    if (cached && cached.city && cached.state) {
      setCity(cached.city);
      setState(cached.state);
      let coords: {lat: number, lng: number} | undefined = undefined;
      
      if (cached.lat && cached.lng) {
        coords = { lat: cached.lat, lng: cached.lng };
        setUserCoords(coords);
        setLocationStatus('detected');
      } else {
        setLocationStatus('idle');
      }
      
      if (cached.cep) setCep(cached.cep);
      fetchOnCallPharmacies(cached.city, cached.state, coords, cached.cep);
    } else {
      detectLocation();
    }
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setUserCoords(null); // Clear coords to force city/state search
    setLocationStatus('idle');
    setCachedLocation({ city, state, cep: '', type: 'manual' });
    fetchOnCallPharmacies(city, state, undefined, '');
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
      {/* Hero Search Section */}
      <section className="bg-emerald-600 text-white pt-4 pb-16 px-4">
        <div className="w-full max-w-[90%] mx-auto text-center">
          <h1 className="text-4xl font-bold mb-4">Plantões de Hoje</h1>
          <p className="text-emerald-100 mb-8 text-lg">Veja as farmácias que estão de plantão hoje na sua região</p>
          
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Search by City/State */}
              <form onSubmit={handleSearch} className="bg-white p-2 rounded-lg shadow-lg flex flex-col sm:flex-row gap-2">
                <div className="flex-1 flex items-center px-3 bg-gray-50 rounded-md border border-gray-200">
                  <MapPin className="text-gray-400 w-5 h-5" />
                  <input 
                    type="text" 
                    placeholder="Cidade" 
                    className="w-full bg-transparent border-none focus:ring-0 text-gray-900 p-3 outline-none"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
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
                  className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-3 rounded-md font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <Search className="w-5 h-5" />
                  Buscar
                </button>
              </form>

              {/* Search by CEP */}
              <form onSubmit={handleCepSearch} className="bg-white p-2 rounded-lg shadow-lg flex gap-2">
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
                  className="bg-emerald-700 hover:bg-emerald-800 text-white px-6 py-3 rounded-md font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <Search className="w-5 h-5" />
                  CEP
                </button>
              </form>
            </div>

            <button 
              onClick={detectLocation}
              disabled={detecting}
              className="flex items-center justify-center gap-2 text-emerald-100 hover:text-white transition-colors text-sm font-medium self-center bg-emerald-700/30 px-4 py-2 rounded-full border border-emerald-500/30"
            >
              <Navigation className={`w-4 h-4 ${detecting ? 'animate-pulse' : ''}`} />
              {detecting ? 'Detectando sua localização...' : 'Usar minha localização atual'}
            </button>
          </div>
        </div>
      </section>

      <div className="w-full max-w-[90%] mx-auto px-4 sm:px-6 lg:px-8 mt-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <h2 className="text-2xl font-bold text-gray-900">Farmácias de Plantão</h2>
          
          {locationStatus === 'detecting' && (
            <span className="text-sm text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full flex items-center gap-2 animate-pulse">
              <Navigation className="w-3 h-3" />
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

        {loading || locationStatus === 'detecting' ? (
          <div className="text-center py-20 text-gray-500 flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="font-medium">
              {locationStatus === 'detecting' ? 'Detectando sua localização...' : 'Buscando farmácias de plantão...'}
            </p>
            <p className="text-sm text-gray-400">Isso pode levar alguns segundos</p>
          </div>
        ) : pharmacies.length > 0 ? (
          <div className="flex flex-col gap-6">
            {pharmacies.map(pharmacy => (
              <div key={pharmacy.id} className="bg-white border border-emerald-100 rounded-xl p-6 shadow-sm hover:shadow-md transition-all relative overflow-hidden flex flex-col w-full">
                <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg flex items-center gap-1 uppercase tracking-wider">
                  <Clock className="w-3 h-3" />
                  {pharmacy.shift.is_24h ? '24 Horas' : `${pharmacy.shift.start_time} - ${pharmacy.shift.end_time}`}
                </div>
                
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-gray-900 mb-2 line-clamp-1">{pharmacy.name}</h3>
                  <div className="flex items-start gap-2 text-gray-500 text-sm">
                    <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600" />
                    <p>
                      {pharmacy.street}, {pharmacy.number}<br/>
                      {pharmacy.neighborhood}, {pharmacy.city} - {pharmacy.state}
                    </p>
                  </div>
                </div>

                <div className="mt-auto pt-6 flex gap-2">
                  <a href={`tel:${pharmacy.phone}`} className="flex-1 flex items-center justify-center gap-2 bg-gray-50 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-100 text-sm font-semibold transition-colors border border-gray-200">
                    <Phone className="w-4 h-4" />
                    Ligar
                  </a>
                  <a 
                    onClick={() => handleTrackClick(pharmacy.id, 'whatsapp')} 
                    href={`https://wa.me/55${pharmacy.whatsapp.replace(/\D/g, '')}`} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-lg hover:bg-emerald-700 text-sm font-semibold transition-colors shadow-sm"
                  >
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp
                  </a>
                </div>
                
                <a 
                  onClick={() => handleTrackClick(pharmacy.id, 'map')} 
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pharmacy.street + ', ' + pharmacy.number + ' - ' + pharmacy.city)}`} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="mt-3 w-full flex items-center justify-center gap-2 text-emerald-600 hover:text-emerald-700 text-xs font-bold py-2 transition-colors"
                >
                  <Navigation className="w-3 h-3" />
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

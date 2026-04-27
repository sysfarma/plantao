import React, { useState, useEffect } from 'react';
import { Search, MapPin, Phone, MessageCircle, Star, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { safeJsonFetch } from '../lib/api';
import { collection, query, where, getDocs, doc, getDoc, addDoc, writeBatch, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getCachedLocation, setCachedLocation, clearCachedLocation } from '../lib/userCache';
import { geocodeAddress, reverseGeocode } from '../lib/geocoding';
import { handleFirestoreError, OperationType } from '../lib/firebaseError';

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

interface Highlight extends Pharmacy {
  type: 'day' | 'week' | 'month';
  date_start?: string;
  date_end?: string;
}

export default function Home() {
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [cep, setCep] = useState('');
  const [name, setName] = useState('');
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasSearched, setHasSearched] = useState(false);
  const [userCoords, setUserCoords] = useState<{lat: number, lng: number} | null>(null);
  const [locationStatus, setLocationStatus] = useState<'detecting' | 'detected' | 'failed' | 'idle'>('idle');

  const fetchPharmacies = async (searchCity: string, searchState: string, searchName: string, coords?: {lat: number, lng: number}, searchCep?: string) => {
    setLoading(true);
    try {
      let pQuery: any = query(collection(db, 'pharmacies'), where('is_active', '==', 1));
      if (searchCity && searchState && !searchCep) {
        pQuery = query(pQuery, where('city', '==', searchCity), where('state', '==', searchState));
      }
      
      const pSnap = await getDocs(pQuery);
      let pharmData = pSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }) as Pharmacy);
      
      if (searchName) {
        pharmData = pharmData.filter(p => p.name.toLowerCase().includes(searchName.toLowerCase()));
      }
      if (searchCep) {
        const cleanCep = searchCep.replace(/\D/g, '').substring(0, 5);
        pharmData = pharmData.filter((p: any) => {
          const pharmCep = (p.cep || p.zip || '').replace(/\D/g, '').substring(0, 5);
          return pharmCep === cleanCep;
        });
      }

      const now = new Date().toISOString();
      const hQuery = query(collection(db, 'highlights'), where('date_start', '<=', now));
      const hSnap = await getDocs(hQuery);
      
      let highDataRaw = hSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Highlight))
        .filter(h => h.date_end && h.date_end >= now);
        
      if (searchCity && searchState && !searchCep) {
        highDataRaw = highDataRaw.filter(h => h.city.toLowerCase() === searchCity.toLowerCase() && h.state.toLowerCase() === searchState.toLowerCase());
      }
      
      highDataRaw = highDataRaw.map(h => {
        const p = pharmData.find(p => p.id === (h as any).pharmacy_id);
        if (p) {
          return { ...h, name: p.name, phone: p.phone, whatsapp: p.whatsapp, street: p.street, number: p.number, neighborhood: p.neighborhood, city: p.city, state: p.state };
        }
        return null;
      }).filter(Boolean) as Highlight[];
      
      // Filter by distance if coords are available and no city or CEP search is active
      if (coords && !searchCity && !searchCep) {
        pharmData = pharmData.filter((p: any) => {
          if (p.lat && p.lng) {
            const dist = getDistance(coords.lat, coords.lng, Number(p.lat), Number(p.lng));
            return dist <= 20; // 20km radius
          }
          return false;
        });
      }
      
      setHighlights(highDataRaw);
      setPharmacies(pharmData);
    } catch (error) {
      console.error('Error fetching data', error);
      handleFirestoreError(error, OperationType.GET, 'public/data');
      setHighlights([]);
      setPharmacies([]);
    } finally {
      setLoading(false);
    }
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
        setCity(data.localidade);
        setState(data.uf);
        setHasSearched(true);
        
        // Geocode CEP to get coords
        const geoData = await geocodeAddress(data.logradouro, data.localidade, data.uf);
        
        if (geoData) {
          const coords = { lat: geoData.lat, lng: geoData.lng };
          setUserCoords(coords);
          setLocationStatus('detected');
          setCachedLocation({ city: data.localidade, state: data.uf, cep: cleanCep, lat: coords.lat, lng: coords.lng, type: 'manual' });
          fetchPharmacies(data.localidade, data.uf, name, coords, cleanCep);
        } else {
          setUserCoords(null);
          setLocationStatus('idle');
          setCachedLocation({ city: data.localidade, state: data.uf, cep: cleanCep, type: 'manual' });
          fetchPharmacies(data.localidade, data.uf, name, undefined, cleanCep);
        }
      }
    } catch (err) {
      console.error('Error searching CEP', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
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
        fetchPharmacies(cached.city, cached.state, '', coords, cached.cep);
        return;
      }

      setLocationStatus('detecting');
      // Try Browser Geolocation first
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
                fetchPharmacies(detectedCity, detectedState || '', '', coords, detectedCep);
              } else {
                fetchPharmacies('', '', '', coords);
              }
            } catch (e) {
              fetchPharmacies('', '', '', coords);
            }
          },
          async () => {
            // Fallback to IP if denied or error
            fallbackToIp();
          }
        );
      } else {
        fallbackToIp();
      }
    };

    const fallbackToIp = async () => {
      try {
        const res = await fetch('https://ipwho.is/');
        const data = await res.json();
        if (data.success && data.city && data.region_code) {
          const detectedCep = data.postal || '';
          setCity(data.city);
          setState(data.region_code);
          if (detectedCep) setCep(detectedCep);
          const coords = { lat: data.latitude, lng: data.longitude };
          setUserCoords(coords);
          setLocationStatus('detected');
          setCachedLocation({ 
            city: data.city, 
            state: data.region_code, 
            cep: detectedCep,
            lat: coords.lat, 
            lng: coords.lng, 
            type: 'ip' 
          });
          fetchPharmacies(data.city, data.region_code, '', coords, detectedCep);
        } else {
          setLocationStatus('failed');
          fetchPharmacies('', '', '');
        }
      } catch (error) {
        console.error('Error detecting location', error);
        setLocationStatus('failed');
        fetchPharmacies('', '', '');
      }
    };

    init();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setHasSearched(true);
    setUserCoords(null);
    setLocationStatus('idle');
    setCachedLocation({ city, state, cep: '', type: 'manual' });
    fetchPharmacies(city, state, name, undefined, '');
  };

  const handleTrackClick = async (id: string, type: 'whatsapp' | 'map') => {
    try {
      const pharm = pharmacies.find(p => p.id === id);
      const batch = writeBatch(db);
      const clickRef = doc(collection(db, 'clicks'));
      const pharmacyRef = doc(db, 'pharmacies', id);
      const now = new Date().toISOString();

      batch.set(clickRef, {
        pharmacy_id: id,
        user_id: pharm?.user_id || '', // Include owner_id for optimized security rules
        type,
        created_at: now,
        updated_at: now
      });

      batch.update(pharmacyRef, {
        [type === 'whatsapp' ? 'whatsapp_clicks' : 'map_clicks']: increment(1),
        updated_at: now
      });

      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'clicks/batch');
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
          <div className="flex flex-col gap-4">
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
          <div className="flex flex-col gap-4">
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
          <div className="flex flex-col gap-4">
            {monthHighlights.map(pharmacy => (
              <PharmacyCard key={pharmacy.id} pharmacy={pharmacy} onTrackClick={handleTrackClick} />
            ))}
          </div>
        </section>
      )}
    </div>
  );

  const resultsSection = (
    <section>
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <h2 className="text-2xl font-bold text-gray-900">
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

      {loading || locationStatus === 'detecting' ? (
        <div className="text-center py-20 text-gray-500 flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="font-medium">
            {locationStatus === 'detecting' ? 'Detectando sua localização...' : 'Buscando farmácias...'}
          </p>
          <p className="text-sm text-gray-400">Isso pode levar alguns segundos</p>
        </div>
      ) : pharmacies.length > 0 ? (
        <div className="flex flex-col gap-6">
          {pharmacies.map(pharmacy => (
            <PharmacyCard key={pharmacy.id} pharmacy={pharmacy} onTrackClick={handleTrackClick} />
          ))}
        </div>
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
      {/* Hero Search Section */}
      <section className="bg-emerald-600 text-white pt-4 pb-16 px-4">
        <div className="w-full max-w-[90%] mx-auto text-center">
          <h1 className="text-4xl font-bold mb-4">Encontre as Farmácias de Plantão</h1>
          <p className="text-emerald-100 mb-8 text-lg">Busque por farmácias abertas agora na sua cidade</p>
          
          <div className="flex flex-col gap-4">
            <div className="bg-white p-2 rounded-lg shadow-lg">
              <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
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
              to={`/plantao${userCoords ? `?lat=${userCoords.lat}&lng=${userCoords.lng}&city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}` : ''}`}
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

      <div className="w-full max-w-[90%] mx-auto px-4 sm:px-6 lg:px-8 mt-12 space-y-12">
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
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow w-full">
      <h3 className="text-lg font-bold text-gray-900 mb-1">{pharmacy.name}</h3>
      <p className="text-sm text-gray-500 mb-4 line-clamp-2">
        {pharmacy.street}, {pharmacy.number} - {pharmacy.neighborhood}<br/>
        {pharmacy.city}/{pharmacy.state}
      </p>
      <div className="flex gap-2">
        <a href={`tel:${pharmacy.phone}`} className="flex-1 flex items-center justify-center gap-2 bg-gray-100 text-gray-700 px-3 py-2 rounded-md hover:bg-gray-200 text-sm font-medium transition-colors">
          <Phone className="w-4 h-4" />
          Ligar
        </a>
        <a onClick={() => onTrackClick(pharmacy.id, 'whatsapp')} href={`https://wa.me/55${pharmacy.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-2 bg-green-50 text-green-700 px-3 py-2 rounded-md hover:bg-green-100 text-sm font-medium transition-colors">
          <MessageCircle className="w-4 h-4" />
          WhatsApp
        </a>
        <a onClick={() => onTrackClick(pharmacy.id, 'map')} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pharmacy.street + ', ' + pharmacy.number + ' - ' + pharmacy.city)}`} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-2 bg-blue-50 text-blue-700 px-3 py-2 rounded-md hover:bg-blue-100 text-sm font-medium transition-colors border border-[#4281ff]">
          <MapPin className="w-4 h-4" />
          Mapa
        </a>
      </div>
    </div>
  );
}

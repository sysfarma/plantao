import React, { useState, useEffect } from 'react';
import { Search, MapPin, Phone, MessageCircle, Clock, Navigation } from 'lucide-react';
import { collection, query, where, getDocs, doc, getDoc, addDoc, onSnapshot, writeBatch, increment } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import { db } from '../lib/firebase';

interface Shift {
  start_time: string;
  end_time: string;
  is_24h: number;
}

interface Pharmacy {
  id: string;
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
  const [loading, setLoading] = useState(false);
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

  const fetchOnCallPharmacies = (searchCity: string, searchState: string, coords?: {lat: number, lng: number}) => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    setLoading(true);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const shiftsRef = collection(db, 'shifts');
    const q = query(shiftsRef, where('date', '==', today));

    unsubscribeRef.current = onSnapshot(q, async (shiftsSnapshot) => {
      if (shiftsSnapshot.empty) {
        setNoShiftsInSystem(true);
        setPharmacies([]);
        setLoading(false);
        return;
      }

      setNoShiftsInSystem(false);
      const onCallPharmacies: Pharmacy[] = [];
      
      for (const shiftDoc of shiftsSnapshot.docs) {
        const shift = shiftDoc.data();
        const pharmacyRef = doc(db, 'pharmacies', shift.pharmacy_id);
        const pharmacySnap = await getDoc(pharmacyRef);
        
        if (pharmacySnap.exists()) {
          const pharmacy = pharmacySnap.data();
          if (pharmacy.is_active === 1) {
            const pharmacyData = {
              id: pharmacySnap.id,
              ...pharmacy,
              shift: {
                start_time: shift.start_time,
                end_time: shift.end_time,
                is_24h: shift.is_24h
              }
            } as Pharmacy;

            let isNear = false;
            if (coords && pharmacyData.lat && pharmacyData.lng) {
              const dist = getDistance(coords.lat, coords.lng, Number(pharmacyData.lat), Number(pharmacyData.lng));
              if (dist <= 20) {
                isNear = true;
                onCallPharmacies.push(pharmacyData);
              }
            }

            if (!isNear && searchCity) {
              const cityMatch = pharmacyData.city.trim().toLowerCase() === searchCity.trim().toLowerCase();
              const stateMatch = !searchState || pharmacyData.state.trim().toLowerCase() === searchState.trim().toLowerCase();
              
              if (cityMatch && stateMatch) {
                onCallPharmacies.push(pharmacyData);
              }
            }
          }
        }
      }
      
      setPharmacies(onCallPharmacies);
      setLoading(false);
    }, (error) => {
      console.error('Error in shifts listener', error);
      setLoading(false);
    });
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
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(`${data.logradouro}, ${data.localidade}, ${data.uf}, Brazil`)}`, {
          headers: {
            'User-Agent': 'FarmaciasDePlantao/1.0',
            'Accept-Language': 'pt-BR'
          }
        });
        const geoData = await geoRes.json();
        
        if (geoData && geoData.length > 0) {
          const coords = { lat: parseFloat(geoData[0].lat), lng: parseFloat(geoData[0].lon) };
          setUserCoords(coords);
          setLocationStatus('detected');
          fetchOnCallPharmacies(data.localidade, data.uf, coords);
        } else {
          // Fallback to just city/state if geocoding fails
          setUserCoords(null);
          setLocationStatus('idle');
          fetchOnCallPharmacies(data.localidade, data.uf);
        }
      }
    } catch (err) {
      console.error('Error searching CEP', err);
    } finally {
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
          
          // Try to get city/state from coords for fallback
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}`, {
              headers: {
                'User-Agent': 'FarmaciasDePlantao/1.0',
                'Accept-Language': 'pt-BR'
              }
            });
            const data = await res.json();
            if (data.address) {
              const detectedCity = data.address.city || data.address.town || data.address.village || data.address.suburb || '';
              // For Brazil, state_code is often not present, but ISO3166-2-lvl4 has it like "BR-SP"
              let detectedState = data.address.state_code || '';
              if (!detectedState && data.address['ISO3166-2-lvl4']) {
                detectedState = data.address['ISO3166-2-lvl4'].split('-')[1];
              }
              
              setCity(detectedCity);
              setState(detectedState);
              fetchOnCallPharmacies(detectedCity, detectedState, coords);
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
        const coords = { lat: data.latitude, lng: data.longitude };
        setUserCoords(coords);
        setLocationStatus('detected');
        setCity(data.city || '');
        setState(data.region_code || '');
        fetchOnCallPharmacies(data.city || '', data.region_code || '', coords);
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
    } else if (urlCity && urlState) {
      fetchOnCallPharmacies(urlCity, urlState);
    } else {
      detectLocation();
    }
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setUserCoords(null); // Clear coords to force city/state search
    setLocationStatus('idle');
    fetchOnCallPharmacies(city, state);
  };

  const handleTrackClick = async (id: string, type: 'whatsapp' | 'map') => {
    try {
      const batch = writeBatch(db);
      const clickRef = doc(collection(db, 'clicks'));
      const pharmacyRef = doc(db, 'pharmacies', id);
      const now = new Date().toISOString();

      batch.set(clickRef, {
        pharmacy_id: id,
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
      console.error('Error tracking click', err);
    }
  };

  return (
    <div className="pb-12">
      {/* Hero Search Section */}
      <section className="bg-emerald-600 text-white py-16 px-4">
        <div className="max-w-4xl lg:max-w-none mx-auto text-center">
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

      <div className="max-w-7xl lg:max-w-none mx-auto px-4 sm:px-6 lg:px-8 mt-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <h2 className="text-2xl font-bold text-gray-900">Farmácias de Plantão</h2>
          
          {locationStatus === 'detecting' && (
            <span className="text-sm text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full flex items-center gap-2 animate-pulse">
              <Navigation className="w-3 h-3" />
              Detectando sua localização...
            </span>
          )}
          
          {userCoords && locationStatus === 'detected' && (
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

        {loading ? (
          <div className="text-center py-20 text-gray-500 flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="font-medium">Buscando farmácias de plantão...</p>
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

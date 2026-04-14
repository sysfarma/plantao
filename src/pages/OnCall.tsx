import React, { useState, useEffect } from 'react';
import { Search, MapPin, Phone, MessageCircle, Clock } from 'lucide-react';

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
  shift: Shift;
}

export default function OnCall() {
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchOnCallPharmacies = async (searchCity: string, searchState: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchCity) params.append('city', searchCity);
      if (searchState) params.append('state', searchState);

      const res = await fetch(`/api/public/on-call?${params.toString()}`);
      const data = await res.json();
      setPharmacies(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching on-call pharmacies', error);
      setPharmacies([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch('https://ipwho.is/');
        const data = await res.json();
        if (data.success && data.city && data.region_code) {
          setCity(data.city);
          setState(data.region_code);
          fetchOnCallPharmacies(data.city, data.region_code);
        } else {
          fetchOnCallPharmacies('', '');
        }
      } catch (error) {
        console.error('Error detecting location', error);
        fetchOnCallPharmacies('', '');
      }
    };
    init();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOnCallPharmacies(city, state);
  };

  const handleTrackClick = (id: string, type: 'whatsapp' | 'map') => {
    fetch(`/api/public/pharmacies/${id}/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type })
    }).catch(err => console.error('Error tracking click', err));
  };

  return (
    <div className="pb-12">
      {/* Hero Search Section */}
      <section className="bg-emerald-600 text-white py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl font-bold mb-4">Plantões de Hoje</h1>
          <p className="text-emerald-100 mb-8 text-lg">Veja as farmácias que estão de plantão hoje na sua cidade</p>
          
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
            <div className="w-full sm:w-32 flex items-center px-3 bg-gray-50 rounded-md border border-gray-200">
              <input 
                type="text" 
                placeholder="UF (ex: SP)" 
                maxLength={2}
                className="w-full bg-transparent border-none focus:ring-0 text-gray-900 p-3 outline-none uppercase"
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase())}
              />
            </div>
            <button 
              type="submit"
              className="bg-emerald-700 hover:bg-emerald-800 text-white px-6 py-3 rounded-md font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Search className="w-5 h-5" />
              Buscar
            </button>
          </form>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Farmácias de Plantão</h2>
        {loading ? (
          <div className="text-center py-12 text-gray-500">Carregando...</div>
        ) : pharmacies.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pharmacies.map(pharmacy => (
              <div key={pharmacy.id} className="bg-white border border-emerald-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-bl-lg flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {pharmacy.shift.is_24h ? '24 Horas' : `${pharmacy.shift.start_time} às ${pharmacy.shift.end_time}`}
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-1 pr-24">{pharmacy.name}</h3>
                <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                  {pharmacy.street}, {pharmacy.number} - {pharmacy.neighborhood}<br/>
                  {pharmacy.city}/{pharmacy.state}
                </p>
                <div className="flex gap-2">
                  <a href={`tel:${pharmacy.phone}`} className="flex-1 flex items-center justify-center gap-2 bg-gray-100 text-gray-700 px-3 py-2 rounded-md hover:bg-gray-200 text-sm font-medium transition-colors">
                    <Phone className="w-4 h-4" />
                    Ligar
                  </a>
                  <a onClick={() => handleTrackClick(pharmacy.id, 'whatsapp')} href={`https://wa.me/55${pharmacy.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-2 bg-green-50 text-green-700 px-3 py-2 rounded-md hover:bg-green-100 text-sm font-medium transition-colors">
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp
                  </a>
                  <a onClick={() => handleTrackClick(pharmacy.id, 'map')} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pharmacy.street + ', ' + pharmacy.number + ' - ' + pharmacy.city)}`} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-2 bg-blue-50 text-blue-700 px-3 py-2 rounded-md hover:bg-blue-100 text-sm font-medium transition-colors">
                    <MapPin className="w-4 h-4" />
                    Mapa
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-gray-500">
            Nenhuma farmácia de plantão encontrada hoje para esta busca.
          </div>
        )}
      </div>
    </div>
  );
}

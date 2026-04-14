import React, { useState, useEffect } from 'react';
import { Search, MapPin, Phone, MessageCircle, Star } from 'lucide-react';

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
}

interface Highlight extends Pharmacy {
  type: 'day' | 'week' | 'month';
}

export default function Home() {
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [name, setName] = useState('');
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPharmacies = async (searchCity: string, searchState: string, searchName: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchCity) params.append('city', searchCity);
      if (searchState) params.append('state', searchState);
      if (searchName) params.append('name', searchName);

      const [highRes, pharmRes] = await Promise.all([
        fetch(`/api/public/highlights?${params.toString()}`),
        fetch(`/api/public/pharmacies?${params.toString()}`)
      ]);

      const highData = await highRes.json();
      const pharmData = await pharmRes.json();

      setHighlights(Array.isArray(highData) ? highData : []);
      setPharmacies(Array.isArray(pharmData) ? pharmData : []);
    } catch (error) {
      console.error('Error fetching data', error);
      setHighlights([]);
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
          fetchPharmacies(data.city, data.region_code, '');
        } else {
          fetchPharmacies('', '', '');
        }
      } catch (error) {
        console.error('Error detecting location', error);
        fetchPharmacies('', '', '');
      }
    };
    init();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPharmacies(city, state, name);
  };

  const handleTrackClick = (id: string, type: 'whatsapp' | 'map') => {
    fetch(`/api/public/pharmacies/${id}/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type })
    }).catch(err => console.error('Error tracking click', err));
  };

  const weekHighlights = highlights.filter(h => h.type === 'week');
  const monthHighlights = highlights.filter(h => h.type === 'month');

  return (
    <div className="pb-12">
      {/* Hero Search Section */}
      <section className="bg-emerald-600 text-white py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl font-bold mb-4">Encontre as Farmácias de Plantão</h1>
          <p className="text-emerald-100 mb-8 text-lg">Busque por farmácias abertas agora na sua cidade</p>
          
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 space-y-12">
        
        {/* Week & Month Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {weekHighlights.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-4 border-b pb-2">Destaques da Semana</h2>
              <div className="space-y-4">
                {weekHighlights.map(pharmacy => (
                  <PharmacyCard key={pharmacy.id} pharmacy={pharmacy} onTrackClick={handleTrackClick} />
                ))}
              </div>
            </section>
          )}

          {monthHighlights.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-4 border-b pb-2">Destaques do Mês</h2>
              <div className="space-y-4">
                {monthHighlights.map(pharmacy => (
                  <PharmacyCard key={pharmacy.id} pharmacy={pharmacy} onTrackClick={handleTrackClick} />
                ))}
              </div>
            </section>
          )}
        </div>

        {/* All Pharmacies */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Todas as Farmácias</h2>
          {loading ? (
            <div className="text-center py-12 text-gray-500">Carregando...</div>
          ) : pharmacies.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pharmacies.map(pharmacy => (
                <PharmacyCard key={pharmacy.id} pharmacy={pharmacy} onTrackClick={handleTrackClick} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-gray-500">
              Nenhuma farmácia encontrada para esta busca.
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

function PharmacyCard({ pharmacy, onTrackClick }: { pharmacy: Pharmacy; onTrackClick: (id: string, type: 'whatsapp' | 'map') => void; key?: React.Key }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
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
        <a onClick={() => onTrackClick(pharmacy.id, 'map')} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pharmacy.street + ', ' + pharmacy.number + ' - ' + pharmacy.city)}`} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-2 bg-blue-50 text-blue-700 px-3 py-2 rounded-md hover:bg-blue-100 text-sm font-medium transition-colors">
          <MapPin className="w-4 h-4" />
          Mapa
        </a>
      </div>
    </div>
  );
}

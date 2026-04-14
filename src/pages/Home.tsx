import React, { useState, useEffect } from 'react';
import { Search, MapPin, Phone, MessageCircle, Star } from 'lucide-react';
import { collection, query, where, getDocs, doc, getDoc, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

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
      // Fetch Pharmacies
      const pharmRef = collection(db, 'pharmacies');
      const pharmConstraints: any[] = [where('is_active', '==', 1)];
      
      if (searchCity && searchState) {
        pharmConstraints.push(where('city', '==', searchCity));
        pharmConstraints.push(where('state', '==', searchState));
      }
      
      const q = query(pharmRef, ...pharmConstraints);
      const pharmSnapshot = await getDocs(q);
      
      let pharmData = pharmSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Pharmacy));
      
      if (searchName) {
        pharmData = pharmData.filter(p => p.name.toLowerCase().includes(searchName.toLowerCase()));
      }

      // Fetch Highlights
      const now = new Date().toISOString();
      const highQuery = query(collection(db, 'highlights'), where('date_start', '<=', now));
      const highSnapshot = await getDocs(highQuery);
      
      const highDataRaw = highSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(h => h.date_end >= now);
        
      const highData: Highlight[] = [];
      
      for (const h of highDataRaw) {
        if (searchCity && searchState) {
          if (h.city.toLowerCase() !== searchCity.toLowerCase() || 
              h.state.toLowerCase() !== searchState.toLowerCase()) {
            continue;
          }
        }

        const pDoc = await getDoc(doc(db, 'pharmacies', h.pharmacy_id));
        const p = pDoc.data();
        
        if (p && p.is_active === 1) {
          highData.push({ 
            ...h, 
            name: p.name, 
            phone: p.phone, 
            whatsapp: p.whatsapp, 
            street: p.street, 
            number: p.number, 
            neighborhood: p.neighborhood, 
            city: p.city, 
            state: p.state 
          });
        }
      }

      setHighlights(highData);
      setPharmacies(pharmData);
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

  const handleTrackClick = async (id: string, type: 'whatsapp' | 'map') => {
    try {
      await addDoc(collection(db, 'clicks'), {
        pharmacy_id: id,
        type,
        created_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error tracking click', err);
    }
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

import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  Phone, MessageCircle, MapPin, Clock, Globe, 
  ArrowLeft, Navigation, Star, ShieldCheck, 
  Share2, Info, ChevronRight, AlertCircle
} from 'lucide-react';
import { motion } from 'motion/react';
import { safeJsonFetch } from '../../lib/api';
import { isPharmacyOpen } from '../../lib/dateUtils';
import SEOHandler from '../../components/SEOHandler';
import { useToast } from '../../components/Toast';

interface Pharmacy {
  id: string;
  name: string;
  logo_url?: string;
  description?: string;
  phone: string;
  whatsapp: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  website?: string;
  coordinates?: { lat: number; lng: number };
  operating_hours?: any;
  on_call?: boolean;
  current_shift?: any;
}

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default function PharmacyView() {
  const { id } = useParams();
  const { showToast } = useToast();
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPharmacy = async () => {
      try {
        const data = await safeJsonFetch<Pharmacy>(`/api/public/pharmacies/${id}`);
        setPharmacy(data);
      } catch (err: any) {
        setError(err.message || 'Falha ao carregar dados da farmácia.');
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchPharmacy();
  }, [id]);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: pharmacy?.name,
        text: `Confira os horários e localização de ${pharmacy?.name} no Farmácias de Plantão!`,
        url: window.location.href,
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(window.location.href);
      showToast('Link copiado para a área de transferência!', 'success');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 font-medium">Carregando farmácia...</p>
        </div>
      </div>
    );
  }

  if (error || !pharmacy) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center border border-red-100">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Ops! Ocorreu um erro</h2>
          <p className="text-gray-500 mb-8">{error || 'Esta farmácia não pôde ser encontrada.'}</p>
          <Link to="/" className="inline-flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all">
            <ArrowLeft className="w-5 h-5" />
            Voltar para o Início
          </Link>
        </div>
      </div>
    );
  }

  const { open: isOpen, message: statusMsg } = isPharmacyOpen(pharmacy.operating_hours);
  const mapQuery = encodeURIComponent(`${pharmacy.street}, ${pharmacy.number}, ${pharmacy.neighborhood}, ${pharmacy.city}, ${pharmacy.state}`);

  return (
    <div className="min-h-screen bg-gray-50 pb-24 md:pb-12">
      <SEOHandler 
        title={`${pharmacy.name} - Endereço, Telefones e Horários`} 
        description={`Veja telefone, whatsapp, horário de funcionamento e localização no mapa de ${pharmacy.name} em ${pharmacy.city}, ${pharmacy.state}.`}
      />

      {/* Header / Cover Area */}
      <div className="bg-emerald-600 text-white pt-12 pb-24 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl opacity-50"></div>
        
        <div className="max-w-4xl mx-auto px-4 relative flex flex-col items-center text-center">
          <Link to={-1 as any} className="absolute left-4 top-0 p-2 bg-white/20 rounded-full hover:bg-white/30 transition-all">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <button onClick={handleShare} className="absolute right-4 top-0 p-2 bg-white/20 rounded-full hover:bg-white/30 transition-all">
            <Share2 className="w-6 h-6" />
          </button>

          <div className="w-24 h-24 bg-white rounded-3xl shadow-2xl flex items-center justify-center p-2 mb-6 border-4 border-emerald-500/20 active:scale-95 transition-all">
            {pharmacy.logo_url ? (
               <img src={pharmacy.logo_url} alt={pharmacy.name} className="w-full h-full object-contain" />
            ) : (
               <ShieldCheck className="w-12 h-12 text-emerald-500" />
            )}
          </div>

          <div className="flex items-center gap-2 mb-2">
            {pharmacy.on_call && (
               <span className="bg-orange-500 text-white text-[10px] font-black uppercase tracking-tighter px-2 py-0.5 rounded shadow-sm flex items-center gap-1">
                 <Star className="w-3 h-3 fill-current" />
                 DE PLANTÃO HOJE
               </span>
            )}
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded shadow-sm ${isOpen ? 'bg-white text-emerald-600' : 'bg-red-500 text-white'}`}>
              {statusMsg}
            </span>
          </div>

          <h1 className="text-3xl md:text-4xl font-black mb-2 tracking-tight">{pharmacy.name}</h1>
          <p className="text-emerald-50/80 font-medium flex items-center gap-1">
            <MapPin className="w-4 h-4" />
            {pharmacy.neighborhood}, {pharmacy.city} - {pharmacy.state}
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 -mt-12 relative z-10 space-y-6">
        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-emerald-100 flex items-center gap-4 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
              <Phone className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase">Telefone</p>
              <a href={`tel:${pharmacy.phone}`} className="text-lg font-bold text-gray-900 hover:text-blue-600 transition-colors">
                {pharmacy.phone}
              </a>
            </div>
          </div>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-emerald-100 flex items-center gap-4 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
              <MessageCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase">WhatsApp</p>
              <a href={`https://wa.me/55${pharmacy.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-lg font-bold text-gray-900 hover:text-emerald-600 transition-colors">
                {pharmacy.whatsapp}
              </a>
            </div>
          </div>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-emerald-100 flex items-center gap-4 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase">Website</p>
              {pharmacy.website ? (
                <a href={pharmacy.website} target="_blank" rel="noreferrer" className="text-sm font-bold text-gray-900 truncate block hover:text-purple-600 transition-colors">
                  Acessar Site Oficial
                </a>
              ) : (
                <p className="text-sm text-gray-400 font-medium">Não informado</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {/* Left Column: Details & Map */}
          <div className="md:col-span-3 space-y-6">
            <section className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-emerald-100">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Info className="w-5 h-5 text-emerald-500" />
                Sobre a Farmácia
              </h2>
              <div className="prose prose-sm text-gray-600 leading-relaxed">
                {pharmacy.description || `A ${pharmacy.name} atende a região de ${pharmacy.neighborhood} em ${pharmacy.city} com excelência e compromisso com sua saúde.`}
              </div>
            </section>

            <section className="bg-white p-4 rounded-3xl shadow-sm border border-emerald-100 overflow-hidden">
               <div className="mb-4 px-2 pt-2 flex justify-between items-center">
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-emerald-500" />
                    Localização
                  </h2>
                  <a 
                    href={`https://www.google.com/maps/dir/?api=1&destination=${mapQuery}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-xs font-bold text-emerald-600 flex items-center gap-1 hover:underline"
                  >
                    Rotas <Navigation className="w-3 h-3" />
                  </a>
               </div>
               <div className="aspect-video w-full rounded-2xl bg-gray-100 relative overflow-hidden group">
                  <iframe 
                    width="100%" 
                    height="100%" 
                    style={{ border: 0 }} 
                    loading="lazy" 
                    allowFullScreen 
                    src={`https://www.google.com/maps/embed/v1/place?key=${null}&q=${mapQuery}&zoom=17`}
                    className="opacity-90 group-hover:opacity-100 transition-opacity"
                  ></iframe>
                  {/* Overlay for map interaction info or just a visual hint */}
                  <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/20 text-white pointer-events-none">
                     <p className="text-xs font-medium">{pharmacy.street}, {pharmacy.number} - {pharmacy.neighborhood}</p>
                  </div>
               </div>
            </section>
          </div>

          {/* Right Column: Operating Hours */}
          <div className="md:col-span-2">
            <section className="bg-white rounded-3xl shadow-sm border border-emerald-100 flex flex-col h-full overflow-hidden">
               <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                  <h2 className="font-bold text-gray-900 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-emerald-500" />
                    Horários
                  </h2>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Aberto Hoje</span>
               </div>
               <div className="flex-1 p-2">
                 <div className="space-y-1">
                   {DAYS.map((day, idx) => {
                     const isToday = new Date().getDay() === idx;
                     const dayData = pharmacy.operating_hours?.[idx.toString()] || { open: '08:00', close: '22:00', closed: false };
                     
                     return (
                        <div 
                          key={day} 
                          className={`flex items-center justify-between p-3 rounded-2xl transition-all ${
                            isToday ? 'bg-emerald-50 ring-1 ring-emerald-200 shadow-sm' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`text-sm font-bold ${isToday ? 'text-emerald-700' : 'text-gray-600'}`}>{day}</span>
                            {isToday && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>}
                          </div>
                          <div className="text-right">
                             {dayData.closed ? (
                               <span className="text-xs font-bold text-red-400 uppercase">Fechado</span>
                             ) : (
                               <span className={`text-sm font-mono font-bold ${isToday ? 'text-emerald-600' : 'text-gray-500'}`}>
                                 {dayData.open} - {dayData.close}
                               </span>
                             )}
                          </div>
                        </div>
                     );
                   })}
                 </div>
               </div>
               <div className="p-4 bg-gray-50/50 mt-auto border-t border-gray-50">
                  <p className="text-[10px] text-gray-400 text-center font-medium">Os horários podem variar em feriados ou datas especiais.</p>
               </div>
            </section>
          </div>
        </div>
      </div>

      {/* Floating Action Bar (Mobile Only) */}
      <motion.div 
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        className="fixed bottom-0 inset-x-0 bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.08)] border-t border-gray-100 p-4 z-50 md:hidden flex gap-3"
      >
        <a 
          href={`tel:${pharmacy.phone}`}
          className="flex-1 bg-gray-100 text-gray-700 py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <Phone className="w-5 h-5" />
          Ligar
        </a>
        <a 
          href={`https://wa.me/55${pharmacy.whatsapp.replace(/\D/g, '')}`}
          target="_blank"
          rel="noreferrer"
          className="flex-[2] bg-emerald-600 text-white py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 active:scale-95 transition-all"
        >
          <MessageCircle className="w-5 h-5" />
          WhatsApp
        </a>
      </motion.div>
    </div>
  );
}

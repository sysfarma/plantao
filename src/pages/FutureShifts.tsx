import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Clock, Calendar, Store, MapPin, Phone, Plus } from 'lucide-react';
import { formatToBRDate } from '../lib/dateUtils';
import { doc, getDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firebaseError';
import { Link } from 'react-router-dom';

export default function FutureShifts() {
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [daysCount, setDaysCount] = useState(7);
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const canRegister = user.role === 'admin' || user.role === 'pharmacy';
  const dashboardLink = user.role === 'admin' ? '/admin?tab=shifts' : '/pharmacy?tab=shifts';

  useEffect(() => {
    const fetchShifts = async () => {
      setLoading(true);
      try {
        // Fetch config for days count
        const configDoc = await getDoc(doc(db, 'config', 'general'));
        let showDays = 7;
        if (configDoc.exists()) {
          showDays = configDoc.data().future_shifts_days || 7;
        }
        setDaysCount(showDays);

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        
        const futureLimit = new Date(tomorrow);
        futureLimit.setDate(tomorrow.getDate() + showDays - 1);
        futureLimit.setHours(23, 59, 59, 999);

        // Get shifts within range
        const q = query(
          collection(db, 'shifts'),
          where('date', '>=', tomorrow.toISOString().split('T')[0]),
          where('date', '<=', futureLimit.toISOString().split('T')[0]),
          orderBy('date', 'asc')
        );

        const snapshot = await getDocs(q);
        const shiftsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        // Fetch pharmacies info for these shifts
        const pharmacyIds = [...new Set(shiftsData.map((s: any) => s.pharmacy_id))];
        const pharms: Record<string, any> = {};
        
        if (pharmacyIds.length > 0) {
          // Firebase 'in' limit is 10, so we might need chunks if many pharms
          // For simplicity here assume not too many distinct pharms in next 7 days
          const pharmSnapshot = await getDocs(query(collection(db, 'pharmacies'), where('__name__', 'in', pharmacyIds.slice(0, 10))));
          pharmSnapshot.forEach(doc => {
            pharms[doc.id] = doc.data();
          });
        }

        const consolidated = shiftsData.map((s: any) => ({
          ...s,
          pharmacy: pharms[s.pharmacy_id] || { name: 'Farmácia Desconhecida' }
        }));

        setShifts(consolidated);
      } catch (error) {
        console.error('Error fetching future shifts:', error);
        handleFirestoreError(error, OperationType.LIST, 'shifts');
      } finally {
        setLoading(false);
      }
    };

    fetchShifts();
  }, []);

  if (loading) return <div className="p-8 text-center text-emerald-600">Carregando próximos plantões...</div>;

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-100 rounded-2xl text-emerald-600">
            <Calendar className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Próximos Plantões</h1>
            <p className="text-gray-500 font-medium">Programação para os próximos {daysCount} dias</p>
          </div>
        </div>
        {canRegister && (
          <Link 
            to={dashboardLink}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200 order-first sm:order-last"
          >
            <Plus className="w-5 h-5" />
            Cadastrar Plantões
          </Link>
        )}
      </div>

      {shifts.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center shadow-sm border border-gray-100">
          <Clock className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Sem plantões programados</h2>
          <p className="text-gray-500">Não encontramos plantões cadastrados para este período.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {shifts.map((shift) => (
            <div key={shift.id} className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-center justify-center w-20 h-20 bg-emerald-50 rounded-2xl text-emerald-700">
                    <span className="text-xs font-bold uppercase tracking-wider">{new Date(shift.date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short' })}</span>
                    <span className="text-2xl font-black">{new Date(shift.date + 'T00:00:00').getDate()}</span>
                    <span className="text-xs font-bold uppercase tracking-wider">{new Date(shift.date + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'short' })}</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                      <Store className="w-5 h-5 text-emerald-600" />
                      {shift.pharmacy.name}
                    </h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-500 font-medium">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {shift.pharmacy.city}/{shift.pharmacy.state}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {shift.is_24h ? '24 Horas' : `${shift.start_time} às ${shift.end_time}`}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {shift.pharmacy.phone && (
                    <a 
                      href={`tel:${shift.pharmacy.phone}`}
                      className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-bold rounded-2xl hover:bg-gray-200 transition-colors"
                    >
                      <Phone className="w-4 h-4" />
                      Ligar
                    </a>
                  )}
                  {shift.pharmacy.whatsapp && (
                    <a 
                      href={`https://wa.me/55${shift.pharmacy.whatsapp.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200"
                    >
                      WhatsApp
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, AlertCircle, QrCode, CreditCard, Star, Edit, Calendar, Plus, Trash2, TrendingUp, Zap, RefreshCw, X } from 'lucide-react';
import PixPaymentManager from '../../components/PixPaymentManager';
import CardPaymentForm from '../../components/CardPaymentForm';
import CancelSubscriptionModal from '../../components/CancelSubscriptionModal';
import { isShiftPast, formatToBRDate } from '../../lib/dateUtils';
import { safeJsonFetch } from '../../lib/api';
import { getAuthToken } from '../../lib/firebase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { collection, doc, addDoc, updateDoc, deleteDoc, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firebaseError';

export default function PharmacyDashboard() {
  const [profile, setProfile] = useState<any>(null);
  const [highlights, setHighlights] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [reports, setReports] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'overview';
  const [activeTab, setActiveTab] = useState(initialTab);

  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const rawAdmin = import.meta.env.VITE_ADMIN_EMAIL;
  const adminEmail = rawAdmin ? rawAdmin.replace(/['"]/g, '').trim() : 'sys.farmaciasdeplantao@gmail.com';
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdminMaster = user.email === 'sys.farmaciasdeplantao@gmail.com' || (adminEmail && user.email === adminEmail);

  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [shiftForm, setShiftForm] = useState({ date: '', start_time: '07:00', end_time: '22:00', is_24h: false });
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);

  const [isUpdateCardModalOpen, setIsUpdateCardModalOpen] = useState(false);
  const [updatingCard, setUpdatingCard] = useState(false);
  const [cardUpdateSuccess, setCardUpdateSuccess] = useState(false);

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  const handleUpdateCard = async (token: string, paymentData: any) => {
    setUpdatingCard(true);
    setCardUpdateSuccess(false);
    try {
      const authToken = await getAuthToken();
      if (!authToken) throw new Error('Usuário não autenticado');

      const result = await safeJsonFetch('/api/subscriptions/update-card', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ card_token: token })
      });

      if (result.success) {
        setCardUpdateSuccess(true);
        setTimeout(() => setIsUpdateCardModalOpen(false), 3000);
      } else {
        throw new Error(result.error || 'Erro ao atualizar o cartão');
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao processar atualização do cartão');
    } finally {
      setUpdatingCard(false);
    }
  };

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'pharmacies'), where('user_id', '==', user.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const pDoc = snapshot.docs[0];
        const pData = pDoc.data();
        setProfile((prev: any) => ({ ...prev, id: pDoc.id, ...pData }));
        setEditForm((prev: any) => ({ ...prev, id: pDoc.id, ...pData }));
      } else {
        setProfile(null);
        setLoading(false);
      }
    }, (error) => {
      console.error('Error in pharmacy listener', error);
      setLoading(false);
    });

    return () => unsub();
  }, [auth.currentUser]);

  useEffect(() => {
    if (!profile?.id) return;

    const pharmacyId = profile.id;
    const userId = auth.currentUser?.uid;

    // We filter by pharmacy_id AND user_id (where possible) to be rule-safe and performant
    // Sensitive data listeners
    const unsubSubs = onSnapshot(query(collection(db, 'subscriptions'), where('pharmacy_id', '==', pharmacyId)), (snapshot) => {
      const subs = snapshot.docs.map(d => d.data());
      if (subs.length > 0) {
        subs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setProfile((prev: any) => ({ ...prev, subscription: subs[0] }));
      }
    });

    const unsubHigh = onSnapshot(query(collection(db, 'highlights'), where('pharmacy_id', '==', pharmacyId)), (snapshot) => {
      setHighlights(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubPay = onSnapshot(query(collection(db, 'payments'), where('pharmacy_id', '==', pharmacyId)), (snapshot) => {
      setPayments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubShifts = onSnapshot(query(collection(db, 'shifts'), where('pharmacy_id', '==', pharmacyId)), (snapshot) => {
      setShifts(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubClicks = onSnapshot(query(
      collection(db, 'clicks'), 
      where('pharmacy_id', '==', pharmacyId)
    ), (snapshot) => {
      const dailyClicks: Record<string, { date: string, whatsapp: number, map: number }> = {};
      snapshot.forEach(doc => {
        const click = doc.data();
        const date = new Date(click.created_at).toLocaleDateString('pt-BR');
        if (!dailyClicks[date]) {
          dailyClicks[date] = { date, whatsapp: 0, map: 0 };
        }
        if (click.type === 'whatsapp') dailyClicks[date].whatsapp++;
        if (click.type === 'map') dailyClicks[date].map++;
      });
      setReports({ dailyClicks: Object.values(dailyClicks) });
      setLoading(false);
    }, (error) => {
      console.error('Error in clicks listener', error);
      // Fallback for permissions if not master
      if (!isAdminMaster) {
        setReports({ dailyClicks: [] });
      }
      setLoading(false);
    });

    return () => {
      unsubSubs();
      unsubHigh();
      unsubPay();
      unsubShifts();
      unsubClicks();
    };
  }, [profile?.id]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { name, phone, whatsapp, street, number, neighborhood, city, state } = editForm;
      await updateDoc(doc(db, 'pharmacies', profile.id), {
        name, phone, whatsapp, street, number, neighborhood, city, state,
        updated_at: new Date().toISOString()
      });
      alert('Perfil atualizado com sucesso!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `pharmacies/${profile.id}`);
      alert('Erro ao salvar perfil.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const user = auth.currentUser;
      const shiftData = {
        pharmacy_id: profile.id,
        user_id: user?.uid, // Include owner_id for optimized security rules
        date: shiftForm.date,
        start_time: shiftForm.is_24h ? '00:00' : shiftForm.start_time,
        end_time: shiftForm.is_24h ? '23:59' : shiftForm.end_time,
        is_24h: shiftForm.is_24h ? 1 : 0,
        updated_at: new Date().toISOString()
      };
      
      if (editingShiftId) {
        await updateDoc(doc(db, 'shifts', editingShiftId), {
          ...shiftData,
          updated_at: new Date().toISOString()
        });
      } else {
        await addDoc(collection(db, 'shifts'), {
          ...shiftData,
          created_at: new Date().toISOString()
        });
      }
      
      setIsShiftModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, editingShiftId ? OperationType.UPDATE : OperationType.CREATE, `shifts/${editingShiftId || ''}`);
      alert('Erro ao salvar plantão.');
    }
  };

  const handleDeleteShift = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este plantão?')) return;
    try {
      await deleteDoc(doc(db, 'shifts', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `shifts/${id}`);
    }
  };

  const openNewShiftModal = () => {
    setEditingShiftId(null);
    setShiftForm({ date: '', start_time: '07:00', end_time: '22:00', is_24h: false });
    setIsShiftModalOpen(true);
  };

  const openEditShiftModal = (shift: any) => {
    setEditingShiftId(shift.id);
    setShiftForm({
      date: shift.date,
      start_time: shift.start_time,
      end_time: shift.end_time,
      is_24h: shift.is_24h === 1
    });
    setIsShiftModalOpen(true);
  };

  if (loading) return <div className="p-8">Carregando...</div>;
  if (!profile) return <div className="p-8">Erro ao carregar perfil.</div>;

  const isPending = profile.subscription?.status === 'pending';
  const isPaused = profile.subscription?.status === 'paused' || profile.sub_status === 'paused';
  const isSuspended = profile.subscription?.status === 'suspended' || profile.sub_status === 'suspended';
  const isActive = profile.is_active === 1;

  return (
    <div className="p-4 md:p-8 w-full mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Painel da Farmácia</h1>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-8">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          {['overview', 'metrics', 'edit', 'shifts', 'highlights', 'history']
            .filter(tab => tab !== 'metrics' || isAdminMaster)
            .map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`${
                activeTab === tab
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm capitalize`}
            >
              {tab === 'overview' && 'Visão Geral'}
              {tab === 'metrics' && 'Métricas'}
              {tab === 'edit' && 'Editar Perfil'}
              {tab === 'shifts' && 'Cadastro de Plantões'}
              {tab === 'highlights' && 'Meus Destaques'}
              {tab === 'history' && 'Histórico de Pagamentos'}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* Subscription Status */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4">Status da Assinatura</h2>
            
            {isActive ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col md:flex-row md:items-center gap-4 text-emerald-700 bg-emerald-50 p-4 rounded-lg">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <CheckCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">Assinatura Ativa</p>
                      <p className="text-sm break-words">Sua farmácia está visível nas buscas. Expira em: {new Date(profile.subscription?.expires_at).toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                    <button 
                      onClick={() => setIsUpdateCardModalOpen(true)}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-emerald-200 text-emerald-700 bg-emerald-100/50 rounded-lg hover:bg-emerald-100 transition-colors text-sm font-bold flex-1 sm:flex-none whitespace-nowrap"
                    >
                      <CreditCard className="w-4 h-4 flex-shrink-0" />
                       Atualizar Cartão
                    </button>
                    <Link 
                      to="/pharmacy/pricing" 
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-emerald-200 text-emerald-700 bg-emerald-100/50 rounded-lg hover:bg-emerald-100 transition-colors text-sm font-bold flex-1 sm:flex-none whitespace-nowrap"
                    >
                      <RefreshCw className="w-4 h-4 flex-shrink-0" />
                      Mudar Plano
                    </Link>
                  </div>
                </div>
                <div className="pt-2 text-center md:text-right border-t border-gray-100">
                  <button 
                    onClick={() => setIsCancelModalOpen(true)}
                    className="inline-flex items-center justify-center gap-2 text-sm font-medium text-gray-500 hover:text-red-600 transition-colors py-2 px-4 rounded-lg hover:bg-red-50 w-full sm:w-auto"
                  >
                    <Trash2 className="w-4 h-4" />
                    Cancelar Assinatura
                  </button>
                </div>
              </div>
            ) : isPaused || isSuspended ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row md:items-center gap-4 text-amber-800 bg-amber-50 p-4 rounded-lg border border-amber-200">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <AlertCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {isPaused ? 'Assinatura Pausada' : 'Assinatura Suspensa (Falha no Cartão)'}
                      </p>
                      <p className="text-sm break-words">
                        {isPaused 
                          ? 'Sua assinatura foi pausada. Ela precisa ser reativada para sua farmácia voltar ao mapa.'
                          : 'Identificamos uma falha no processamento da última cobrança no seu cartão de crédito.'}
                      </p>
                    </div>
                  </div>
                  {isSuspended && (
                    <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                      <button 
                        onClick={() => setIsUpdateCardModalOpen(true)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-amber-300 text-amber-800 bg-amber-100 rounded-lg hover:bg-amber-200 transition-colors text-sm font-bold flex-1 sm:flex-none whitespace-nowrap"
                      >
                        <CreditCard className="w-4 h-4 flex-shrink-0" />
                        Atualizar Cartão
                      </button>
                    </div>
                  )}
                </div>
                
                <Link 
                  to="/pharmacy/pricing" 
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  <RefreshCw className="w-5 h-5 flex-shrink-0" />
                  Regularizar Assinatura
                </Link>
                {!isPaused && (
                  <div className="pt-2 text-center md:text-right border-t border-gray-100">
                    <button 
                      onClick={() => setIsCancelModalOpen(true)}
                      className="inline-flex items-center justify-center gap-2 text-sm font-medium text-gray-500 hover:text-red-600 transition-colors py-2 px-4 rounded-lg hover:bg-red-50 w-full sm:w-auto"
                    >
                      <Trash2 className="w-4 h-4" />
                      Cancelar assinatura
                    </button>
                  </div>
                )}
              </div>
            ) : isPending ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 text-amber-700 bg-amber-50 p-4 rounded-lg">
                  <AlertCircle className="w-6 h-6" />
                  <div>
                    <p className="font-medium">Pagamento Pendente</p>
                    <p className="text-sm">Realize o pagamento para ativar sua conta e aparecer nas buscas.</p>
                  </div>
                </div>
                
                <Link 
                  to="/pharmacy/pricing" 
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  <CreditCard className="w-5 h-5" />
                  Assinar Plano Premium
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 text-red-700 bg-red-50 p-4 rounded-lg">
                  <AlertCircle className="w-6 h-6" />
                  <div>
                    <p className="font-medium">Assinatura Expirada</p>
                    <p className="text-sm">Sua farmácia não está mais visível para os clientes.</p>
                  </div>
                </div>
                
                <Link 
                  to="/pharmacy/pricing" 
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  <Zap className="w-5 h-5" />
                  Renovar Assinatura Agora
                </Link>
              </div>
            )}
          </div>

          {/* Profile Data */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4">Dados Cadastrais</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-500">Nome da Farmácia</p>
                <p className="font-medium">{profile.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Telefone</p>
                <p className="font-medium">{profile.phone}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">WhatsApp</p>
                <p className="font-medium">{profile.whatsapp}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Endereço</p>
                <p className="font-medium">{profile.street}, {profile.number} - {profile.neighborhood}</p>
                <p className="font-medium">{profile.city}/{profile.state}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'metrics' && isAdminMaster && reports?.dailyClicks && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp className="w-6 h-6 text-emerald-600" />
              <h2 className="text-lg font-semibold text-gray-900">Engajamento de Clientes (Últimos 30 dias)</h2>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reports.dailyClicks} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: '#f3f4f6' }} />
                  <Legend />
                  <Bar dataKey="whatsapp" name="Cliques no WhatsApp" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="map" name="Cliques no Mapa" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'edit' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-6">Editar Perfil</h2>
          <form onSubmit={handleSaveProfile} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Nome da Farmácia</label>
                <input type="text" value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Telefone</label>
                <input type="text" value={editForm.phone || ''} onChange={e => setEditForm({...editForm, phone: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">WhatsApp</label>
                <input type="text" value={editForm.whatsapp || ''} onChange={e => setEditForm({...editForm, whatsapp: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Rua</label>
                <input type="text" value={editForm.street || ''} onChange={e => setEditForm({...editForm, street: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Número</label>
                <input type="text" value={editForm.number || ''} onChange={e => setEditForm({...editForm, number: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Bairro</label>
                <input type="text" value={editForm.neighborhood || ''} onChange={e => setEditForm({...editForm, neighborhood: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Cidade</label>
                <input type="text" value={editForm.city || ''} onChange={e => setEditForm({...editForm, city: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Estado</label>
                <input type="text" value={editForm.state || ''} onChange={e => setEditForm({...editForm, state: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md uppercase" maxLength={2} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">CEP</label>
                <input type="text" value={editForm.cep || ''} onChange={e => setEditForm({...editForm, cep: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="00000-000" />
              </div>
            </div>
            <button type="submit" disabled={saving} className="bg-emerald-600 text-white px-6 py-2 rounded-md font-medium hover:bg-emerald-700 disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'shifts' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Cadastro de Plantões</h2>
              <p className="text-sm text-gray-500">Gerencie os dias em que sua farmácia estará de plantão.</p>
            </div>
            <button onClick={openNewShiftModal} className="bg-emerald-600 text-white px-4 py-2 rounded-md font-medium hover:bg-emerald-700 flex items-center gap-2">
              <Plus className="w-5 h-5" /> Novo Plantão
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {shifts.length === 0 ? (
              <div className="p-8 text-center text-gray-500">Nenhum plantão cadastrado.</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Horário</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {shifts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((shift) => {
                    const isPast = isShiftPast(shift.date);
                    return (
                      <tr key={shift.id} className={isPast ? 'bg-gray-50' : ''}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {formatToBRDate(shift.date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {shift.is_24h ? '24 Horas' : `${shift.start_time} às ${shift.end_time}`}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {isPast ? (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                              Finalizado (Histórico)
                            </span>
                          ) : (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-emerald-100 text-emerald-800">
                              Ativo
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                          <button onClick={() => openEditShiftModal(shift)} className="text-blue-600 hover:text-blue-900 bg-blue-50 px-3 py-1 rounded inline-flex items-center gap-1">
                            <Edit className="w-4 h-4" /> Editar
                          </button>
                          <button onClick={() => handleDeleteShift(shift.id)} className="text-red-600 hover:text-red-900 bg-red-50 px-3 py-1 rounded inline-flex items-center gap-1">
                            <Trash2 className="w-4 h-4" /> Excluir
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Modal de Plantão */}
      {isShiftModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">
                {editingShiftId ? 'Editar Plantão' : 'Novo Plantão'}
              </h2>
              <button onClick={() => setIsShiftModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                &times;
              </button>
            </div>
            <form onSubmit={handleSaveShift} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Data do Plantão</label>
                <input 
                  type="date" 
                  required 
                  value={shiftForm.date || ''} 
                  onChange={e => setShiftForm({...shiftForm, date: e.target.value})} 
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" 
                />
              </div>
              
              <div className="flex items-center gap-2 mt-4 mb-4">
                <input 
                  type="checkbox" 
                  id="is_24h" 
                  checked={shiftForm.is_24h || false} 
                  onChange={e => setShiftForm({...shiftForm, is_24h: e.target.checked})} 
                  className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                />
                <label htmlFor="is_24h" className="text-sm font-medium text-gray-700">Plantão 24 Horas</label>
              </div>

              {!shiftForm.is_24h && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Hora Início</label>
                    <input 
                      type="time" 
                      required={!shiftForm.is_24h} 
                      value={shiftForm.start_time || ''} 
                      onChange={e => setShiftForm({...shiftForm, start_time: e.target.value})} 
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Hora Fim</label>
                    <input 
                      type="time" 
                      required={!shiftForm.is_24h} 
                      value={shiftForm.end_time || ''} 
                      onChange={e => setShiftForm({...shiftForm, end_time: e.target.value})} 
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" 
                    />
                  </div>
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsShiftModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700">
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'highlights' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-6">Meus Destaques</h2>
          {highlights.length === 0 ? (
            <p className="text-gray-500">Você não possui destaques programados no momento.</p>
          ) : (
            <div className="space-y-4">
              {highlights.map((h, i) => (
                <div key={i} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Star className="w-5 h-5 text-amber-500" />
                    <div>
                      <p className="font-medium capitalize">Destaque do {h.type === 'day' ? 'Dia' : h.type === 'week' ? 'Semana' : 'Mês'}</p>
                      <p className="text-sm text-gray-500">
                        De: {new Date(h.date_start).toLocaleDateString('pt-BR')} até {new Date(h.date_end).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-medium">
                    {new Date(h.date_end) > new Date() ? 'Ativo' : 'Expirado'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-6">Histórico de Pagamentos</h2>
          {payments.length === 0 ? (
            <p className="text-gray-500">Nenhum pagamento registrado.</p>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Método</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {payments.map((p, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 text-sm text-gray-900">{new Date(p.created_at).toLocaleDateString('pt-BR')}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">R$ {p.amount.toFixed(2).replace('.', ',')}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{p.method}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Pago</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {/* Update Card Modal */}
      {isUpdateCardModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden relative">
            <button 
              onClick={() => setIsUpdateCardModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 z-10"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Atualizar Cartão de Crédito</h2>
              {cardUpdateSuccess ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Cartão Atualizado!</h3>
                  <p className="text-gray-500 mt-2">Suas próximas mensalidades serão cobradas neste novo cartão.</p>
                </div>
              ) : (
                <CardPaymentForm 
                  amount={0} 
                  onSuccess={handleUpdateCard} 
                  loading={updatingCard}
                  isUpdate={true} 
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Subscription Modal */}
      {isCancelModalOpen && (
        <CancelSubscriptionModal
          onClose={() => setIsCancelModalOpen(false)}
          onSuccess={() => {
            setIsCancelModalOpen(false);
            window.location.reload();
          }}
          pharmacyName={profile.name}
        />
      )}
    </div>
  );
}

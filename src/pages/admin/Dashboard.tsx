import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle, Star, Trash2, Ban, Edit, Plus, X, Calendar, Search, Filter, History, DollarSign, FileText, RefreshCw, ShieldCheck, AlertCircle, CheckCircle2, Download } from 'lucide-react';
import { safeJsonFetch } from '../../lib/api';
import { calculateHighlightEnd, isShiftPast, formatToBRDate } from '../../lib/dateUtils';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, query, where, setDoc } from 'firebase/firestore';
import { db, auth, getAuthToken } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firebaseError';

interface Pharmacy {
  id: string;
  name: string;
  city: string;
  state: string;
  is_active: number;
  user_email: string;
  sub_status: string;
  phone: string;
  whatsapp: string;
  street: string;
  number: string;
  neighborhood: string;
  user_id?: string;
}

export default function AdminDashboard() {
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [reports, setReports] = useState<any>(null);
  const [adminShifts, setAdminShifts] = useState<any[]>([]);
  const [adminHighlights, setAdminHighlights] = useState<any[]>([]);
  const [adminSubscribers, setAdminSubscribers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'pharmacies';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<any>(null);
  const [subFormData, setSubFormData] = useState<any>({});
  const [config, setConfig] = useState({ public_key: '', access_token: '', test_mode: false });
  const [generalConfig, setGeneralConfig] = useState({ 
    whatsapp_support: '5500000000000', 
    future_shifts_days: 7, 
    whatsapp_active: true,
    support_email: 'contato@farmaciasdeplantao.app.br',
    support_phone: '(00) 00000-0000'
  });
  const [subscriptionPlans, setSubscriptionPlans] = useState<any>({
    monthly: { active: true, price: 6.90, title: 'Plano Mensal', frequency: 1, frequency_type: 'months', benefits: [] },
    annual: { active: true, price: 69.96, title: 'Plano Anual', frequency: 1, frequency_type: 'years', benefits: [] }
  });
  const [savingPlans, setSavingPlans] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingMP, setTestingMP] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [editingPharmacy, setEditingPharmacy] = useState<Pharmacy | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [subSearchTerm, setSubSearchTerm] = useState('');
  const [subStatusFilter, setSubStatusFilter] = useState('all');
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historySub, setHistorySub] = useState<any>(null);
  const [subPayments, setSubPayments] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
  const isAdminMaster = adminEmail && user.email === adminEmail;

  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [shiftForm, setShiftForm] = useState({ pharmacy_id: '', date: '', start_time: '07:00', end_time: '22:00', is_24h: false });
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);

  const openCreateModal = () => {
    setEditingPharmacy(null);
    setFormData({
      email: '', password: '', name: '', phone: '', whatsapp: '',
      street: '', number: '', neighborhood: '', city: '', state: '', cep: ''
    });
    setIsModalOpen(true);
  };

  const openEditModal = (pharmacy: Pharmacy) => {
    setEditingPharmacy(pharmacy);
    setFormData(pharmacy);
    setIsModalOpen(true);
  };

  const handleSavePharmacy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = await getAuthToken();
      if (editingPharmacy) {
        const res = await fetch(`/api/admin/pharmacies/${editingPharmacy.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(formData)
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Erro ao atualizar farmácia');
        }
      } else {
        const res = await fetch('/api/admin/pharmacies', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(formData)
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Erro ao criar farmácia');
        }
      }
      setIsModalOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Error saving pharmacy', error);
      alert(error.message || 'Erro ao salvar farmácia');
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();

      if (!token) {
        window.location.href = '/login';
        return;
      }

      const safeFetch = async (url: string) => {
        return safeJsonFetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      };

      // Fetch optimized pharmacies list
      const pharmData = await safeFetch('/api/admin/pharmacies');
      if (typeof pharmData === 'string') throw new Error('Falha ao obter lista de farmácias (resposta não-JSON)');
      setPharmacies(pharmData);
      
      // Fetch Config
      const configDoc = await getDoc(doc(db, 'config', 'mercadopago'));
      if (configDoc.exists()) {
        const data = configDoc.data();
        setConfig({
          public_key: data?.public_key || '',
          access_token: data?.access_token || '',
          test_mode: data?.test_mode || false
        });
      }

      // Fetch General Config
      const generalDoc = await getDoc(doc(db, 'config', 'general'));
      if (generalDoc.exists()) {
        const data = generalDoc.data();
        setGeneralConfig({
          whatsapp_support: data?.whatsapp_support || '5500000000000',
          future_shifts_days: data?.future_shifts_days || 7,
          whatsapp_active: data?.whatsapp_active ?? true,
          support_email: data?.support_email || 'contato@farmaciasdeplantao.app.br',
          support_phone: data?.support_phone || '(00) 00000-0000'
        });
      }
      
      // Fetch Plans
      const plansData = await safeFetch('/api/admin/subscription-plans');
      if (typeof plansData !== 'string') {
        setSubscriptionPlans(plansData);
      }
      
      // Fetch Shifts optimized from backend
      const shiftsData = await safeFetch('/api/admin/shifts');
      if (typeof shiftsData === 'string') throw new Error('Falha ao obter plantões (resposta não-JSON)');
      setAdminShifts(shiftsData);
      
      // Fetch Subscribers
      const subsData = await safeFetch('/api/admin/subscriptions');
      if (typeof subsData !== 'string') {
        setAdminSubscribers(subsData);
      }
      
      // Fetch Highlights (using pharmData to avoid N+1)
      const highSnapshot = await getDocs(collection(db, 'highlights'));
      const highData = highSnapshot.docs.map(hDoc => {
        const h = hDoc.data();
        const pharm = pharmData.find((p: any) => p.id === h.pharmacy_id);
        return {
          id: hDoc.id,
          ...h,
          pharmacy_name: pharm ? pharm.name : 'Desconhecida'
        };
      });
      setAdminHighlights(highData);
      
      // Fetch Reports optimized from backend
      const reportsData = await safeFetch('/api/admin/reports');
      if (typeof reportsData === 'string') throw new Error('Falha ao obter relatórios (resposta não-JSON)');
      setReports(reportsData);

      // Fetch Audit Logs if Master Admin
      if (isAdminMaster) {
        const auditLogSnapshot = await getDocs(collection(db, 'audit_logs'));
        const logs = auditLogSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort newest first
        logs.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setAuditLogs(logs);
      }
      
    } catch (error) {
      console.error('Dashboard fetchData error:', error);
      handleFirestoreError(error, OperationType.GET, 'multiple');
      alert('Erro ao carregar dados do painel: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncData = async () => {
    setIsSyncing(true);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/admin/sync-data', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Erro ao sincronizar dados');
      alert('Sistema sincronizado e otimizado com sucesso!');
      fetchData();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const addNewPlan = () => {
    const slug = prompt('Informe um identificador único para o plano (ex: semestral, vip_extra):');
    if (!slug) return;
    
    // Quick validation for slug
    const cleanSlug = slug.toLowerCase().trim().replace(/\s+/g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (subscriptionPlans[cleanSlug]) {
      alert('Este identificador já existe!');
      return;
    }

    setSubscriptionPlans({
      ...subscriptionPlans,
      [cleanSlug]: {
        title: 'Novo Plano',
        price: 0,
        active: false,
        frequency: 1,
        frequency_type: 'months',
        benefits: []
      }
    });
  };

  const filteredSubscribers = useMemo(() => {
    return adminSubscribers.filter(sub => {
      const lowerSearch = subSearchTerm.toLowerCase();
      const matchesSearch = 
        (sub.pharmacy_name?.toLowerCase().includes(lowerSearch)) ||
        (sub.pharmacy_email?.toLowerCase().includes(lowerSearch));
      
      const matchesStatus = subStatusFilter === 'all' || 
        (subStatusFilter === 'active' && (sub.status === 'active' || sub.status === 'authorized')) ||
        (subStatusFilter === 'pending' && sub.status === 'pending') ||
        (subStatusFilter === 'cancelled' && sub.status === 'cancelled') ||
        (subStatusFilter === 'expired' && sub.status === 'expired');

      return matchesSearch && matchesStatus;
    });
  }, [adminSubscribers, subSearchTerm, subStatusFilter]);

  const handleExportCSV = () => {
    const headers = ['Nome', 'E-mail', 'Plano', 'Valor', 'Status', 'Data Expiração'];
    
    const rows = filteredSubscribers.map(sub => {
      const nome = sub.pharmacy_name || '';
      const email = sub.pharmacy_email || '';
      const plano = sub.plan_type === 'annual' ? 'Anual' : 'Mensal';
      const valor = sub.amount !== undefined ? sub.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00';
      
      let status = sub.status || '';
      if (status === 'active' || status === 'authorized') status = 'Ativa';
      else if (status === 'cancelled') status = 'Cancelada';
      else if (status === 'expired') status = 'Expirada';
      else if (status === 'pending') status = 'Pendente';

      const expDate = sub.expires_at ? new Date(sub.expires_at).toLocaleDateString('pt-BR') : 'N/A';

      // Quote strings just in case commas are present
      return [
        `"${nome.replace(/"/g, '""')}"`,
        `"${email.replace(/"/g, '""')}"`,
        `"${plano}"`,
        `"${valor}"`,
        `"${status}"`,
        `"${expDate}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `assinantes_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleViewHistory = async (sub: any) => {
    setHistorySub(sub);
    setIsHistoryModalOpen(true);
    setLoadingHistory(true);
    try {
      const token = await getAuthToken();
      const data = await safeJsonFetch(`/api/admin/pharmacies/${sub.pharmacy_id}/payments`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setSubPayments(data || []);
    } catch (error) {
      console.error('Error fetching payments:', error);
      alert('Erro ao carregar histórico de pagamentos');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openNewShiftModal = () => {
    setEditingShiftId(null);
    setShiftForm({ pharmacy_id: pharmacies[0]?.id || '', date: '', start_time: '07:00', end_time: '22:00', is_24h: false });
    setIsShiftModalOpen(true);
  };

  const openEditShiftModal = (shift: any) => {
    setEditingShiftId(shift.id);
    setShiftForm({
      pharmacy_id: shift.pharmacy_id,
      date: shift.date,
      start_time: shift.start_time,
      end_time: shift.end_time,
      is_24h: shift.is_24h === 1
    });
    setIsShiftModalOpen(true);
  };

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const shiftData = {
        pharmacy_id: shiftForm.pharmacy_id,
        date: shiftForm.date,
        start_time: shiftForm.is_24h ? '00:00' : shiftForm.start_time,
        end_time: shiftForm.is_24h ? '23:59' : shiftForm.end_time,
        is_24h: shiftForm.is_24h ? 1 : 0,
        updated_at: new Date().toISOString()
      };
      
      if (editingShiftId) {
        await updateDoc(doc(db, 'shifts', editingShiftId), shiftData);
      } else {
        await addDoc(collection(db, 'shifts'), {
          ...shiftData,
          created_at: new Date().toISOString()
        });
      }
      
      setIsShiftModalOpen(false);
      fetchData();
    } catch (error) {
      handleFirestoreError(error, editingShiftId ? OperationType.UPDATE : OperationType.CREATE, `shifts/${editingShiftId || ''}`);
      alert('Erro ao salvar plantão.');
    }
  };

  const handleDeleteShift = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este plantão?')) return;
    try {
      await deleteDoc(doc(db, 'shifts', id));
      fetchData();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `shifts/${id}`);
    }
  };

  const handleDeleteHighlight = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja remover este destaque?')) return;
    try {
      await deleteDoc(doc(db, 'highlights', id));
      fetchData();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `highlights/${id}`);
      alert('Erro ao remover destaque.');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      const token = await getAuthToken();
      await safeJsonFetch(`/api/admin/pharmacies/${id}/activate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchData();
    } catch (error: any) {
      console.error('Error activating', error);
      alert(error.message || 'Erro ao ativar farmácia.');
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja desativar esta farmácia?')) return;
    try {
      const token = await getAuthToken();
      await safeJsonFetch(`/api/admin/pharmacies/${id}/deactivate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchData();
    } catch (error: any) {
      console.error('Error deactivating', error);
      alert(error.message || 'Erro ao desativar farmácia.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja EXCLUIR esta farmácia permanentemente?')) return;
    try {
      const token = await getAuthToken();
      await safeJsonFetch(`/api/admin/pharmacies/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchData();
    } catch (error: any) {
      console.error('Error deleting', error);
      alert(error.message || 'Erro ao excluir farmácia.');
    }
  };

  const handleSetHighlight = async (id: string, type: 'day' | 'week' | 'month', city: string, state: string) => {
    try {
      const now = new Date();
      const end = calculateHighlightEnd(type);

      await addDoc(collection(db, 'highlights'), {
        pharmacy_id: id,
        type,
        date_start: now.toISOString(),
        date_end: end.toISOString(),
        city,
        state,
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      });

      alert('Destaque configurado com sucesso!');
    } catch (error: any) {
      handleFirestoreError(error, OperationType.CREATE, 'highlights');
      alert(error.message);
    }
  };

  const handleSavePlans = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPlans(true);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/admin/subscription-plans', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(subscriptionPlans)
      });
      if (!res.ok) throw new Error('Erro ao salvar planos');
      alert('Planos de assinatura atualizados com sucesso!');
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSavingPlans(false);
    }
  };

  const handleSaveSub = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/admin/subscriptions/${editingSub.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          status: subFormData.status,
          plan_type: subFormData.plan_type,
          next_billing_date: subFormData.next_billing_date || null,
          expires_at: subFormData.expires_at || null
        })
      });
      if (!res.ok) throw new Error('Erro ao salvar assinatura');
      setIsSubModalOpen(false);
      fetchData();
      alert('Assinatura atualizada com sucesso!');
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleDeactivateSub = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja inativar (cancelar) esta assinatura? A farmácia perderá acesso se expirar.')) return;
    try {
      const token = await getAuthToken();
      await fetch(`/api/admin/subscriptions/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'cancelled' })
      });
      fetchData();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleDeleteSub = async (id: string) => {
    if (!window.confirm('CUIDADO: Tem certeza que deseja excluir esta assinatura PERMANENTEMENTE? A farmácia será desativada do app.')) return;
    try {
      const token = await getAuthToken();
      await fetch(`/api/admin/subscriptions/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchData();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(config)
      });
      if (!res.ok) throw new Error('Erro ao salvar configurações');
      alert('Configurações salvas com sucesso!');
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSaveGeneralConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await setDoc(doc(db, 'config', 'general'), {
        ...generalConfig,
        updated_at: new Date().toISOString()
      }, { merge: true });
      alert('Configurações gerais salvas com sucesso!');
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTestMP = async () => {
    if (!config.access_token) {
      alert('Por favor, insira o Access Token primeiro.');
      return;
    }
    setTestingMP(true);
    setTestResult(null);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/admin/config/test-mercadopago', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ access_token: config.access_token })
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, message: data.message });
      } else {
        setTestResult({ success: false, message: data.details || data.error || 'Erro desconhecido' });
      }
    } catch (error: any) {
      setTestResult({ success: false, message: 'Falha na comunicação com o servidor: ' + error.message });
    } finally {
      setTestingMP(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Painel Admin Master</h1>
      
      {/* Tabs */}
      <div className="border-b border-gray-200 mb-8 overflow-x-auto">
        <nav className="-mb-px flex space-x-8 min-w-max">
          {['pharmacies', 'shifts', 'highlights', 'subscribers', 'subscriptions', 'reports', 'finance', 'audit', 'settings'].filter(tab => (tab !== 'reports' && tab !== 'subscriptions' && tab !== 'settings' && tab !== 'subscribers' && tab !== 'audit' && tab !== 'finance') || isAdminMaster).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`${
                activeTab === tab
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm capitalize`}
            >
              {tab === 'pharmacies' && 'Gerenciar Farmácias'}
              {tab === 'shifts' && 'Cadastro de Plantões'}
              {tab === 'highlights' && 'Destaques'}
              {tab === 'subscribers' && 'Assinantes'}
              {tab === 'reports' && 'Relatórios e Métricas'}
              {tab === 'subscriptions' && 'Planos de Assinatura'}
              {tab === 'audit' && 'Logs de Auditoria'}
              {tab === 'settings' && 'Configurações'}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'pharmacies' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={openCreateModal} className="bg-emerald-600 text-white px-4 py-2 rounded-md font-medium hover:bg-emerald-700 flex items-center gap-2">
              <Plus className="w-5 h-5" /> Nova Farmácia
            </button>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Farmácia</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Local</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Destaques</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pharmacies.map((pharmacy) => (
                <tr key={pharmacy.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{pharmacy.name}</div>
                    <div className="text-sm text-gray-500">{pharmacy.user_email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {pharmacy.city}/{pharmacy.state}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {pharmacy.is_active ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        Ativa
                      </span>
                    ) : (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                        Inativa
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {pharmacy.is_active && (
                      <div className="flex gap-2">
                        <button onClick={() => handleSetHighlight(pharmacy.id, 'day', pharmacy.city, pharmacy.state)} className="text-amber-600 hover:text-amber-900 bg-amber-50 px-2 py-1 rounded text-xs flex items-center gap-1">
                          <Star className="w-3 h-3" /> Dia
                        </button>
                        <button onClick={() => handleSetHighlight(pharmacy.id, 'week', pharmacy.city, pharmacy.state)} className="text-amber-600 hover:text-amber-900 bg-amber-50 px-2 py-1 rounded text-xs flex items-center gap-1">
                          <Star className="w-3 h-3" /> Sem
                        </button>
                        <button onClick={() => handleSetHighlight(pharmacy.id, 'month', pharmacy.city, pharmacy.state)} className="text-amber-600 hover:text-amber-900 bg-amber-50 px-2 py-1 rounded text-xs flex items-center gap-1">
                          <Star className="w-3 h-3" /> Mês
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button 
                      onClick={() => openEditModal(pharmacy)}
                      className="text-blue-600 hover:text-blue-900 bg-blue-50 px-3 py-1 rounded flex items-center gap-1 inline-flex"
                      title="Editar"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    {!pharmacy.is_active ? (
                      <button 
                        onClick={() => handleActivate(pharmacy.id)}
                        className="text-emerald-600 hover:text-emerald-900 bg-emerald-50 px-3 py-1 rounded inline-flex"
                      >
                        Ativar
                      </button>
                    ) : (
                      <button 
                        onClick={() => handleDeactivate(pharmacy.id)}
                        className="text-amber-600 hover:text-amber-900 bg-amber-50 px-3 py-1 rounded flex items-center gap-1 inline-flex"
                        title="Desativar"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    )}
                    <button 
                      onClick={() => handleDelete(pharmacy.id)}
                      className="text-red-600 hover:text-red-900 bg-red-50 px-3 py-1 rounded flex items-center gap-1 inline-flex"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {activeTab === 'shifts' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Cadastro de Plantões</h2>
              <p className="text-sm text-gray-500">Controle os dias de plantão de todas as farmácias.</p>
            </div>
            <button onClick={openNewShiftModal} className="bg-emerald-600 text-white px-4 py-2 rounded-md font-medium hover:bg-emerald-700 flex items-center gap-2">
              <Calendar className="w-5 h-5" /> Novo Plantão
            </button>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {adminShifts.length === 0 ? (
              <div className="p-8 text-center text-gray-500">Nenhum plantão cadastrado no sistema.</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Farmácia</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Horário</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {adminShifts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((shift) => {
                    const isPast = isShiftPast(shift.date);
                    return (
                      <tr key={shift.id} className={isPast ? 'bg-gray-50' : ''}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {shift.pharmacy_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatToBRDate(shift.date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {shift.is_24h ? '24 Horas' : `${shift.start_time} às ${shift.end_time}`}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {isPast ? (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                              Finalizado
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

      {activeTab === 'highlights' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Farmácia</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Local</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Período</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {adminHighlights.map((high) => {
                  const isExpired = new Date(high.date_end) < new Date();
                  return (
                    <tr key={high.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {high.pharmacy_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                        {high.type === 'day' ? 'Dia' : high.type === 'week' ? 'Semana' : 'Mês'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {high.city}/{high.state}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatToBRDate(high.date_start)} até {formatToBRDate(high.date_end)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isExpired ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                            Expirado
                          </span>
                        ) : (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                            Ativo
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button 
                          onClick={() => handleDeleteHighlight(high.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Remover Destaque"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {adminHighlights.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                      Nenhum destaque configurado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'reports' && isAdminMaster && reports?.totalPharmacies !== undefined && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-gray-500 text-sm font-medium">Total de Farmácias</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">{reports.totalPharmacies}</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-gray-500 text-sm font-medium">Farmácias Ativas</h3>
              <p className="text-3xl font-bold text-emerald-600 mt-2">{reports.activePharmacies}</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-gray-500 text-sm font-medium">Faturamento Total (Estimado)</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">R$ {reports.totalRevenue.toFixed(2).replace('.', ',')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-6">Evolução de Faturamento</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={reports.revenueByMonth}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `R$ ${value}`} />
                    <Tooltip formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Faturamento']} />
                    <Area type="monotone" dataKey="total" stroke="#10b981" fillOpacity={1} fill="url(#colorRevenue)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Status Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-6">Status das Farmácias</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={reports.pharmacyStatus}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {reports.pharmacyStatus.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#f43f5e'} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'subscribers' && isAdminMaster && (
        <div className="space-y-4">
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold text-gray-900">Controle de Assinantes</h2>
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md text-sm font-medium transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Exportar CSV
                </button>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                {/* Search */}
                <div className="relative flex-1 sm:w-64">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Search className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    placeholder="Buscar farmácia ou e-mail..."
                    value={subSearchTerm}
                    onChange={(e) => setSubSearchTerm(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                  />
                </div>

                {/* Status Filter */}
                <div className="relative sm:w-48">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Filter className="h-4 w-4" />
                  </span>
                  <select
                    value={subStatusFilter}
                    onChange={(e) => setSubStatusFilter(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm focus:ring-emerald-500 focus:border-emerald-500 transition-colors appearance-none"
                  >
                    <option value="all">Todos os Status</option>
                    <option value="active">Ativos</option>
                    <option value="pending">Pendentes</option>
                    <option value="cancelled">Cancelados</option>
                    <option value="expired">Expirados</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Farmácia / E-mail</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plano (R$)</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expiração</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredSubscribers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                        {subSearchTerm || subStatusFilter !== 'all' 
                          ? 'Nenhum assinante atende aos filtros aplicados.' 
                          : 'Nenhum assinante encontrado.'}
                      </td>
                    </tr>
                  ) : (
                    filteredSubscribers.map((sub) => (
                      <tr key={sub.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{sub.pharmacy_name}</div>
                          <div className="text-sm text-gray-500">{sub.pharmacy_email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">R$ {sub.amount?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}</div>
                          <div className="text-xs text-gray-500">{sub.plan_type === 'annual' ? 'Anual' : 'Mensal'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {sub.status === 'active' || sub.status === 'authorized' ? (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Ativa</span>
                          ) : sub.status === 'cancelled' ? (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-amber-100 text-amber-800">Cancelada</span>
                          ) : (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                              {sub.status === 'expired' ? 'Expirada' : sub.status === 'pending' ? 'Pendente' : sub.status}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {sub.expires_at ? new Date(sub.expires_at).toLocaleDateString('pt-BR') : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex flex-col gap-2">
                            <div className="flex gap-2 items-center">
                              <span className="text-xs font-bold text-gray-400 w-16 uppercase">Assinat.:</span>
                              <button
                                onClick={() => handleViewHistory(sub)}
                                className="text-emerald-600 hover:text-emerald-900 bg-emerald-50 p-1 rounded-lg transition-colors flex items-center gap-1"
                                title="Ver Histórico Financeiro"
                              >
                                <History className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingSub(sub);
                                  setSubFormData({ 
                                    status: sub.status || 'pending', 
                                    next_billing_date: sub.next_billing_date || null,
                                    expires_at: sub.expires_at || null,
                                    plan_type: sub.plan_type || 'monthly'
                                  });
                                  setIsSubModalOpen(true);
                                }}
                                className="text-blue-600 hover:text-blue-900 bg-blue-50 p-1 rounded"
                                title="Editar Assinatura"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              {(sub.status === 'active' || sub.status === 'authorized') && (
                                <button
                                  onClick={() => handleDeactivateSub(sub.id)}
                                  className="text-amber-600 hover:text-amber-900 bg-amber-50 p-1 rounded"
                                  title="Desativar Assinatura"
                                >
                                  <Ban className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteSub(sub.id)}
                                className="text-red-600 hover:text-red-900 bg-red-50 p-1 rounded"
                                title="Excluir Assinatura"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            
                            {(() => {
                               const linkedPharm = pharmacies.find(p => p.id === sub.pharmacy_id);
                               if (!linkedPharm) return null;
                               return (
                                <div className="flex gap-2 items-center mt-1 pt-1 border-t border-gray-100">
                                  <span className="text-xs font-bold text-gray-400 w-16 uppercase">Perfil:</span>
                                  <button 
                                    onClick={() => openEditModal(linkedPharm)}
                                    className="text-blue-600 hover:text-blue-900 bg-blue-50 p-1 rounded flex items-center gap-1 inline-flex"
                                    title="Editar Dados da Farmácia"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  {!linkedPharm.is_active ? (
                                    <button 
                                      onClick={() => handleActivate(linkedPharm.id)}
                                      className="text-emerald-600 hover:text-emerald-900 bg-emerald-50 px-2 py-1 rounded inline-flex font-bold text-[10px]"
                                      title="Ativar Farmácia"
                                    >
                                      ATIVAR
                                    </button>
                                  ) : (
                                    <button 
                                      onClick={() => handleDeactivate(linkedPharm.id)}
                                      className="text-amber-600 hover:text-amber-900 bg-amber-50 p-1 rounded flex items-center gap-1 inline-flex"
                                      title="Desativar Farmácia no Catálogo"
                                    >
                                      <Ban className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button 
                                    onClick={() => handleDelete(linkedPharm.id)}
                                    className="text-red-600 hover:text-red-900 bg-red-50 p-1 rounded flex items-center gap-1 inline-flex"
                                    title="Excluir Farmácia Definitivamente"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                               );
                            })()}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'subscriptions' && isAdminMaster && (
        <div className="max-w-4xl space-y-8">
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Planos de Assinatura de Farmácias</h2>
              <button
                type="button"
                onClick={() => {
                  const id = `extra_${Date.now()}`;
                  setSubscriptionPlans({
                    ...subscriptionPlans,
                    [id]: { active: true, price: 0, title: 'Novo Plano', frequency: 1, frequency_type: 'months', benefits: [] }
                  });
                }}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors text-sm font-bold"
              >
                <Plus className="w-4 h-4" />
                Adicionar Plano
              </button>
            </div>
            
            <div className="flex justify-between items-center mb-8">
              <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-lg flex-1 mr-4">
                <p className="text-sm text-emerald-800">
                  Configure os valores e benefícios dos planos. As chaves 'monthly' e 'annual' são as padrões do sistema, mas você pode criar variações.
                </p>
              </div>
              <button 
                type="button" 
                onClick={addNewPlan}
                className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg hover:shadow-emerald-200"
              >
                <Plus className="w-5 h-5" />
                Novo Plano
              </button>
            </div>
            
            <form onSubmit={handleSavePlans} className="space-y-12">
              {Object.entries(subscriptionPlans || {})
                .filter(([id]) => id !== 'updated_at')
                .sort(([idA], [idB]) => {
                  if (idA === 'monthly') return -1;
                  if (idB === 'monthly') return 1;
                  if (idA === 'annual') return -1;
                  if (idB === 'annual') return 1;
                  return idA.localeCompare(idB);
                })
                .map(([id, plan]: [string, any]) => (
                <div key={id} className="border border-gray-200 rounded-2xl p-6 bg-gray-50/50 hover:bg-white hover:shadow-lg transition-all relative">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{plan.title || 'Sem Título'}</h3>
                      <p className="text-xs text-gray-400 font-mono tracking-tighter mt-1">ID: {id}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <div className="relative">
                          <input 
                            type="checkbox" 
                            className="sr-only peer"
                            checked={plan.active}
                            onChange={e => setSubscriptionPlans({
                              ...subscriptionPlans, 
                              [id]: { ...plan, active: e.target.checked }
                            })}
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                        </div>
                        <span className="text-xs font-bold text-gray-600 group-hover:text-emerald-600 transition-colors">Ativo</span>
                      </label>
                      {id !== 'monthly' && id !== 'annual' && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!window.confirm('Tem certeza que deseja excluir este plano? Esta ação removerá o plano da lista de opções.')) return;
                            const newPlans = { ...subscriptionPlans };
                            delete newPlans[id];
                            setSubscriptionPlans(newPlans);
                          }}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="Remover Plano"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="md:col-span-2 lg:col-span-2">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Título do Plano</label>
                      <input 
                        type="text" 
                        required
                        value={plan.title || ''}
                        onChange={e => setSubscriptionPlans({
                          ...subscriptionPlans, 
                          [id]: { ...plan, title: e.target.value }
                        })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white transition-all text-sm"
                        placeholder="Ex: Assinatura Mensal VIP"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Preço (R$)</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 text-sm">R$</span>
                        <input 
                          type="number" 
                          step="0.01"
                          required
                          value={plan.price || 0}
                          onChange={e => setSubscriptionPlans({
                            ...subscriptionPlans, 
                            [id]: { ...plan, price: parseFloat(e.target.value) }
                          })}
                          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white transition-all text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Expira em</label>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          required
                          min="1"
                          value={plan.frequency || 1}
                          onChange={e => setSubscriptionPlans({
                            ...subscriptionPlans, 
                            [id]: { ...plan, frequency: parseInt(e.target.value) }
                          })}
                          className="w-20 px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white transition-all text-sm"
                        />
                        <select 
                          value={plan.frequency_type || 'months'}
                          onChange={e => setSubscriptionPlans({
                            ...subscriptionPlans, 
                            [id]: { ...plan, frequency_type: e.target.value }
                          })}
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white transition-all text-sm"
                        >
                          <option value="days">Dias</option>
                          <option value="months">Meses</option>
                          <option value="years">Anos</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 pt-8 border-t border-gray-100">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-sm font-bold text-gray-700">Benefícios & Destaques</h4>
                      <button
                        type="button"
                        onClick={() => {
                          const benefits = [...(plan.benefits || [])];
                          benefits.push('');
                          setSubscriptionPlans({
                            ...subscriptionPlans,
                            [id]: { ...plan, benefits }
                          });
                        }}
                        className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded"
                      >
                        <Plus className="w-3 h-3" />
                        Novo Benefício
                      </button>
                    </div>
                    
                    {(!plan.benefits || plan.benefits.length === 0) ? (
                      <p className="text-xs text-gray-400 italic bg-white p-3 rounded-lg border border-dashed border-gray-200">
                        Nenhum benefício listado. Adicione alguns para atrair assinantes.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {plan.benefits.map((benefit: string, bIndex: number) => (
                          <div key={bIndex} className="flex items-center gap-2 group">
                            <div className="relative flex-1">
                              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-emerald-500">
                                <CheckCircle className="w-3 h-3" />
                              </span>
                              <input
                                type="text"
                                value={benefit || ''}
                                onChange={(e) => {
                                  const newBenefits = [...plan.benefits];
                                  newBenefits[bIndex] = e.target.value;
                                  setSubscriptionPlans({
                                    ...subscriptionPlans,
                                    [id]: { ...plan, benefits: newBenefits }
                                  });
                                }}
                                className="w-full pl-8 pr-3 py-1.5 border border-gray-100 rounded-lg text-xs bg-white focus:ring-emerald-500 focus:border-emerald-500 transition-all border-emerald-50"
                                placeholder="Ex: Suporte VIP 24h"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const newBenefits = plan.benefits.filter((_: any, i: number) => i !== bIndex);
                                setSubscriptionPlans({
                                  ...subscriptionPlans,
                                  [id]: { ...plan, benefits: newBenefits }
                                });
                              }}
                              className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <div className="pt-8">
                <button
                  type="submit"
                  disabled={savingPlans}
                  className="w-full flex justify-center items-center gap-2 py-4 px-6 border border-transparent rounded-2xl shadow-xl text-lg font-bold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/50 transition-all disabled:opacity-50"
                >
                  {savingPlans ? 'Salvando...' : 'Publicar Alterações nos Planos'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="max-w-2xl space-y-8">
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Manutenção do Sistema</h2>
            <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-lg mb-6">
              <p className="text-sm text-emerald-800">
                Sincronize denormalizações e pré-calcule estatísticas para melhorar o desempenho do dashboard.
              </p>
            </div>
            <button
              onClick={handleSyncData}
              disabled={isSyncing}
              className="px-6 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 font-medium"
            >
              {isSyncing ? 'Sincronizando...' : 'Sincronizar e Otimizar Banco de Dados'}
            </button>
          </div>

          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Configurações do Sistema</h2>
          <form onSubmit={handleSaveConfig} className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900 border-b pb-2">Mercado Pago API</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700">Public Key (VITE_MERCADOPAGO_PUBLIC_KEY)</label>
                <input 
                  type="text" 
                  value={config.public_key || ''} 
                  onChange={e => setConfig({...config, public_key: e.target.value})}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                  placeholder="APP_USR-..."
                />
                <p className="mt-1 text-xs text-gray-500">Usada no frontend para inicializar o checkout.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Access Token (MERCADOPAGO_ACCESS_TOKEN)</label>
                <input 
                  type="password" 
                  value={config.access_token || ''} 
                  onChange={e => setConfig({...config, access_token: e.target.value})}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                  placeholder="APP_USR-..."
                />
                <p className="mt-1 text-xs text-gray-500">Usado no backend para criar pagamentos e processar webhooks.</p>
              </div>

              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                <input 
                  type="checkbox"
                  id="test_mode"
                  checked={config.test_mode || false}
                  onChange={e => setConfig({...config, test_mode: e.target.checked})}
                  className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                />
                <label htmlFor="test_mode" className="text-sm font-medium text-amber-900">
                  Mudar para Modo Simulado (Apenas para Testes e Demonstração)
                </label>
              </div>
              <p className="text-[10px] text-amber-700 -mt-2 px-1">
                Ao ativar, a API irá simular aprovações de pagamento sem cobrar valores reais. Utilize para prototipar ou caso suas chaves reais ainda não estejam autorizadas.
              </p>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleTestMP}
                  disabled={testingMP}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    testResult?.success 
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                      : testResult?.success === false
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {testingMP ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  {testingMP ? 'Testando...' : 'Testar Conexão com Mercado Pago'}
                </button>

                {testResult && (
                  <div 
                    className={`mt-4 p-4 rounded-xl flex gap-3 items-start ${
                      testResult.success ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
                    }`}
                  >
                    {testResult.success ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
                    <div className="text-sm">
                      <p className="font-bold">{testResult.success ? 'Conexão OK!' : 'Falha na Autenticação'}</p>
                      <p className="mt-1 opacity-90">{testResult.message}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={savingConfig}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50"
              >
                {savingConfig ? 'Salvando...' : 'Salvar Configurações'}
              </button>
            </div>
          </form>

          <hr className="my-10 border-gray-100" />

          <h2 className="text-xl font-bold text-gray-900 mb-6">Apoio e Visualização</h2>
          <form onSubmit={handleSaveGeneralConfig} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">Número do WhatsApp de Apoio (Com DDD)</label>
                <input 
                  type="text" 
                  value={generalConfig.whatsapp_support} 
                  onChange={e => setGeneralConfig({...generalConfig, whatsapp_support: e.target.value})}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="5511999999999"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Exibir Próximos Plantões (Dias)</label>
                <input 
                  type="number" 
                  value={generalConfig.future_shifts_days} 
                  onChange={e => setGeneralConfig({...generalConfig, future_shifts_days: parseInt(e.target.value) || 7})}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">E-mail de Suporte (Exibido no Contato)</label>
                <input 
                  type="email" 
                  value={generalConfig.support_email} 
                  onChange={e => setGeneralConfig({...generalConfig, support_email: e.target.value})}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="suporte@exemplo.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Telefone de Suporte (Exibido no Contato)</label>
                <input 
                  type="text" 
                  value={generalConfig.support_phone} 
                  onChange={e => setGeneralConfig({...generalConfig, support_phone: e.target.value})}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="checkbox"
                id="whatsapp_active"
                checked={generalConfig.whatsapp_active}
                onChange={e => setGeneralConfig({...generalConfig, whatsapp_active: e.target.checked})}
                className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
              />
              <label htmlFor="whatsapp_active" className="text-sm font-medium text-gray-700">
                Ativar Botão de WhatsApp flutuante no Checkout
              </label>
            </div>
            <button
              type="submit"
              disabled={savingConfig}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50"
            >
              {savingConfig ? 'Salvando...' : 'Salvar Configurações de Apoio'}
            </button>
          </form>
        </div>
      </div>
      )}

      {activeTab === 'audit' && isAdminMaster && (
        <div className="space-y-4">
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Logs de Auditoria Administrativa</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data / Hora</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Admin</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ação</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recurso Info</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {auditLogs.length === 0 ? (
                     <tr>
                       <td colSpan={4} className="px-6 py-8 text-center text-gray-500">Nenhum registro de auditoria encontrado.</td>
                     </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                          {new Date(log.timestamp).toLocaleDateString('pt-BR')} {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                        </td>
                        <td className="px-6 py-4 max-w-[200px] truncate text-sm text-gray-900">
                          {log.admin_id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-bold rounded-md ${
                            log.action === 'delete' ? 'bg-red-100 text-red-800' :
                            log.action === 'update' ? 'bg-amber-100 text-amber-800' :
                            log.action === 'activate' ? 'bg-emerald-100 text-emerald-800' :
                            log.action === 'deactivate' ? 'bg-orange-100 text-orange-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {log.action.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 break-words">
                          <span className="font-semibold">{log.resource_type}</span>: {log.resource_id}
                          <div className="text-xs text-gray-500 mt-1 max-w-md overflow-x-auto">
                            {JSON.stringify(log.details)}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova/Editar Farmácia */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">
                {editingPharmacy ? 'Editar Farmácia' : 'Nova Farmácia'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSavePharmacy} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">E-mail (Login)</label>
                  <input type="email" required value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Senha {editingPharmacy && <span className="text-gray-400 font-normal">(Deixe em branco para manter)</span>}
                  </label>
                  <input type="password" required={!editingPharmacy} value={formData.password || ''} onChange={e => setFormData({...formData, password: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Nome da Farmácia</label>
                  <input type="text" required value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Telefone</label>
                  <input type="text" required value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">WhatsApp</label>
                  <input type="text" required value={formData.whatsapp || ''} onChange={e => setFormData({...formData, whatsapp: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Rua</label>
                  <input type="text" required value={formData.street || ''} onChange={e => setFormData({...formData, street: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Número</label>
                  <input type="text" required value={formData.number || ''} onChange={e => setFormData({...formData, number: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Bairro</label>
                  <input type="text" required value={formData.neighborhood || ''} onChange={e => setFormData({...formData, neighborhood: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Cidade</label>
                  <input type="text" required value={formData.city || ''} onChange={e => setFormData({...formData, city: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Estado (UF)</label>
                  <input type="text" required maxLength={2} value={formData.state || ''} onChange={e => setFormData({...formData, state: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md uppercase" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">CEP</label>
                  <input type="text" value={formData.cep || ''} onChange={e => setFormData({...formData, cep: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="00000-000" />
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
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
      {/* Modal de Plantão (Admin) */}
      {isShiftModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">
                {editingShiftId ? 'Editar Plantão' : 'Novo Plantão'}
              </h2>
              <button onClick={() => setIsShiftModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSaveShift} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Farmácia</label>
                <select 
                  required 
                  value={shiftForm.pharmacy_id || ''} 
                  onChange={e => setShiftForm({...shiftForm, pharmacy_id: e.target.value})} 
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="" disabled>Selecione uma farmácia...</option>
                  {pharmacies.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.city}/{p.state})</option>
                  ))}
                </select>
              </div>
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

      {/* Modal Histórico de Pagamentos */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Histórico de Pagamentos</h3>
                <p className="text-sm text-gray-500">{historySub?.pharmacy_name}</p>
              </div>
              <button 
                onClick={() => setIsHistoryModalOpen(false)}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {loadingHistory ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
                </div>
              ) : subPayments.length === 0 ? (
                <div className="text-center py-12">
                  <DollarSign className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                  <p className="text-gray-500">Nenhum registro de pagamento encontrado para esta farmácia.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {subPayments.map((pay) => (
                    <div key={pay.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors bg-white shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${
                          pay.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : 
                          pay.status === 'pending' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                        }`}>
                          <DollarSign className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">R$ {pay.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span className="uppercase">{pay.method}</span>
                            <span>•</span>
                            <span>ID: {pay.mp_payment_id || pay.id.substring(0,8)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xs font-bold uppercase ${
                          pay.status === 'approved' ? 'text-emerald-600' : 
                          pay.status === 'pending' ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          {pay.status === 'approved' ? 'Aprovado' : 
                           pay.status === 'pending' ? 'Pendente' : 'Falhou'}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(pay.created_at).toLocaleDateString('pt-BR')} {new Date(pay.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end">
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="px-6 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Assinante */}
      {isSubModalOpen && editingSub && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Editar Assinatura</h2>
              <button onClick={() => setIsSubModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSaveSub} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Farmácia</label>
                <input type="text" disabled value={editingSub.pharmacy_name || ''} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <select 
                  value={subFormData.status || 'pending'} 
                  onChange={e => setSubFormData({...subFormData, status: e.target.value})} 
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="active">Ativa</option>
                  <option value="authorized">Autorizada (Cartão)</option>
                  <option value="pending">Pendente</option>
                  <option value="cancelled">Cancelada (Inativa)</option>
                  <option value="expired">Expirada</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Plano de Assinatura</label>
                <select 
                  value={subFormData.plan_type || 'monthly'} 
                  onChange={e => setSubFormData({...subFormData, plan_type: e.target.value})} 
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  {Object.entries(subscriptionPlans || {})
                    .filter(([id]) => id !== 'updated_at')
                    .map(([id, plan]: [string, any]) => (
                      <option key={id} value={id}>{plan.title} ({id})</option>
                    ))
                  }
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Data de Expiração/Vencimento</label>
                <input 
                  type="datetime-local" 
                  value={subFormData.expires_at && !isNaN(new Date(subFormData.expires_at).getTime()) 
                    ? new Date(subFormData.expires_at).toISOString().slice(0, 16) 
                    : ''} 
                  onChange={e => setSubFormData({...subFormData, expires_at: e.target.value ? new Date(e.target.value).toISOString() : null})} 
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" 
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsSubModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
                  Voltar
                </button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700">
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  CheckCircle, XCircle, Star, Trash2, Ban, Edit, Plus, X, Calendar, Search, 
  Filter, History, DollarSign, FileText, RefreshCw, ShieldCheck, AlertCircle, 
  CheckCircle2, Download, ArrowUp, ArrowDown, Loader2, CheckSquare, Square, 
  Key, Upload, Copy, Check, UserCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { storage } from '../../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { safeJsonFetch } from '../../lib/api';
import { useFirebase } from '../../components/FirebaseProvider';
import { calculateHighlightEnd, isShiftPast, formatToBRDate } from '../../lib/dateUtils';
import { normalizeString } from '../../lib/utils';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { getAuthToken } from '../../lib/firebase';
import { useToast } from '../../components/Toast';
import { translateError } from '../../lib/errorTranslations';

interface Pharmacy {
  id: string;
  name: string;
  email?: string;
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
  cep: string;
  user_id?: string;
  website?: string;
  description?: string;
  logo_url?: string;
  cnpj?: string;
  coordinates?: { lat: number; lng: number };
  operating_hours?: { [key: string]: { open: string; close: string; closed?: boolean } };
  is_24h?: boolean | number;
}

export default function AdminDashboard() {
  const { user: firebaseUser } = useFirebase();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [totalPharmacies, setTotalPharmacies] = useState(0);
  const [pharmacyPage, setPharmacyPage] = useState(1);
  const PHARMACIES_PER_PAGE = 20;

  const [reports, setReports] = useState<any>(null);
  const [adminShifts, setAdminShifts] = useState<any[]>([]);
  const [adminHighlights, setAdminHighlights] = useState<any[]>([]);
  const [adminSubscribers, setAdminSubscribers] = useState<any[]>([]);
  const [allPharmaciesList, setAllPharmaciesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [loadingTable, setLoadingTable] = useState(false);
  
  // Admin states
  const [admins, setAdmins] = useState<any[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [isNewAdminModalOpen, setIsNewAdminModalOpen] = useState(false);
  const [newAdminForm, setNewAdminForm] = useState({ name: '', email: '', password: '' });
  const [editingAdmin, setEditingAdmin] = useState<any>(null);
  const [isEditAdminModalOpen, setIsEditAdminModalOpen] = useState(false);
  const [editAdminForm, setEditAdminForm] = useState({ name: '', email: '', password: '', status: 'active' });
  
  // Promotion states
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [isPromoteModalOpen, setIsPromoteModalOpen] = useState(false);
  const [searchUserTerm, setSearchUserTerm] = useState('');
  const [userToPromote, setUserToPromote] = useState<any>(null);
  const [isPromoteConfirmOpen, setIsPromoteConfirmOpen] = useState(false);

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
    email_support_active: true,
    support_email: 'contato@farmaciasdeplantao.app.br',
    support_phone: '(00) 00000-0000',
    platform_last_update: ''
  });
  const [subscriptionPlans, setSubscriptionPlans] = useState<any>({
    free: { active: true, price: 0, title: 'Plano Gratuito', frequency: 1, frequency_type: 'years', benefits: [] },
    monthly: { active: true, price: 6.90, title: 'Plano Mensal', frequency: 1, frequency_type: 'months', benefits: [] },
    annual: { active: true, price: 69.96, title: 'Plano Anual', frequency: 1, frequency_type: 'years', benefits: [] }
  });
  const [savingPlans, setSavingPlans] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingMP, setTestingMP] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedPharmacyIds, setSelectedPharmacyIds] = useState<string[]>([]);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [currentPharmacyLogs, setCurrentPharmacyLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [copyingLink, setCopyingLink] = useState<string | null>(null);
  const [editingPharmacy, setEditingPharmacy] = useState<Pharmacy | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [subSearchTerm, setSubSearchTerm] = useState('');
  const [subStatusFilter, setSubStatusFilter] = useState('all');
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historySub, setHistorySub] = useState<any>(null);
  const [subPayments, setSubPayments] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [pharmacySearchTerm, setPharmacySearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [pharmacySortField, setPharmacySortField] = useState<'name' | 'city' | 'status' | null>(null);

  // Debounce pharmacy search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(pharmacySearchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [pharmacySearchTerm]);
  const [pharmacySortOrder, setPharmacySortOrder] = useState<'asc' | 'desc'>('asc');

  // API Integration States
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [loadingApiKeys, setLoadingApiKeys] = useState(false);
  const [apiKeyName, setApiKeyName] = useState('');
  const [apiKeyDesc, setApiKeyDesc] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<{ [key: string]: boolean }>({});

  // Interactive API Sandbox States
  const [sandboxEndpoint, setSandboxEndpoint] = useState('/api/external/v1/pharmacies');
  const [sandboxApiKey, setSandboxApiKey] = useState('');
  const [sandboxCity, setSandboxCity] = useState('');
  const [sandboxStateParam, setSandboxStateParam] = useState('');
  const [sandboxLimit, setSandboxLimit] = useState('5');
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [sandboxResponse, setSandboxResponse] = useState<any>(null);
  const [activeCodeLang, setActiveCodeLang] = useState<'curl' | 'js' | 'python'>('js');
  const [diagnosticError, setDiagnosticError] = useState<string>('all');
  const [isCopiedPrompt, setIsCopiedPrompt] = useState(false);

  const TableSkeleton = ({ rows = 5, cols = 5 }: { rows?: number, cols?: number }) => (
    <div className="animate-pulse">
      <div className="h-10 bg-gray-100 rounded mb-4 w-full"></div>
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="flex gap-4 mb-3">
          {[...Array(cols)].map((_, j) => (
            <div key={j} className="h-12 bg-gray-50 rounded flex-1"></div>
          ))}
        </div>
      ))}
    </div>
  );

  const rawAdmin = import.meta.env.VITE_ADMIN_EMAIL;
  const adminEmail = rawAdmin ? rawAdmin.replace(/['"]/g, '').trim() : 'sys.farmaciasdeplantao@gmail.com';
  
  const [userRole, setUserRole] = useState<string>(() => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        return JSON.parse(userStr).role || '';
      }
    } catch (_) {}
    return '';
  });

  const isAdminMaster = useMemo(() => {
    if (userRole === 'admin') return true;
    return firebaseUser?.email === 'sys.farmaciasdeplantao@gmail.com' || (adminEmail && firebaseUser?.email === adminEmail);
  }, [firebaseUser, adminEmail, userRole]);

  // Synchronize user profile role on mount
  useEffect(() => {
    const syncProfile = async () => {
      try {
        const data = await safeFetch('/api/user/profile');
        if (data && data.role) {
          setUserRole(data.role);
          const userStr = localStorage.getItem('user');
          if (userStr) {
            const u = JSON.parse(userStr);
            if (u.role !== data.role) {
              u.role = data.role;
              localStorage.setItem('user', JSON.stringify(u));
            }
          } else {
            localStorage.setItem('user', JSON.stringify(data));
          }
        }
      } catch (err) {
        console.error('Error syncing user profile:', err);
      }
    };
    syncProfile();
  }, []);

  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [confirmModalData, setConfirmModalData] = useState<{ id: string, type: 'shift' | 'highlight' | 'pharmacy' } | null>(null);
  const [shiftForm, setShiftForm] = useState({ pharmacy_id: '', date: '', start_time: '07:00', end_time: '22:00', is_24h: false });
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [pharmacyShiftSearch, setPharmacyShiftSearch] = useState('');

  const safeFetch = async (url: string, options: any = {}) => {
    const token = await getAuthToken();
    if (!token) throw new Error('Não autenticado');
    
    const headers: any = {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    };

    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    return safeJsonFetch(url, {
      ...options,
      headers
    });
  };

  const openCreateModal = () => {
    setEditingPharmacy(null);
    setFormData({
      email: '', password: '', name: '', phone: '', whatsapp: '',
      street: '', number: '', neighborhood: '', city: '', state: '', cep: '',
      is_24h: false
    });
    setIsModalOpen(true);
  };

  const openEditModal = (pharmacy: Pharmacy) => {
    setEditingPharmacy(pharmacy);
    setFormData({
      ...pharmacy,
      email: pharmacy.email || pharmacy.user_email || '',
      street: pharmacy.street || (pharmacy as any).address || '',
      number: pharmacy.number || '',
      neighborhood: pharmacy.neighborhood || (pharmacy as any).district || '',
      city: pharmacy.city || '',
      state: pharmacy.state || '',
      cep: pharmacy.cep || (pharmacy as any).zip || '',
      is_active: pharmacy.is_active !== undefined ? pharmacy.is_active : 1,
      sub_status: pharmacy.sub_status || 'active',
      cnpj: pharmacy.cnpj || '',
      description: pharmacy.description || '',
      website: pharmacy.website || '',
      logo_url: pharmacy.logo_url || '',
      phone: pharmacy.phone || '',
      whatsapp: pharmacy.whatsapp || '',
      coordinates: pharmacy.coordinates || { lat: null, lng: null },
      operating_hours: pharmacy.operating_hours || {},
      is_24h: pharmacy.is_24h === 1 || pharmacy.is_24h === true
    });
    setIsModalOpen(true);
  };

  const handleCepChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 8) value = value.slice(0, 8);
    
    // Format as 00000-000
    let formattedCep = value;
    if (value.length >= 5) {
      formattedCep = value.slice(0, 5) + '-' + value.slice(5);
    }
    
    setFormData({ ...formData, cep: formattedCep });

    if (value.length === 8) {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${value}/json/`);
        if (!response.ok) return;
        const data = await response.json();
        if (data && !data.erro) {
          setFormData(prev => ({
            ...prev,
            cep: formattedCep, // Keep formatting
            street: data.logradouro || prev.street || '',
            neighborhood: data.bairro || prev.neighborhood || '',
            city: data.localidade || prev.city || '',
            state: data.uf || prev.state || ''
          }));
        }
      } catch (error) {
        console.error('Error fetching CEP:', error);
      }
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const storageRef = ref(storage, `pharmacy_logos/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      setFormData({ ...formData, logo_url: url });
      showToast('Logo enviada com sucesso!', 'success');
    } catch (err: any) {
      showToast('Erro ao enviar logo: ' + err.message, 'error');
    }
  };

  const toggleSelectAll = () => {
    if (selectedPharmacyIds.length === filteredAndSortedPharmacies.length) {
      setSelectedPharmacyIds([]);
    } else {
      setSelectedPharmacyIds(filteredAndSortedPharmacies.map(p => p.id));
    }
  };

  const toggleSelectPharmacy = (id: string) => {
    setSelectedPharmacyIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBatchAction = async (action: 'activate' | 'deactivate' | 'delete') => {
    if (selectedPharmacyIds.length === 0) return;
    
    const confirmMsg = action === 'delete' 
      ? `Tem certeza que deseja excluir ${selectedPharmacyIds.length} farmácias permanentemente?`
      : `Deseja ${action === 'activate' ? 'ativar' : 'desativar'} ${selectedPharmacyIds.length} farmácias?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await safeFetch('/api/admin/pharmacies/batch', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedPharmacyIds, action })
      });
      showToast('Ação em massa concluída!', 'success');
      setSelectedPharmacyIds([]);
      fetchPharmacies();
    } catch (err: any) {
      showToast('Erro na ação em massa: ' + err.message, 'error');
    }
  };

  const viewLogs = async (pharmacy: Pharmacy) => {
    setEditingPharmacy(pharmacy);
    setIsAuditModalOpen(true);
    setIsLoadingLogs(true);
    try {
      const logs = await safeFetch(`/api/admin/pharmacies/${pharmacy.id}/logs`);
      setCurrentPharmacyLogs(logs);
    } catch (err: any) {
      showToast('Erro ao carregar logs: ' + err.message, 'error');
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const resetPassword = async (pharmacy: Pharmacy) => {
    if (!window.confirm(`Enviar link de recuperação de senha para ${pharmacy.user_email}?`)) return;
    
    try {
      const res = await safeFetch(`/api/admin/pharmacies/${pharmacy.id}/reset-password`, { method: 'POST' });
      if (res.link) {
        setCopyingLink(res.link);
        showToast('Link de recuperação gerado!', 'success');
      } else {
        showToast('E-mail de recuperação enviado via sistema Firebase.', 'success');
      }
    } catch (err: any) {
      showToast('Erro ao resetar senha: ' + err.message, 'error');
    }
  };

  const handleSavePharmacy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPharmacy) {
        await safeFetch(`/api/admin/pharmacies/${editingPharmacy.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            ...formData,
            email: formData.email?.trim()
          })
        });
      } else {
        await safeFetch('/api/admin/pharmacies', {
          method: 'POST',
          body: JSON.stringify({
            ...formData,
            email: formData.email?.trim()
          })
        });
      }
      setIsModalOpen(false);
      fetchData(true);
      showToast(editingPharmacy ? 'Farmácia atualizada com sucesso!' : 'Farmácia criada com sucesso!', 'success');
    } catch (error: any) {
      console.error('Error saving pharmacy', error);
      showToast('Erro ao salvar farmácia: ' + translateError(error), 'error');
    }
  };

  const handleSyncData = async () => {
    setIsSyncing(true);
    try {
      await safeFetch('/api/admin/sync-data', {
        method: 'POST'
      });
      showToast('Sistema sincronizado e otimizado com sucesso!', 'success');
      fetchData(true);
    } catch (error: any) {
      showToast(translateError(error), 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const addNewPlan = () => {
    const slug = prompt('Informe um identificador único para o plano (ex: semestral, vip_extra):');
    if (!slug) return;
    
    // Quick validation for slug
    const cleanSlug = normalizeString(slug).replace(/\s+/g, '_');
    if (subscriptionPlans[cleanSlug]) {
      showToast('Este identificador já existe!', 'warning');
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

  const togglePharmacySort = (field: 'name' | 'city' | 'status') => {
    if (pharmacySortField === field) {
      setPharmacySortOrder(pharmacySortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setPharmacySortField(field);
      setPharmacySortOrder('asc');
    }
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
      showToast('Erro ao carregar histórico de pagamentos', 'error');
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchStats = async () => {
    try {
      const statsData = await safeFetch('/api/admin/stats');
      if (statsData && typeof statsData !== 'string') {
        setStats(statsData);
        setReports(statsData);
      }
    } catch (e) { console.error('Error fetching stats:', e); }
  };

  const fetchAllPharmaciesList = async () => {
    try {
      const data = await safeFetch('/api/admin/pharmacies/all');
      if (data && typeof data !== 'string') {
        setAllPharmaciesList(data);
      }
    } catch (e) { console.error('Error fetching all pharmacies list:', e); }
  };

  const fetchPharmacies = async () => {
    setLoadingTable(true);
    try {
      const pharmData = await safeFetch(`/api/admin/pharmacies?page=${pharmacyPage}&limit=${PHARMACIES_PER_PAGE}&search=${debouncedSearchTerm}&sort=${pharmacySortField || ''}&order=${pharmacySortOrder}`);
      if (typeof pharmData === 'string') throw new Error('Falha ao obter lista de farmácias');
      
      const pArray = Array.isArray(pharmData) ? pharmData : (pharmData.data || []);
      const pTotal = Array.isArray(pharmData) ? pharmData.length : (pharmData.total || 0);
      
      setPharmacies(pArray);
      setTotalPharmacies(pTotal);
    } catch (e) { 
      console.error('Error fetching pharmacies:', e);
      showToast('Erro ao carregar farmácias', 'error');
    } finally { setLoadingTable(false); }
  };

  const fetchShifts = async () => {
    setLoadingTable(true);
    try {
      const shiftsData = await safeFetch('/api/admin/shifts');
      if (typeof shiftsData !== 'string') setAdminShifts(shiftsData);
    } finally { setLoadingTable(false); }
  };

  const fetchHighlights = async () => {
    setLoadingTable(true);
    try {
      const highData = await safeFetch('/api/admin/highlights');
      if (typeof highData !== 'string') setAdminHighlights(highData);
    } finally { setLoadingTable(false); }
  };

  const fetchSubscribers = async () => {
    setLoadingTable(true);
    try {
      const subsData = await safeFetch('/api/admin/subscriptions');
      if (typeof subsData !== 'string') setAdminSubscribers(subsData);
    } finally { setLoadingTable(false); }
  };

  const fetchPlans = async () => {
    try {
      const plansData = await safeFetch('/api/admin/subscription-plans');
      if (typeof plansData !== 'string') setSubscriptionPlans(plansData);
    } catch (e) { console.error('Error fetching plans:', e); }
  };

  const fetchConfig = async () => {
    try {
      const configData = await safeFetch('/api/admin/config');
      if (configData && typeof configData !== 'string') {
        const { mercadopago, general } = configData;
        if (mercadopago) {
          setConfig({
            public_key: mercadopago.public_key || '',
            access_token: mercadopago.access_token || '',
            test_mode: mercadopago.test_mode || false
          });
        }
        if (general) {
          setGeneralConfig({
            whatsapp_support: general.whatsapp_support || '5500000000000',
            future_shifts_days: general.future_shifts_days || 7,
            whatsapp_active: general.whatsapp_active ?? true,
            email_support_active: general.email_support_active ?? true,
            support_email: general.support_email || 'contato@farmaciasdeplantao.app.br',
            support_phone: general.support_phone || '(00) 00000-0000',
            platform_last_update: general.platform_last_update || ''
          });
        }
      }
    } catch (e) { console.error('Error fetching config:', e); }
  };

  const fetchApiKeys = async () => {
    setLoadingApiKeys(true);
    try {
      const data = await safeFetch('/api/admin/api-keys');
      if (data && typeof data !== 'string') {
        setApiKeys(data);
      }
    } catch (e) {
      console.error('Error fetching API keys:', e);
    } finally {
      setLoadingApiKeys(false);
    }
  };

  const fetchAuditLogs = async () => {
    if (!isAdminMaster) return;
    setLoadingTable(true);
    try {
      const logsData = await safeFetch('/api/admin/audit-logs');
      if (typeof logsData !== 'string') setAuditLogs(logsData.data || []);
    } finally { setLoadingTable(false); }
  };

  const fetchAdmins = async () => {
    if (!isAdminMaster) return;
    setLoadingAdmins(true);
    try {
      const data = await safeFetch('/api/admin/administradores');
      if (data && typeof data !== 'string') {
        setAdmins(data);
      }
    } catch (e) {
      console.error('Error fetching administrators:', e);
      showToast('Erro ao carregar administradores', 'error');
    } finally {
      setLoadingAdmins(false);
    }
  };

  const fetchAvailableUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await safeFetch('/api/admin/usuarios-disponiveis');
      if (data && typeof data !== 'string') {
        setAvailableUsers(data);
      }
    } catch (e) {
      console.error('Error fetching available users:', e);
      showToast('Erro ao carregar usuários cadastrados', 'error');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handlePromoteUser = (user: any) => {
    setUserToPromote(user);
    setIsPromoteConfirmOpen(true);
  };

  const confirmPromoteUser = async () => {
    if (!userToPromote) return;
    try {
      const res = await safeFetch('/api/admin/administradores/promover', {
        method: 'POST',
        body: JSON.stringify({ userId: userToPromote.id })
      });
      if (res && res.success) {
        showToast('Usuário promovido a administrador com sucesso!', 'success');
        setIsPromoteConfirmOpen(false);
        setIsPromoteModalOpen(false);
        setUserToPromote(null);
        fetchAdmins();
      } else {
        showToast(res.error || 'Erro ao promover usuário', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao promover usuário', 'error');
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminForm.name || !newAdminForm.email || !newAdminForm.password) {
      showToast('Preencha todos os campos obrigatórios', 'error');
      return;
    }
    try {
      const res = await safeFetch('/api/admin/administradores', {
        method: 'POST',
        body: JSON.stringify(newAdminForm)
      });
      if (res && res.id) {
        showToast('Administrador adicionado com sucesso!', 'success');
        setIsNewAdminModalOpen(false);
        setNewAdminForm({ name: '', email: '', password: '' });
        fetchAdmins();
      } else {
        showToast(res.error || 'Erro ao adicionar administrador', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao adicionar administrador', 'error');
    }
  };

  const handleOpenEditAdmin = (adm: any) => {
    setEditingAdmin(adm);
    setEditAdminForm({
      name: adm.name || '',
      email: adm.email || '',
      password: '',
      status: adm.status || 'active'
    });
    setIsEditAdminModalOpen(true);
  };

  const handleUpdateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAdminForm.name || !editAdminForm.email) {
      showToast('Nome e e-mail são obrigatórios', 'error');
      return;
    }
    try {
      const body: any = {
        name: editAdminForm.name,
        email: editAdminForm.email,
        status: editAdminForm.status
      };
      if (editAdminForm.password) {
        body.password = editAdminForm.password;
      }
      const res = await safeFetch(`/api/admin/administradores/${editingAdmin.id}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
      if (res && res.success) {
        showToast('Administrador atualizado com sucesso!', 'success');
        setIsEditAdminModalOpen(false);
        setEditingAdmin(null);
        fetchAdmins();
      } else {
        showToast(res.error || 'Erro ao atualizar administrador', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar administrador', 'error');
    }
  };

  const handleToggleStatusAdmin = async (adm: any) => {
    const newStatus = adm.status === 'inactive' ? 'active' : 'inactive';
    const actionText = newStatus === 'active' ? 'ativar' : 'desativar';
    if (!window.confirm(`Tem certeza que deseja ${actionText} este administrador?`)) {
      return;
    }
    try {
      const res = await safeFetch(`/api/admin/administradores/${adm.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });
      if (res && res.success) {
        showToast(`Administrador ${newStatus === 'active' ? 'ativado' : 'desativado'} com sucesso!`, 'success');
        fetchAdmins();
      } else {
        showToast(res.error || 'Erro ao alterar status', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao alterar status', 'error');
    }
  };

  const handleDeleteAdmin = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja remover este administrador? Ele perderá todo o acesso à plataforma.')) {
      return;
    }
    try {
      const res = await safeFetch(`/api/admin/administradores/${id}`, {
        method: 'DELETE'
      });
      if (res && res.success) {
        showToast('Administrador removido com sucesso!', 'success');
        fetchAdmins();
      } else {
        showToast(res.error || 'Erro ao remover administrador', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao remover administrador', 'error');
    }
  };

  const fetchData = async (refreshTab = false) => {
    if (!stats) setLoading(true);
    try {
      // Global critical data
      await Promise.all([
        fetchStats(),
        fetchPlans(),
        fetchConfig(),
        fetchApiKeys()
      ]);

      if (refreshTab) {
        if (activeTab === 'pharmacies') fetchPharmacies();
        if (activeTab === 'shifts') fetchShifts();
        if (activeTab === 'highlights') fetchHighlights();
        if (activeTab === 'subscribers') fetchSubscribers();
        if (activeTab === 'audit') fetchAuditLogs();
        if (activeTab === 'api_integration') fetchApiKeys();
        if (activeTab === 'admins') fetchAdmins();
      }
    } finally {
      setLoading(false);
    }
  };

  // Initial Load - Critical global data once
  useEffect(() => {
    fetchData();
  }, []);

  // Sync tab specific data - Triggered on tab change or tab dependencies
  useEffect(() => {
    switch (activeTab) {
      case 'pharmacies':
        fetchPharmacies();
        break;
      case 'shifts':
        fetchShifts();
        break;
      case 'highlights':
        fetchHighlights();
        break;
      case 'subscribers':
        fetchSubscribers();
        break;
      case 'audit':
        if (isAdminMaster) fetchAuditLogs();
        break;
      case 'api_integration':
        fetchApiKeys();
        break;
      case 'admins':
        if (isAdminMaster) fetchAdmins();
        break;
      case 'settings':
        fetchConfig();
        break;
      case 'subscriptions':
        fetchPlans();
        break;
      // 'reports' and 'finance' can use 'stats' which is globally fetched
    }
  }, [activeTab, pharmacyPage, debouncedSearchTerm, pharmacySortField, pharmacySortOrder]);

  const totalPages = Math.ceil(totalPharmacies / PHARMACIES_PER_PAGE);

  const filteredAndSortedPharmacies = pharmacies; // Now handled server-side mostly or already sorted in fetch

  const openNewShiftModal = () => {
    setEditingShiftId(null);
    setPharmacyShiftSearch('');
    setShiftForm({ pharmacy_id: '', date: '', start_time: '07:00', end_time: '22:00', is_24h: false });
    if (allPharmaciesList.length === 0) fetchAllPharmaciesList();
    setIsShiftModalOpen(true);
  };

  const openEditShiftModal = (shift: any) => {
    setEditingShiftId(shift.id);
    setPharmacyShiftSearch(''); // Reset search when editing
    setShiftForm({
      pharmacy_id: shift.pharmacy_id,
      date: shift.date,
      start_time: shift.start_time,
      end_time: shift.end_time,
      is_24h: shift.is_24h === 1
    });
    if (allPharmaciesList.length === 0) fetchAllPharmaciesList();
    setIsShiftModalOpen(true);
  };

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Not authenticated');

      const pharm = allPharmaciesList.find(p => p.id === shiftForm.pharmacy_id) || pharmacies.find(p => p.id === shiftForm.pharmacy_id);

      const shiftData = {
        pharmacy_id: shiftForm.pharmacy_id,
        user_id: pharm?.user_id || '',
        date: shiftForm.date,
        start_time: shiftForm.is_24h ? '00:00' : shiftForm.start_time,
        end_time: shiftForm.is_24h ? '23:59' : shiftForm.end_time,
        is_24h: shiftForm.is_24h ? 1 : 0
      };
      
      const endpoint = editingShiftId ? `/api/admin/shifts/${editingShiftId}` : '/api/admin/shifts';
      const method = editingShiftId ? 'PUT' : 'POST';

      const result = await safeJsonFetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(shiftData)
      });
      
      if (typeof result === 'string') {
        throw new Error('Erro na resposta do servidor: ' + result);
      }
      
      showToast(editingShiftId ? 'Plantão atualizado com sucesso!' : 'Plantão cadastrado com sucesso!', 'success');
      setIsShiftModalOpen(false);
      fetchData(true);
    } catch (error: any) {
      showToast('Erro ao salvar plantão: ' + translateError(error), 'error');
    }
  };

  const triggerDeleteShiftConfirmation = (id: string) => {
    setConfirmModalData({ id, type: 'shift' });
    setIsDeleteConfirmOpen(true);
  };

  const triggerDeleteHighlightConfirmation = (id: string) => {
    setConfirmModalData({ id, type: 'highlight' });
    setIsDeleteConfirmOpen(true);
  };

  const processDeletion = async () => {
    if (!confirmModalData) return;
    
    const { id, type } = confirmModalData;
    const itemLabel = type === 'shift' ? 'plantão' : type === 'highlight' ? 'destaque' : 'farmácia';
    const endpoint = type === 'shift' ? `/api/admin/shifts/${id}` : type === 'highlight' ? `/api/admin/highlights/${id}` : `/api/admin/pharmacies/${id}`;

    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Falha na autenticação. Por favor, faça login novamente.');

      await safeJsonFetch(endpoint, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      setIsDeleteConfirmOpen(false);
      setConfirmModalData(null);
      fetchData(true);
      showToast(`Excluído com sucesso!`, 'success');
    } catch (error: any) {
      console.error(`Error deleting ${type}:`, error);
      showToast(`Erro ao excluir ${itemLabel}: ` + translateError(error), 'error');
    }
  };

  const handleDeleteHighlight = async (id: string) => {
    triggerDeleteHighlightConfirmation(id);
  };

  const handleActivate = async (id: string) => {
    try {
      await safeFetch(`/api/admin/pharmacies/${id}/activate`, {
        method: 'POST'
      });
      showToast('Farmácia ativada com sucesso!', 'success');
      fetchData(true);
    } catch (error: any) {
      console.error('Error activating', error);
      showToast(translateError(error) || 'Erro ao ativar farmácia.', 'error');
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja desativar esta farmácia?')) return;
    try {
      await safeFetch(`/api/admin/pharmacies/${id}/deactivate`, {
        method: 'POST'
      });
      showToast('Farmácia desativada com sucesso.', 'info');
      fetchData(true);
    } catch (error: any) {
      console.error('Error deactivating', error);
      showToast(translateError(error) || 'Erro ao desativar farmácia.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja EXCLUIR esta farmácia permanentemente?')) return;
    try {
      await safeFetch(`/api/admin/pharmacies/${id}`, {
        method: 'DELETE'
      });
      showToast('Farmácia excluída permanentemente.', 'warning');
      fetchData(true);
    } catch (error: any) {
      console.error('Error deleting', error);
      showToast(translateError(error) || 'Erro ao excluir farmácia.', 'error');
    }
  };

  const handleSetHighlight = async (id: string, type: 'day' | 'week' | 'month', city: string, state: string) => {
    try {
      const now = new Date();
      const end = calculateHighlightEnd(type);

      await safeFetch('/api/admin/highlights', {
        method: 'POST',
        body: JSON.stringify({
          pharmacy_id: id,
          type,
          date_start: now.toISOString(),
          date_end: end.toISOString(),
          city,
          state
        })
      });

      showToast('Destaque configurado com sucesso!', 'success');
      fetchData(true);
    } catch (error: any) {
      console.error('Erro ao destacar:', error);
      showToast(translateError(error) || 'Erro ao ativar destaque.', 'error');
    }
  };

  const handleSavePlans = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPlans(true);
    try {
      await safeFetch('/api/admin/subscription-plans', {
        method: 'PUT',
        body: JSON.stringify(subscriptionPlans)
      });
      showToast('Planos de assinatura atualizados com sucesso!', 'success');
    } catch (error: any) {
      showToast(translateError(error), 'error');
    } finally {
      setSavingPlans(false);
    }
  };

  const handleSaveSub = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await safeFetch(`/api/admin/subscriptions/${editingSub.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: subFormData.status,
          plan_type: subFormData.plan_type,
          next_billing_date: subFormData.next_billing_date || null,
          expires_at: subFormData.expires_at || null
        })
      });
      setIsSubModalOpen(false);
      fetchData(true);
      showToast('Assinatura atualizada com sucesso!', 'success');
    } catch (error: any) {
      showToast(translateError(error), 'error');
    }
  };

  const handleDeactivateSub = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja inativar (cancelar) esta assinatura? A farmácia perderá acesso se expirar.')) return;
    try {
      await safeFetch(`/api/admin/subscriptions/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'cancelled' })
      });
      showToast('Assinatura inativada com sucesso.', 'info');
      fetchData(true);
    } catch (error: any) {
      showToast(translateError(error), 'error');
    }
  };

  const handleDeleteSub = async (id: string) => {
    if (!window.confirm('CUIDADO: Tem certeza que deseja excluir esta assinatura PERMANENTEMENTE? A farmácia será desativada do app.')) return;
    try {
      await safeFetch(`/api/admin/subscriptions/${id}`, {
        method: 'DELETE'
      });
      showToast('Assinatura excluída permanentemente.', 'warning');
      fetchData(true);
    } catch (error: any) {
      showToast(translateError(error), 'error');
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
        body: JSON.stringify({ mercadopago: config })
      });
      if (!res.ok) throw new Error('Erro ao salvar configurações');
      showToast('Configurações salvas com sucesso!', 'success');
    } catch (error: any) {
      showToast(translateError(error), 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSaveGeneralConfig = async (e: React.FormEvent) => {
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
        body: JSON.stringify({ general: generalConfig })
      });
      if (!res.ok) throw new Error('Erro ao salvar configurações gerais');
      showToast('Configurações gerais salvas com sucesso!', 'success');
    } catch (error: any) {
      showToast(translateError(error), 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTestMP = async () => {
    if (!config.access_token) {
      showToast('Por favor, insira o Access Token primeiro.', 'warning');
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
      setTestResult({ success: false, message: 'Falha na comunicação com o servidor: ' + translateError(error) });
    } finally {
      setTestingMP(false);
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyName.trim()) return;
    setCreatingKey(true);
    try {
      const token = await getAuthToken();
      const response = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: apiKeyName, description: apiKeyDesc })
      });
      const data = await response.json();
      if (response.ok) {
        setApiKeys([data, ...apiKeys]);
        setApiKeyName('');
        setApiKeyDesc('');
        setSandboxApiKey(data.key);
        showToast('Nova integração de API gerada com sucesso!', 'success');
      } else {
        showToast(data.error || 'Erro ao criar chave de API', 'error');
      }
    } catch (err: any) {
      console.error(err);
      showToast('Falha na comunicação com o servidor', 'error');
    } finally {
      setCreatingKey(false);
    }
  };

  const handleToggleApiKeyStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'revoked' : 'active';
    try {
      const token = await getAuthToken();
      const response = await fetch(`/api/admin/api-keys/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await response.json();
      if (response.ok) {
        setApiKeys(apiKeys.map(k => k.id === id ? { ...k, status: newStatus } : k));
        showToast('Chave de API atualizada com sucesso!', 'success');
      } else {
        showToast(data.error || 'Erro ao alterar status da chave', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Falha ao conectar com o servidor', 'error');
    }
  };

  const handleDeleteApiKey = async (id: string) => {
    if (!confirm('Deseja realmente excluir permanentemente esta integração de API? Quaisquer sistemas utilizando-a perderão acesso instantaneamente.')) return;
    try {
      const token = await getAuthToken();
      const response = await fetch(`/api/admin/api-keys/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok) {
        setApiKeys(apiKeys.filter(k => k.id !== id));
        showToast('Integração de API excluída com sucesso!', 'success');
      } else {
        showToast(data.error || 'Erro ao excluir chave', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Falha ao conectar com o servidor', 'error');
    }
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopyingLink(id);
    showToast('Chave de API copiada para a área de transferência!', 'success');
    setTimeout(() => setCopyingLink(null), 2000);
  };

  const handleTestSandbox = async () => {
    if (!sandboxApiKey) {
      setSandboxResponse({ error: 'Selecione ou insira uma chave de API para rodar o teste.' });
      return;
    }
    setSandboxLoading(true);
    setSandboxResponse(null);
    try {
      let url = `${sandboxEndpoint}?apiKey=${encodeURIComponent(sandboxApiKey)}`;
      if (sandboxEndpoint === '/api/external/v1/pharmacies') {
        if (sandboxCity) url += `&city=${encodeURIComponent(sandboxCity)}`;
        if (sandboxStateParam) url += `&state=${encodeURIComponent(sandboxStateParam)}`;
        if (sandboxLimit) url += `&limit=${encodeURIComponent(sandboxLimit)}`;
      }

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json'
        }
      });
      const data = await response.json();
      setSandboxResponse(data);
    } catch (err: any) {
      setSandboxResponse({ error: 'Erro de requisição Sandbox: ' + err.message });
    } finally {
      setSandboxLoading(false);
    }
  };

  if (loading && !stats) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-emerald-600 animate-spin" />
          <p className="text-gray-500 font-medium">Carregando painel administrativo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Painel Admin Master</h1>
      
      {/* Tabs */}
      <div className="mb-8 w-full">
        <nav className="grid grid-cols-1 md:grid-cols-5 gap-3 w-full">
          {['pharmacies', 'shifts', 'highlights', 'subscribers', 'subscriptions', 'reports', 'finance', 'audit', 'api_integration', 'admins', 'footer', 'settings'].filter(tab => (tab !== 'reports' && tab !== 'subscriptions' && tab !== 'settings' && tab !== 'subscribers' && tab !== 'audit' && tab !== 'finance' && tab !== 'api_integration' && tab !== 'admins' && tab !== 'footer') || isAdminMaster).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                if (tab === 'footer') {
                  navigate('/admin/footer');
                } else {
                  setActiveTab(tab);
                }
              }}
              className={`${
                activeTab === tab
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-50 border-gray-200 shadow-sm'
              } w-full py-3 px-4 border rounded-xl font-medium text-sm transition-all duration-200 flex items-center justify-center text-center cursor-pointer`}
            >
              {tab === 'pharmacies' && 'Gerenciar Farmácias'}
              {tab === 'shifts' && 'Cadastro de Plantões'}
              {tab === 'highlights' && 'Destaques'}
              {tab === 'subscribers' && 'Assinantes'}
              {tab === 'reports' && 'Relatórios e Métricas'}
              {tab === 'subscriptions' && 'Planos de Assinatura'}
              {tab === 'finance' && 'Painel Financeiro'}
              {tab === 'audit' && 'Logs de Auditoria'}
              {tab === 'api_integration' && 'Integração API'}
              {tab === 'admins' && 'Administradores'}
              {tab === 'footer' && 'Configurar Rodapé'}
              {tab === 'settings' && 'Configurações'}
            </button>
          ))}
        </nav>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <ShieldCheck className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-gray-500 text-sm font-medium">Farmácias Totais</h3>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.totalPharmacies || 0}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-50 rounded-lg">
                <CheckCircle2 className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-gray-500 text-sm font-medium">Ativas Agora</h3>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.activePharmacies || 0}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-amber-50 rounded-lg">
                <DollarSign className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="text-gray-500 text-sm font-medium">Receita Bruta</h3>
            </div>
            <p className="text-2xl font-bold text-gray-900">R$ {(stats.totalRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-50 rounded-lg">
                <History className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-gray-500 text-sm font-medium">Última Atualização</h3>
            </div>
            <p className="text-sm font-medium text-gray-900">
              {generalConfig.platform_last_update 
                ? new Date(generalConfig.platform_last_update).toLocaleString('pt-BR') 
                : (stats.lastUpdate ? new Date(stats.lastUpdate).toLocaleString('pt-BR') : 'Agora')}
            </p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-indigo-50 rounded-lg">
                <Key className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-gray-500 text-sm font-medium">Chaves de API</h3>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {apiKeys.length} <span className="text-xs text-gray-400 font-normal">ativas</span>
            </p>
          </div>
        </div>
      )}

      {activeTab === 'pharmacies' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200 gap-4">
            <div className="flex items-center gap-4 w-full max-w-lg">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Buscar por nome, cidade ou e-mail..."
                  value={pharmacySearchTerm}
                  onChange={(e) => {
                    setPharmacySearchTerm(e.target.value);
                    setPharmacyPage(1);
                  }}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              {selectedPharmacyIds.length > 0 && (
                <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 animate-in fade-in slide-in-from-left-2 transition-all">
                  <span className="text-sm font-semibold text-emerald-700">{selectedPharmacyIds.length} selecionados</span>
                  <div className="h-4 w-px bg-emerald-200 mx-1"></div>
                  <button onClick={() => handleBatchAction('activate')} className="p-1 text-emerald-600 hover:bg-emerald-100 rounded" title="Ativar Selecionados"><CheckCircle className="w-4 h-4"/></button>
                  <button onClick={() => handleBatchAction('deactivate')} className="p-1 text-amber-600 hover:bg-amber-100 rounded" title="Desativar Selecionados"><Ban className="w-4 h-4"/></button>
                  <button onClick={() => handleBatchAction('delete')} className="p-1 text-red-600 hover:bg-red-100 rounded" title="Excluir Selecionados"><Trash2 className="w-4 h-4"/></button>
                  <button onClick={() => setSelectedPharmacyIds([])} className="p-1 text-gray-500 hover:bg-gray-100 rounded"><X className="w-4 h-4"/></button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <button 
                onClick={handleSyncData} 
                disabled={isSyncing}
                className="p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-gray-200"
                title="Recalcular métricas e sincronizar dados"
              >
                <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={openCreateModal} className="flex-1 md:flex-none bg-emerald-600 text-white px-4 py-2 rounded-md font-medium hover:bg-emerald-700 flex items-center justify-center gap-2">
                <Plus className="w-5 h-5" /> Nova Farmácia
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left w-10">
                  <button 
                    onClick={toggleSelectAll}
                    className="p-1 hover:bg-gray-200 rounded transition-colors"
                  >
                    {selectedPharmacyIds.length === filteredAndSortedPharmacies.length && filteredAndSortedPharmacies.length > 0 ? (
                      <CheckSquare className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => togglePharmacySort('name')}
                >
                  <div className="flex items-center gap-1">
                    Farmácia
                    {pharmacySortField === 'name' && (
                      pharmacySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => togglePharmacySort('city')}
                >
                  <div className="flex items-center gap-1">
                    Local
                    {pharmacySortField === 'city' && (
                      pharmacySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => togglePharmacySort('status')}
                >
                  <div className="flex items-center gap-1">
                    Status
                    {pharmacySortField === 'status' && (
                      pharmacySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Destaques</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loadingTable ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4">
                    <TableSkeleton rows={5} cols={5} />
                  </td>
                </tr>
              ) : filteredAndSortedPharmacies.map((pharmacy) => (
                <tr key={pharmacy.id} className={selectedPharmacyIds.includes(pharmacy.id) ? 'bg-emerald-50/30' : ''}>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => toggleSelectPharmacy(pharmacy.id)}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                    >
                      {selectedPharmacyIds.includes(pharmacy.id) ? (
                        <CheckSquare className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                  </td>
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
                      className="text-blue-600 hover:text-blue-900 bg-blue-50 px-2.5 py-1.5 rounded flex items-center gap-1 inline-flex transition-colors"
                      title="Editar"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => viewLogs(pharmacy)}
                      className="text-purple-600 hover:text-purple-900 bg-purple-50 px-2.5 py-1.5 rounded flex items-center gap-1 inline-flex transition-colors"
                      title="Auditoria"
                    >
                      <History className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => resetPassword(pharmacy)}
                      className="text-amber-600 hover:text-amber-900 bg-amber-50 px-2.5 py-1.5 rounded flex items-center gap-1 inline-flex transition-colors"
                      title="Resetar Senha"
                    >
                      <Key className="w-4 h-4" />
                    </button>
                    {isAdminMaster && (
                      <>
                        {!pharmacy.is_active ? (
                          <button 
                            onClick={() => handleActivate(pharmacy.id)}
                            className="text-emerald-600 hover:text-emerald-900 bg-emerald-50 px-3 py-1 rounded inline-flex transition-colors"
                          >
                            Ativar
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleDeactivate(pharmacy.id)}
                            className="text-amber-600 hover:text-amber-900 bg-amber-50 px-3 py-1 rounded flex items-center gap-1 inline-flex transition-colors"
                            title="Desativar"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                        <button 
                          onClick={() => handleDelete(pharmacy.id)}
                          className="text-red-600 hover:text-red-900 bg-red-50 px-3 py-1 rounded flex items-center gap-1 inline-flex transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
            
            {/* Pagination Controls */}
            <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => setPharmacyPage(Math.max(1, pharmacyPage - 1))}
                  disabled={pharmacyPage === 1}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPharmacyPage(Math.min(totalPages, pharmacyPage + 1))}
                  disabled={pharmacyPage === totalPages}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Mostrando <span className="font-medium">{(pharmacyPage - 1) * PHARMACIES_PER_PAGE + 1}</span> até <span className="font-medium">{Math.min(pharmacyPage * PHARMACIES_PER_PAGE, totalPharmacies)}</span> de{' '}
                    <span className="font-medium">{totalPharmacies}</span> farmácias
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                    <button
                      onClick={() => setPharmacyPage(Math.max(1, pharmacyPage - 1))}
                      disabled={pharmacyPage === 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <span className="sr-only">Anterior</span>
                      <ArrowUp className="w-5 h-5 -rotate-90" />
                    </button>
                    {[...Array(Math.min(5, totalPages))].map((_, i) => {
                      let pageNum = pharmacyPage - 2 + i;
                      if (pageNum <= 0) pageNum = i + 1;
                      if (pageNum > totalPages) return null;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPharmacyPage(pageNum)}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                            pharmacyPage === pageNum
                              ? 'z-10 bg-emerald-50 border-emerald-500 text-emerald-600'
                              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setPharmacyPage(Math.min(totalPages, pharmacyPage + 1))}
                      disabled={pharmacyPage === totalPages}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <span className="sr-only">Próxima</span>
                      <ArrowDown className="w-5 h-5 -rotate-90" />
                    </button>
                  </nav>
                </div>
              </div>
            </div>
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
                  {loadingTable ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-4">
                        <TableSkeleton rows={5} cols={5} />
                      </td>
                    </tr>
                  ) : adminShifts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((shift) => {
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
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              console.log('Action: Requesting delete shift', shift.id);
                              triggerDeleteShiftConfirmation(shift.id);
                            }} 
                            className="text-red-600 hover:text-red-900 bg-red-50 px-3 py-1 rounded inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-4 h-4 pointer-events-none" /> Excluir
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
                {loadingTable ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4">
                      <TableSkeleton rows={3} cols={6} />
                    </td>
                  </tr>
                ) : adminHighlights.map((high) => {
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
                  {loadingTable ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-4">
                        <TableSkeleton rows={5} cols={5} />
                      </td>
                    </tr>
                  ) : filteredSubscribers.length === 0 ? (
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
              {(Object.entries(subscriptionPlans || {}) as [string, { title: string; price: number; [key: string]: any }][])
                .filter(([id]) => id !== 'updated_at')
                .sort(([idA, pA], [idB, pB]) => {
                  const tA = (pA.title||"").toLowerCase();
                  const tB = (pB.title||"").toLowerCase();
                  
                  const isFreeA = pA.price === 0 || tA.includes("gratuito") || tA.includes("grátis") || idA === "free";
                  const isFreeB = pB.price === 0 || tB.includes("gratuito") || tB.includes("grátis") || idB === "free";
                  if (isFreeA && !isFreeB) return -1;
                  if (!isFreeA && isFreeB) return 1;
                  
                  const isAnA = idA.includes("annual") || tA.includes("anual");
                  const isAnB = idB.includes("annual") || tB.includes("anual");
                  if (isAnA && !isAnB) return -1;
                  if (!isAnA && isAnB) return 1;
                  
                  const isMoA = idA.includes("monthly") || tA.includes("mensal");
                  const isMoB = idB.includes("monthly") || tB.includes("mensal");
                  if (isMoA && !isMoB) return -1;
                  if (!isMoA && isMoB) return 1;
                  
                  return pA.price - pB.price;
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
              {isAdminMaster && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Data de Atualização Pública (Master)</label>
                  <input 
                    type="datetime-local" 
                    value={generalConfig.platform_last_update ? new Date(generalConfig.platform_last_update).toISOString().slice(0, 16) : ''} 
                    onChange={e => setGeneralConfig({...generalConfig, platform_last_update: e.target.value ? new Date(e.target.value).toISOString() : ''})}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              )}
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
            <div className="flex items-center gap-2">
              <input 
                type="checkbox"
                id="email_support_active"
                checked={generalConfig.email_support_active ?? true}
                onChange={e => setGeneralConfig({...generalConfig, email_support_active: e.target.checked})}
                className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
              />
              <label htmlFor="email_support_active" className="text-sm font-medium text-gray-700">
                Exibir E-mail de Suporte em 'Fale Conosco'
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
                  {loadingTable ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-4">
                        <TableSkeleton rows={5} cols={4} />
                      </td>
                    </tr>
                  ) : auditLogs.length === 0 ? (
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

      {activeTab === 'api_integration' && isAdminMaster && (
        <div className="space-y-8 animate-fade-in">
          {/* Header */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-2">
              <Key className="w-6 h-6 text-indigo-600" />
              Integração de APIs de Terceiros
            </h2>
            <p className="text-gray-500 text-sm">
              Gere chaves de API seguras e ofereça integração de dados em tempo real para outras plataformas (sistemas públicos de saúde, diretórios médicos, portais parceiros) terem acesso consolidado às farmácias e plantões cadastrados na plataforma.
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* Gerador de Chaves */}
            <div className="xl:col-span-1 space-y-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-indigo-600" />
                  Gerar Nova Integração
                </h3>
                <form onSubmit={handleCreateApiKey} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nome da Plataforma / Aplicação <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Secretaria Municipal de Saúde"
                      value={apiKeyName}
                      onChange={(e) => setApiKeyName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 hover:border-gray-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Descrição / Finalidade
                    </label>
                    <textarea
                      placeholder="Ex: Exibir farmácias abertas e em plantão no telão do hospital municipal."
                      value={apiKeyDesc}
                      onChange={(e) => setApiKeyDesc(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 hover:border-gray-400 transition-colors"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={creatingKey || !apiKeyName.trim()}
                    className="w-full py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    {creatingKey ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Gerando...
                      </>
                    ) : (
                      <>
                        <Key className="w-4 h-4" />
                        Gerar Chave de API
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Listagem de Chaves */}
            <div className="xl:col-span-2 space-y-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-600" />
                  Chaves de Acesso Ativas
                </h3>

                {loadingApiKeys ? (
                  <TableSkeleton rows={3} cols={4} />
                ) : apiKeys.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                    <Key className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm font-medium">Nenhuma chave de API gerada até o momento.</p>
                    <p className="text-gray-400 text-xs mt-1">Crie uma chave ao lado para iniciar as integrações.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Identificação / Plataforma</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Token / Chave</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Uso</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {apiKeys.map((item) => (
                          <tr key={item.id} className="hover:bg-gray-50 transition-all">
                            <td className="px-4 py-4">
                              <div className="font-bold text-gray-900 text-sm">{item.name}</div>
                              {item.description && (
                                <div className="text-xs text-gray-500 mt-1 line-clamp-1 max-w-xs">{item.description}</div>
                              )}
                              <div className="text-[10px] text-gray-400 mt-0.5">Criada em {new Date(item.created_at).toLocaleDateString('pt-BR')}</div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded select-all max-w-[140px] truncate">
                                  {revealedKeys[item.id] ? item.key : '••••••••••••••••••••••••'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setRevealedKeys({ ...revealedKeys, [item.id]: !revealedKeys[item.id] })}
                                  className="px-2 py-1 bg-gray-50 hover:bg-gray-150 border border-gray-200 rounded text-gray-500 transition-all text-[10px] cursor-pointer"
                                  title={revealedKeys[item.id] ? "Ocultar Chave" : "Mostrar Chave"}
                                >
                                  {revealedKeys[item.id] ? "Ocultar" : "Mostrar"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCopyText(item.key, item.id)}
                                  className="p-1 hover:bg-gray-100 rounded text-gray-500 transition-all cursor-pointer"
                                  title="Copiar Token"
                                >
                                  {copyingLink === item.id ? (
                                    <Check className="w-4 h-4 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-center">
                              <div className="text-sm font-bold text-gray-900">{item.usage_count || 0}</div>
                              <div className="text-[10px] text-gray-400">requisições</div>
                              {item.last_used_at && (
                                <div className="text-[9px] text-indigo-500 mt-1 font-medium" title={new Date(item.last_used_at).toLocaleString()}>
                                  Último uso: {new Date(item.last_used_at).toLocaleDateString()}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span className={`px-2 py-0.5 inline-flex text-[10px] leading-5 font-bold rounded-full ${
                                item.status === 'active' 
                                  ? 'bg-emerald-100 text-emerald-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {item.status === 'active' ? 'Ativo' : 'Revogado'}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => handleToggleApiKeyStatus(item.id, item.status)}
                                  className={`px-2 py-1 rounded transition-all text-xs font-semibold border cursor-pointer ${
                                    item.status === 'active'
                                      ? 'border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100'
                                      : 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                                  }`}
                                  title={item.status === 'active' ? 'Revogar Chave' : 'Ativar Chave'}
                                >
                                  {item.status === 'active' ? 'Revogar' : 'Ativar'}
                                </button>
                                <button
                                  onClick={() => handleDeleteApiKey(item.id)}
                                  className="p-1 border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 rounded transition-all cursor-pointer"
                                  title="Excluir Chave"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Playground, Documentação Completa e Prompt para IA */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 space-y-8">
            <div className="border-b border-gray-150 pb-5">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <FileText className="w-6 h-6 text-indigo-600" />
                Hub de Integração e Documentação do Desenvolvedor
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Integre outras plataformas, sistemas governamentais, displays de hospitais municipais ou agentes de IA de forma descomplicada com nossos serviços JSON em alta disponibilidade.
              </p>
            </div>

            {/* Abas e Guias Rápidas (Passo a Passo Interativo) */}
            <div className="space-y-6">
              <h4 className="text-md font-bold text-gray-900 flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-indigo-500" />
                Guia de Integração Passo a Passo (Walkthrough)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 hover:border-indigo-200 transition-all">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold mb-3 text-sm">
                    1
                  </div>
                  <h5 className="font-bold text-gray-900 text-sm mb-1">Chave de API</h5>
                  <p className="text-xs text-gray-500">
                    Gere uma chave de API segura no formulário superior associada à sua plataforma. Nunca compartilhe esse token publicamente.
                  </p>
                </div>
                <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 hover:border-indigo-200 transition-all">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold mb-3 text-sm">
                    2
                  </div>
                  <h5 className="font-bold text-gray-900 text-sm mb-1">Escolha a Rota</h5>
                  <p className="text-xs text-gray-500">
                    Use o endpoint <code className="text-indigo-600">/pharmacies</code> para listagem geral ou o <code className="text-indigo-600">/shifts</code> para consultar plantões ativos hoje.
                  </p>
                </div>
                <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 hover:border-indigo-200 transition-all">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold mb-3 text-sm">
                    3
                  </div>
                  <h5 className="font-bold text-gray-900 text-sm mb-1">Autenticação</h5>
                  <p className="text-xs text-gray-500">
                    Passe a chave no Header <code className="text-[11px] bg-white px-1 py-0.5 rounded border">x-api-key</code> ou na Query String <code className="text-[11px] bg-white px-1 py-0.5 rounded border">?apiKey=TOKEN</code>.
                  </p>
                </div>
                <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 hover:border-indigo-200 transition-all">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold mb-3 text-sm">
                    4
                  </div>
                  <h5 className="font-bold text-gray-900 text-sm mb-1">Boas Práticas</h5>
                  <p className="text-xs text-gray-500">
                    Recomendamos implementar cache local de 15 minutos em sua ponta para evitar rate limit de chamadas repetitivas.
                  </p>
                </div>
              </div>
            </div>

            {/* Prompt de Sistema para IA / Agente Conversacional */}
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-6 rounded-2xl shadow-md space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h4 className="text-lg font-bold flex items-center gap-2">
                    <Star className="w-5 h-5 text-amber-300 animate-pulse" />
                    Prompt de Sistema Otimizado para Agentes de IA & LLMs
                  </h4>
                  <p className="text-xs text-indigo-100 mt-1">
                    Copie este prompt completo para configurar assistentes, GPTs personalizados ou bots do WhatsApp. Ele ensina a IA a consultar esta API de forma impecável.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const promptText = `Você é um assistente de IA especialista em saúde pública e integrações para o portal "Farmácias de Plantão".
Seu objetivo é ler os dados em tempo real enviados através da API de plantões e farmácias e responder de forma extremamente prestativa, confiável e clara aos usuários.

--- ESPECIFICAÇÕES DOS ENDPOINTS ---
1. GET ${window.location.origin}/api/external/v1/pharmacies
   Busca todas as farmácias cadastradas na plataforma.
   Parâmetros úteis:
   - apiKey: OBRIGATÓRIO (Ex: fp_live_...)
   - city: Filtrar por cidade (Ex: Cascavel)
   - state: Filtrar por UF (Ex: PR)
   - limit: Limitar registros (Ex: 10)

2. GET ${window.location.origin}/api/external/v1/shifts
   Obtém a escala consolidada de todas as farmácias em plantão ativo/planejado hoje.

--- REGRAS DE RETORNO DO AGENTE Conversacional ---
- Sempre valide se a farmácia consultada está listada como ativa.
- Forneça o endereço formatado claramente para navegação (Rua, Número, Bairro, CEP e Cidade).
- Se houver latitude e longitude ('coordinates'), mencione que você pode gerar um link de mapa para o motorista.
- Inclua o número ou link do WhatsApp para que o paciente confirme a disponibilidade do remédio antes de se locomover.
- Seja amigável, demonstre empatia com quem busca atendimento e mantenha o tom ético e profissional.`;
                    navigator.clipboard.writeText(promptText);
                    setIsCopiedPrompt(true);
                    showToast('Prompt completo copiado com sucesso!', 'success');
                    setTimeout(() => setIsCopiedPrompt(false), 2500);
                  }}
                  className="px-4 py-2 bg-white text-indigo-700 hover:bg-indigo-50 font-semibold rounded-lg text-xs flex items-center gap-2 shadow-sm transition-all shrink-0 cursor-pointer"
                >
                  {isCopiedPrompt ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      Prompt Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copiar Prompt Completo
                    </>
                  )}
                </button>
              </div>

              <div className="bg-indigo-950/80 p-4 rounded-xl border border-indigo-400/30 text-xs font-mono text-indigo-200 select-all max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {`Você é um assistente de IA especialista em saúde pública e integrações para o portal "Farmácias de Plantão".
Seu objetivo é ler os dados em tempo real enviados através da API de plantões e farmácias e responder de forma extremamente prestativa, confiável e clara aos usuários.

--- ESPECIFICAÇÕES DOS ENDPOINTS ---
1. GET ${window.location.origin}/api/external/v1/pharmacies
   Busca todas as farmácias cadastradas na plataforma.
   Parâmetros úteis:
   - apiKey: OBRIGATÓRIO (Ex: fp_live_...)
   - city: Filtrar por cidade (Ex: Cascavel)
   - state: Filtrar por UF (Ex: PR)
   - limit: Limitar registros (Ex: 10)

2. GET ${window.location.origin}/api/external/v1/shifts
   Obtém a escala consolidada de todas as farmácias em plantão ativo/planejado hoje.

--- REGRAS DE RETORNO DO AGENTE CONVERSACIONAL ---
- Sempre valide se a farmácia consultada está listada como ativa.
- Forneça o endereço formatado claramente para navegação (Rua, Número, Bairro, CEP e Cidade).
- Se houver latitude e longitude ('coordinates'), mencione que você pode gerar um link de mapa para o motorista.
- Inclua o número ou link do WhatsApp para que o paciente confirme a disponibilidade do remédio antes de se locomover.
- Seja amigável, demonstre empatia com quem busca atendimento e mantenha o tom ético e profissional.`}
              </div>
            </div>

            {/* Documentação Detalhada e Exemplo de Código */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Informação dos Endpoints */}
              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 space-y-4">
                <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  Referência Técnica Completa (Endpoints)
                </h4>

                <div className="space-y-4">
                  <div className="border border-gray-200 rounded-lg p-3.5 bg-white space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded">GET</span>
                      <span className="text-[10px] text-gray-400 font-mono">/api/external/v1/pharmacies</span>
                    </div>
                    <div className="font-bold text-xs text-gray-800">Listagem de Farmácias Cadastradas</div>
                    <p className="text-xs text-gray-500">Retorna um array com todas as farmácias ativas organizadas, contendo dados completos de endereço, telefone de contato, localização e status atual.</p>
                    <div className="text-[11px] text-gray-600 pt-1 border-t border-gray-100">
                      <strong className="text-gray-700">Parâmetros opcionais (query):</strong>
                      <ul className="list-disc list-inside pl-1 text-[10px] text-gray-500 space-y-0.5 mt-1">
                        <li><code className="font-mono text-indigo-600">city</code> (Ex: Cascavel)</li>
                        <li><code className="font-mono text-indigo-600">state</code> (Ex: PR - Estado com 2 letras)</li>
                        <li><code className="font-mono text-indigo-600">limit</code> (Ex: 15 - Limite padrão é 50)</li>
                      </ul>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-lg p-3.5 bg-white space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">GET</span>
                      <span className="text-[10px] text-gray-400 font-mono">/api/external/v1/shifts</span>
                    </div>
                    <div className="font-bold text-xs text-gray-800">Escala de Plantões Ativos (Hoje)</div>
                    <p className="text-xs text-gray-500">Busca apenas as farmácias cuja escala e data de atendimento de plantão estão em vigência neste momento para a cidade designada ou em geral.</p>
                    <div className="text-[11px] text-gray-600 pt-1 border-t border-gray-100">
                      <span className="text-[10px] text-indigo-600 font-semibold flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-indigo-500" />
                        Retorna os horários exatos de início e término do plantão em formato ISO.
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Snippets de Integração (Code Switcher) */}
              <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 flex flex-col justify-between text-gray-300">
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-gray-800 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
                      <span className="text-xs font-bold text-white tracking-widest uppercase">Snippets Úteis</span>
                    </div>
                    <div className="flex bg-gray-800 p-0.5 rounded-lg border border-gray-700 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setActiveCodeLang('js')}
                        className={`px-2 py-1 rounded-md font-semibold font-mono transition-all cursor-pointer ${activeCodeLang === 'js' ? 'bg-indigo-600 text-white shadow-sm' : 'hover:text-white text-gray-400'}`}
                      >
                        Fetch (JS)
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveCodeLang('python')}
                        className={`px-2 py-1 rounded-md font-semibold font-mono transition-all cursor-pointer ${activeCodeLang === 'python' ? 'bg-indigo-600 text-white shadow-sm' : 'hover:text-white text-gray-400'}`}
                      >
                        Python
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveCodeLang('curl')}
                        className={`px-2 py-1 rounded-md font-semibold font-mono transition-all cursor-pointer ${activeCodeLang === 'curl' ? 'bg-indigo-600 text-white shadow-sm' : 'hover:text-white text-gray-400'}`}
                      >
                        cURL
                      </button>
                    </div>
                  </div>

                  <div className="font-mono text-xs overflow-x-auto p-2 pt-0 max-h-[220px] select-all bg-gray-950/60 rounded-lg text-emerald-400 leading-relaxed">
                    {activeCodeLang === 'js' && (
                      <pre>{`// JavaScript / Node v18+
const API_URL = "${window.location.origin}/api/external/v1/shifts";
const API_KEY = "${sandboxApiKey || 'SUA_CHAVE_AQUI'}";

fetch(\`\${API_URL}?apiKey=\${API_KEY}\`, {
  headers: {
    'Accept': 'application/json',
    'x-api-key': API_KEY
  }
})
  .then(res => {
    if (!res.ok) throw new Error(\`Erro HTTP: \${res.status}\`);
    return res.json();
  })
  .then(data => console.log("Plantões hoje:", data))
  .catch(err => console.error("Falha na chamada:", err));`}</pre>
                    )}

                    {activeCodeLang === 'python' && (
                      <pre>{`# Python 3 (Requests)
import requests

url = "${window.location.origin}/api/external/v1/shifts"
headers = {
    "Accept": "application/json",
    "x-api-key": "${sandboxApiKey || 'SUA_CHAVE_AQUI'}"
}
params = {
    "apiKey": "${sandboxApiKey || 'SUA_CHAVE_AQUI'}"
}

try:
    res = requests.get(url, headers=headers, params=params)
    res.raise_for_status()
    data = res.json()
    print("Sucesso! Total plantões:", len(data))
except Exception as err:
    print(f"Erro na requisição: {err}")`}</pre>
                    )}

                    {activeCodeLang === 'curl' && (
                      <pre>{`# cURL Line command
curl -X GET "${window.location.origin}/api/external/v1/shifts?apiKey=${sandboxApiKey || 'SUA_CHAVE_AQUI'}" \\
  -H "Accept: application/json" \\
  -H "x-api-key: ${sandboxApiKey || 'SUA_CHAVE_AQUI'}"`}</pre>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-800 flex justify-between items-center text-[10px] text-gray-500">
                  <span>Chave ativa sugerida no código</span>
                  <button
                    type="button"
                    onClick={() => {
                      const text = activeCodeLang === 'js' 
                        ? `const API_URL = "${window.location.origin}/api/external/v1/shifts";\nconst API_KEY = "${sandboxApiKey || 'SUA_CHAVE_AQUI'}";\nfetch(\`\${API_URL}?apiKey=\${API_KEY}\`, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).then(d => console.log(d));`
                        : activeCodeLang === 'python'
                        ? `import requests\nres = requests.get("${window.location.origin}/api/external/v1/shifts", params={"apiKey": "${sandboxApiKey || 'SUA_CHAVE_AQUI'}"})\nprint(res.json())`
                        : `curl "${window.location.origin}/api/external/v1/shifts?apiKey=${sandboxApiKey || 'SUA_CHAVE_AQUI'}"`;
                      handleCopyText(text, 'snippet_code');
                    }}
                    className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer underline hover:no-underline"
                  >
                    <Copy className="w-3 h-3" />
                    Copiar snippet completo
                  </button>
                </div>
              </div>
            </div>

            {/* Simulador Interativo */}
            <div className="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100 space-y-4">
              <h4 className="font-bold text-gray-900 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-indigo-600 animate-spin-slow" />
                Simulador e Depurador de Requisições (Sandbox do Desenvolvedor)
              </h4>
              <p className="text-xs text-gray-600">
                Use este terminal para disparar requisições em tempo real e visualizar a payload JSON que os parceiros e agentes de IA irão receber em seus respectivos servidores.
              </p>

              <div className="bg-white p-5 rounded-xl border border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end animate-fade-in">
                  <div className="md:col-span-3">
                    <label className="block text-xs font-bold text-gray-600 mb-1">Rota de Simulação</label>
                    <select
                      value={sandboxEndpoint}
                      onChange={(e) => {
                        setSandboxEndpoint(e.target.value);
                        setSandboxResponse(null);
                      }}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="/api/external/v1/pharmacies">GET /api/external/v1/pharmacies</option>
                      <option value="/api/external/v1/shifts">GET /api/external/v1/shifts</option>
                    </select>
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-xs font-bold text-gray-600 mb-1">Chave de API Vinculada</label>
                    <select
                      value={sandboxApiKey}
                      onChange={(e) => setSandboxApiKey(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="">-- Selecione uma Chave Gerada --</option>
                      {apiKeys.filter(k => k.status === 'active').map(k => (
                        <option key={k.id} value={k.key}>{k.name} ({k.key.substring(0, 15)}...)</option>
                      ))}
                    </select>
                  </div>

                  {sandboxEndpoint === '/api/external/v1/pharmacies' && (
                    <>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-gray-600 mb-1">Cidade (Opcional)</label>
                        <input
                          type="text"
                          placeholder="Cidade"
                          value={sandboxCity}
                          onChange={(e) => setSandboxCity(e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>
                      <div className="md:col-span-1">
                        <label className="block text-xs font-bold text-gray-600 mb-1">UF</label>
                        <input
                          type="text"
                          maxLength={2}
                          placeholder="UF"
                          value={sandboxStateParam}
                          onChange={(e) => setSandboxStateParam(e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none uppercase"
                        />
                      </div>
                      <div className="md:col-span-1">
                        <label className="block text-xs font-bold text-gray-600 mb-1">Limite</label>
                        <input
                          type="number"
                          placeholder="5"
                          value={sandboxLimit}
                          onChange={(e) => setSandboxLimit(e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>
                    </>
                  )}

                  <div className={`${sandboxEndpoint === '/api/external/v1/pharmacies' ? 'md:col-span-1' : 'md:col-span-5'} flex justify-end`}>
                    <button
                      type="button"
                      onClick={handleTestSandbox}
                      disabled={sandboxLoading || !sandboxApiKey}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded text-xs py-2 px-2 flex items-center justify-center gap-1 font-semibold transition-all cursor-pointer"
                    >
                      {sandboxLoading ? 'Simulando...' : 'Testar API'}
                    </button>
                  </div>
                </div>

                {sandboxResponse && (
                  <div className="mt-4 border border-indigo-100 rounded-lg overflow-hidden animate-fade-in text-[11px] font-mono">
                    <div className="bg-indigo-900 text-indigo-100 px-3 py-1.5 flex justify-between items-center text-[10px]">
                      <span>RESPONSE HEADERS (200 OK - content-type: application/json)</span>
                      <button
                        type="button"
                        onClick={() => handleCopyText(JSON.stringify(sandboxResponse, null, 2), 'sandbox_res')}
                        className="hover:text-white transition-all underline outline-none cursor-pointer"
                      >
                        Copiar Payload JSON
                      </button>
                    </div>
                    <pre className="p-3 bg-gray-950 text-emerald-400 overflow-y-auto max-h-[300px]">
                      {JSON.stringify(sandboxResponse, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            {/* Nova Seção de Diagnósticos, Erros e Suporte Técnico */}
            <div className="border-t border-gray-150 pt-8 grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Resoluções de Erros Comuns */}
              <div className="md:col-span-2 space-y-4">
                <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-indigo-600" />
                  Módulo de Diagnóstico Automático e Tratamento de Erros
                </h4>
                <p className="text-xs text-gray-500">
                  Selecione um código de erro retornado pela API ou cenário operacional para ver instantaneamente a causa comum e como resolver no seu sistema cliente:
                </p>

                <div className="flex gap-2">
                  <select
                    value={diagnosticError}
                    onChange={(e) => setDiagnosticError(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white text-gray-700 outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="all">Ver todos os diagnósticos</option>
                    <option value="400">Status 400: Bad Request / Parâmetros Inválidos</option>
                    <option value="401">Status 401: Unauthorized / Chave Ausente</option>
                    <option value="403">Status 403: Forbidden / Chave Revogada ou Expirada</option>
                    <option value="429">Status 429: Too Many Requests / Rate Limit</option>
                    <option value="500">Status 500: Internal Server Error</option>
                  </select>
                </div>

                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {(diagnosticError === 'all' || diagnosticError === '401') && (
                    <div className="p-4 bg-red-50/70 rounded-xl border border-red-100 text-xs">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-red-800">Cenário HTTP 401 - Unauthorized</span>
                        <span className="text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded font-mono">Chave de API Inválida</span>
                      </div>
                      <p className="text-gray-600 mb-2">A requisição falhou devido à autenticação nula ou chave não localizada na nossa base.</p>
                      <ul className="list-disc list-inside text-gray-500 space-y-0.5">
                        <li>Verifique se você anexou o token no header <code className="font-mono text-[10px]">x-api-key</code>.</li>
                        <li>Confirme se não colou espaços em branco antes ou depois da chave secreta.</li>
                      </ul>
                    </div>
                  )}

                  {(diagnosticError === 'all' || diagnosticError === '403') && (
                    <div className="p-4 bg-amber-50/70 rounded-xl border border-amber-100 text-xs">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-amber-800">Cenário HTTP 403 - Forbidden</span>
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-mono">Chave Suspensa/Revogada</span>
                      </div>
                      <p className="text-gray-600 mb-2">A chave é conhecida, mas seu status atual foi alterado para &apos;Revogado&apos; por um administrador master da plataforma.</p>
                      <ul className="list-disc list-inside text-gray-500 space-y-0.5">
                        <li>Acesse o painel superior e re-ative a respectiva chave de API mudando o status para Ativo.</li>
                        <li>Utilize uma chave válida diferente para testar a chamada.</li>
                      </ul>
                    </div>
                  )}

                  {(diagnosticError === 'all' || diagnosticError === '400') && (
                    <div className="p-4 bg-blue-50/70 rounded-xl border border-blue-100 text-xs">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-blue-800">Cenário HTTP 400 - Bad Request</span>
                        <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono">Falta de Informações</span>
                      </div>
                      <p className="text-gray-600 mb-2">O servidor não pôde decodificar os filtros informados na query string ou payload.</p>
                      <ul className="list-disc list-inside text-gray-500 space-y-0.5">
                        <li>O parâmetro <code className="font-mono text-[10px]">limit</code> deve ser um integrativo numérico válido maior que zero.</li>
                        <li>Certifique-se que o parâmetro <code className="font-mono text-[10px]">state</code> de UF possui exatamente 2 letras se especificado.</li>
                      </ul>
                    </div>
                  )}

                  {(diagnosticError === 'all' || diagnosticError === '429') && (
                    <div className="p-4 bg-indigo-50/70 rounded-xl border border-indigo-100 text-xs">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-indigo-800">Cenário HTTP 429 - Limite de Requisições</span>
                        <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-mono">Rate Limit Estourado</span>
                      </div>
                      <p className="text-gray-600 mb-2">Você realizou chamadas em rajada excedendo o limite concorrente tolerado pelo roteador de entrada do Cloud Run.</p>
                      <ul className="list-disc list-inside text-gray-500 space-y-0.5">
                        <li>Modifique o tempo de requisição e implemente cache local para re-escrever suas rotas de telas de exibição.</li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Canal de Suporte Rápido e Simulação de Atendimento */}
              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 flex flex-col justify-between">
                <div className="space-y-3">
                  <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                    <History className="w-4 h-4 text-indigo-600" />
                    Canal de Suporte do Desenvolvedor
                  </h4>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Sua equipe de TI municipal ou os servidores parceiros estão enfrentando problemas complexos de CORS, latência ou conectividade? Envie uma simulação de ticket de suporte de integração para os Administradores Masters.
                  </p>
                  
                  {/* Formulário Interativo de Suporte */}
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.target as HTMLFormElement;
                    const emailInput = form.querySelector('#suporte-email') as HTMLInputElement;
                    const platformInput = form.querySelector('#suporte-plat') as HTMLInputElement;
                    const descInput = form.querySelector('#suporte-desc') as HTMLTextAreaElement;
                    
                    showToast('Enviando chamado de suporte...', 'info');
                    setTimeout(() => {
                      showToast('Chamado de suporte enviado com sucesso para a equipe de controle!', 'success');
                      if (emailInput) emailInput.value = '';
                      if (platformInput) platformInput.value = '';
                      if (descInput) descInput.value = '';
                    }, 1200);
                  }} className="space-y-2 mt-2">
                    <input
                      id="suporte-email"
                      type="email"
                      required
                      placeholder="Email de Contato"
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-xs bg-white focus:ring-1 focus:ring-indigo-500"
                    />
                    <input
                      id="suporte-plat"
                      type="text"
                      required
                      placeholder="Nome da Plataforma"
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-xs bg-white focus:ring-1 focus:ring-indigo-500"
                    />
                    <textarea
                      id="suporte-desc"
                      required
                      rows={3}
                      placeholder="Descreva sua dúvida técnica..."
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-xs bg-white focus:ring-1 focus:ring-indigo-500"
                    ></textarea>
                    
                    <button
                      type="submit"
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs py-2 font-bold transition-all cursor-pointer shadow-sm text-center flex items-center justify-center gap-1.5"
                    >
                      <Star className="w-3.5 h-3.5" />
                      Enviar Ticket Integrador
                    </button>
                  </form>
                </div>

                <div className="text-[10px] text-gray-400 mt-4 text-center">
                  Nosso tempo médio de resposta técnica é de até 2 horas úteis.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'admins' && isAdminMaster && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-200 gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-emerald-600" />
                Controle de Administradores
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Adicione ou remova privilégios administrativos para gerenciar a plataforma.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <button
                onClick={() => {
                  fetchAvailableUsers();
                  setIsPromoteModalOpen(true);
                }}
                className="bg-white text-emerald-700 border border-emerald-200 px-5 py-2.5 rounded-xl font-semibold hover:bg-emerald-50 flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow cursor-pointer"
              >
                <UserCheck className="w-5 h-5" /> Promover Usuário Existente
              </button>
              <button
                onClick={() => setIsNewAdminModalOpen(true)}
                className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-emerald-700 flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg cursor-pointer"
              >
                <Plus className="w-5 h-5" /> Novo Administrador
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            {loadingAdmins ? (
              <div className="p-8">
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                </div>
              </div>
            ) : admins.length === 0 ? (
              <div className="text-center py-12">
                <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm font-medium">Nenhum administrador encontrado.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Nome</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">E-mail</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Criado em</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {admins.map((adm) => (
                      <tr key={adm.id} className="hover:bg-gray-50 transition-all">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                          {adm.name || 'Sem nome'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {adm.email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {adm.status === 'inactive' ? (
                            <span className="px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800 border border-red-200">
                              Inativo
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Ativo
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {adm.created_at ? new Date(adm.created_at).toLocaleDateString('pt-BR') : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          {firebaseUser?.uid === adm.id ? (
                            <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-semibold border border-emerald-100">
                              Seu Usuário
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleOpenEditAdmin(adm)}
                                className="text-emerald-600 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-all text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                                title="Editar Administrador"
                              >
                                <Edit className="w-3.5 h-3.5" /> Editar
                              </button>
                              <button
                                onClick={() => handleToggleStatusAdmin(adm)}
                                className={`${
                                  adm.status === 'inactive'
                                    ? 'text-emerald-600 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100'
                                    : 'text-amber-600 hover:text-amber-900 bg-amber-50 hover:bg-amber-100'
                                } px-3 py-1.5 rounded-lg transition-all text-xs font-semibold inline-flex items-center gap-1 cursor-pointer`}
                                title={adm.status === 'inactive' ? 'Ativar Administrador' : 'Desativar Administrador'}
                              >
                                {adm.status === 'inactive' ? (
                                  <>
                                    <CheckCircle className="w-3.5 h-3.5" /> Ativar
                                  </>
                                ) : (
                                  <>
                                    <Ban className="w-3.5 h-3.5" /> Desativar
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => handleDeleteAdmin(adm.id)}
                                className="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-all text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                                title="Remover Administrador"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Remover
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Novo Administrador */}
      {isNewAdminModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-all">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-gray-100 overflow-hidden"
          >
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                Novo Administrador
              </h2>
              <button
                onClick={() => setIsNewAdminModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateAdmin} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={newAdminForm.name}
                  onChange={(e) => setNewAdminForm({ ...newAdminForm, name: e.target.value })}
                  placeholder="Ex: João Silva"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-gray-900 placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                <input
                  type="email"
                  required
                  value={newAdminForm.email}
                  onChange={(e) => setNewAdminForm({ ...newAdminForm, email: e.target.value })}
                  placeholder="Ex: admin@exemplo.com"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-gray-900 placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha Provisória</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newAdminForm.password}
                  onChange={(e) => setNewAdminForm({ ...newAdminForm, password: e.target.value })}
                  placeholder="Mínimo de 6 caracteres"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-gray-900 placeholder:text-gray-400"
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsNewAdminModalOpen(false)}
                  className="flex-1 py-2.5 px-4 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-md hover:shadow-lg transition-all"
                >
                  Salvar
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Modal Editar Administrador */}
      {isEditAdminModalOpen && editingAdmin && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-all">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-gray-100 overflow-hidden"
          >
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                Editar Administrador
              </h2>
              <button
                onClick={() => {
                  setIsEditAdminModalOpen(false);
                  setEditingAdmin(null);
                }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateAdmin} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={editAdminForm.name}
                  onChange={(e) => setEditAdminForm({ ...editAdminForm, name: e.target.value })}
                  placeholder="Ex: João Silva"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-gray-900 placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                <input
                  type="email"
                  required
                  value={editAdminForm.email}
                  onChange={(e) => setEditAdminForm({ ...editAdminForm, email: e.target.value })}
                  placeholder="Ex: admin@exemplo.com"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-gray-900 placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nova Senha (opcional)</label>
                <input
                  type="password"
                  minLength={6}
                  value={editAdminForm.password}
                  onChange={(e) => setEditAdminForm({ ...editAdminForm, password: e.target.value })}
                  placeholder="Deixe em branco para não alterar"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-gray-900 placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status da Conta</label>
                <select
                  value={editAdminForm.status}
                  onChange={(e) => setEditAdminForm({ ...editAdminForm, status: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-gray-900 bg-white"
                >
                  <option value="active">Ativo (Acesso Liberado)</option>
                  <option value="inactive">Inativo (Acesso Bloqueado)</option>
                </select>
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditAdminModalOpen(false);
                    setEditingAdmin(null);
                  }}
                  className="flex-1 py-2.5 px-4 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-md hover:shadow-lg transition-all"
                >
                  Salvar
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Modal Promover Usuário Existente */}
      {isPromoteModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-all">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-250"
          >
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-emerald-600" />
                Promover Usuário Existente
              </h2>
              <button
                onClick={() => {
                  setIsPromoteModalOpen(false);
                  setSearchUserTerm('');
                }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500">
                Selecione um usuário cadastrado no sistema para promovê-lo a administrador. Ele terá acesso completo ao painel.
              </p>
              
              <div className="relative">
                <Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por nome ou e-mail..."
                  value={searchUserTerm}
                  onChange={(e) => setSearchUserTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-gray-900 placeholder:text-gray-400 text-sm"
                />
              </div>

              <div className="border border-gray-100 rounded-xl max-h-64 overflow-y-auto divide-y divide-gray-100 bg-gray-50/50">
                {loadingUsers ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
                  </div>
                ) : (() => {
                  const filtered = availableUsers.filter(u => {
                    const term = normalizeString(searchUserTerm).toLowerCase();
                    const name = normalizeString(u.name || '').toLowerCase();
                    const email = normalizeString(u.email || '').toLowerCase();
                    return name.includes(term) || email.includes(term);
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="text-center py-12 text-gray-500 text-sm">
                        Nenhum usuário disponível encontrado.
                      </div>
                    );
                  }

                  return filtered.map((u) => (
                    <div key={u.id} className="flex items-center justify-between p-4 hover:bg-white transition-all bg-white">
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{u.name || 'Sem nome'}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{u.email}</p>
                        <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200/50">
                          {u.role === 'pharmacy' ? 'Farmácia' : u.role || 'Usuário'}
                        </span>
                      </div>
                      <button
                        onClick={() => handlePromoteUser(u)}
                        className="bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border border-emerald-100 hover:border-emerald-600 cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5" /> Promover
                      </button>
                    </div>
                  ));
                })()}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsPromoteModalOpen(false);
                    setSearchUserTerm('');
                  }}
                  className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal de Confirmação de Promoção */}
      {isPromoteConfirmOpen && userToPromote && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60] transition-all">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-gray-100 overflow-hidden"
          >
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                Confirmar Promoção
              </h2>
              <button
                onClick={() => {
                  setIsPromoteConfirmOpen(false);
                  setUserToPromote(null);
                }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed">
                Você tem certeza de que deseja promover o seguinte usuário a <strong className="text-gray-900">Administrador</strong>?
              </p>

              <div className="bg-gray-50 rounded-xl p-4 border border-gray-150 space-y-2">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Nome</span>
                  <span className="text-sm font-bold text-gray-900">{userToPromote.name || 'Sem nome'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">E-mail</span>
                  <span className="text-sm text-gray-700 font-mono">{userToPromote.email}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Função Atual</span>
                  <span className="inline-block mt-0.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-gray-200 text-gray-700 border border-gray-300/30">
                    {userToPromote.role === 'pharmacy' ? 'Farmácia' : userToPromote.role || 'Usuário'}
                  </span>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                <ShieldCheck className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 leading-relaxed">
                  <strong>Atenção:</strong> Esta ação concederá controle completo sobre o sistema, incluindo o gerenciamento de farmácias, plantões, configurações e outros administradores.
                </p>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsPromoteConfirmOpen(false);
                    setUserToPromote(null);
                  }}
                  className="flex-1 py-2.5 px-4 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmPromoteUser}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" /> Promover Admin
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal Nova/Editar Farmácia */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-all">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-100"
          >
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50/50 sticky top-0 bg-white z-10">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-emerald-600" />
                {editingPharmacy ? 'Editar Farmácia' : 'Nova Farmácia'}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSavePharmacy} className="p-8 space-y-6">
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span className="w-8 h-[1px] bg-gray-200"></span>
                    Dados de Acesso
                    <span className="flex-1 h-[1px] bg-gray-200"></span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">E-mail de Login</label>
                      <input 
                        type="email" 
                        required 
                        value={formData.email || ''} 
                        onChange={e => setFormData({...formData, email: e.target.value})} 
                        className="block w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm text-gray-900 placeholder:text-gray-400"
                        placeholder="farmacia@exemplo.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Senha {editingPharmacy && <span className="text-xs text-gray-400 font-normal ml-1">(Deixe em branco para manter)</span>}
                      </label>
                      <input 
                        type="password" 
                        required={!editingPharmacy} 
                        value={formData.password || ''} 
                        onChange={e => setFormData({...formData, password: e.target.value})} 
                        className="block w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm text-gray-900 placeholder:text-gray-400"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span className="w-8 h-[1px] bg-gray-200"></span>
                    Informações da Farmácia
                    <span className="flex-1 h-[1px] bg-gray-200"></span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nome Fantasia</label>
                      <input 
                        type="text" 
                        required 
                        value={formData.name || ''} 
                        onChange={e => setFormData({...formData, name: e.target.value})} 
                        className="block w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm text-gray-900 placeholder:text-gray-400"
                        placeholder="Nome da sua farmácia"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
                      <input 
                        type="text" 
                        value={formData.cnpj || ''} 
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g, '').substring(0, 14);
                          const masked = val.length <= 14 ? val.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/, '$1.$2.$3/$4-$5') : val;
                          setFormData({...formData, cnpj: masked});
                        }} 
                        className="block w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm text-gray-900 font-mono"
                        placeholder="00.000.000/0000-00"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                        <input 
                          type="number" 
                          step="any"
                          value={formData.coordinates?.lat !== undefined && formData.coordinates?.lat !== null ? formData.coordinates.lat : ''} 
                          onChange={e => {
                            const val = e.target.value === '' ? null : parseFloat(e.target.value);
                            setFormData({...formData, coordinates: {...(formData.coordinates || {lat: 0, lng: 0}), lat: val}});
                          }} 
                          className="block w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                        <input 
                          type="number" 
                          step="any"
                          value={formData.coordinates?.lng !== undefined && formData.coordinates?.lng !== null ? formData.coordinates.lng : ''} 
                          onChange={e => {
                            const val = e.target.value === '' ? null : parseFloat(e.target.value);
                            setFormData({...formData, coordinates: {...(formData.coordinates || {lat: 0, lng: 0}), lng: val}});
                          }} 
                          className="block w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm text-gray-900"
                        />
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Descrição / Bio</label>
                      <textarea 
                        value={formData.description || ''} 
                        onChange={e => setFormData({...formData, description: e.target.value})} 
                        rows={3}
                        className="block w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm text-gray-900 placeholder:text-gray-400"
                        placeholder="Conte um pouco sobre a farmácia..."
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center justify-between">
                        Foto / Logo da Farmácia
                        {formData.logo_url && (
                          <button 
                            type="button" 
                            onClick={() => setFormData({...formData, logo_url: ''})}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Remover
                          </button>
                        )}
                      </label>
                      <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 hover:border-emerald-300 transition-colors group">
                        <div className="w-20 h-20 bg-white rounded-xl border border-gray-100 flex items-center justify-center overflow-hidden shadow-inner">
                          {formData.logo_url ? (
                            <img src={formData.logo_url} alt="Logo preview" className="w-full h-full object-contain" />
                          ) : (
                            <Upload className="w-8 h-8 text-gray-300 group-hover:text-emerald-400 transition-colors" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-gray-500 mb-2">Recomendado: 512x512px (PNG ou JPG)</p>
                          <label className="inline-flex items-center px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer shadow-sm active:scale-95 transition-all gap-2">
                             <Upload className="w-4 h-4" />
                             Escolher Arquivo
                             <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                          </label>
                        </div>
                      </div>
                    </div>
                    <div className="md:col-span-2 grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Status da Unidade</label>
                        <select 
                          value={formData.is_active ?? 1} 
                          onChange={e => setFormData({...formData, is_active: parseInt(e.target.value)})}
                          className="block w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm text-gray-900"
                        >
                          <option value={1}>Ativa / Visível</option>
                          <option value={0}>Inativa / Oculta</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Status de Assinatura</label>
                        <select 
                          value={formData.sub_status || 'active'} 
                          onChange={e => setFormData({...formData, sub_status: e.target.value})}
                          className="block w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm text-gray-900"
                        >
                          <option value="active">Ativa</option>
                          <option value="past_due">Atrasada</option>
                          <option value="canceled">Cancelada</option>
                          <option value="unpaid">Não Paga</option>
                        </select>
                      </div>
                    </div>
                    <div className="md:col-span-2 flex items-center gap-2 py-2">
                      <input 
                        type="checkbox" 
                        id="is_24h"
                        checked={!!formData.is_24h}
                        onChange={e => setFormData({...formData, is_24h: e.target.checked})}
                        className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                      />
                      <label htmlFor="is_24h" className="text-sm font-medium text-gray-700">Farmácia 24h (Sempre no Plantão)</label>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Site / LinkedIn (URL)</label>
                      <input 
                        type="url" 
                        value={formData.website || ''} 
                        onChange={e => setFormData({...formData, website: e.target.value})} 
                        className="block w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm text-gray-900 placeholder:text-gray-400"
                        placeholder="https://suafarmacia.com.br"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Telefone Comercial</label>
                      <input 
                        type="text" 
                        required 
                        value={formData.phone || ''} 
                        onChange={e => setFormData({...formData, phone: e.target.value})} 
                        className="block w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp de Atendimento</label>
                      <input 
                        type="text" 
                        required 
                        value={formData.whatsapp || ''} 
                        onChange={e => setFormData({...formData, whatsapp: e.target.value})} 
                        className="block w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm text-gray-900"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span className="w-8 h-[1px] bg-gray-200"></span>
                    Horário Comercial Padrão
                    <span className="flex-1 h-[1px] bg-gray-200"></span>
                  </h3>
                  <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map((day, idx) => {
                      const dayKey = idx.toString();
                      const dayData = formData.operating_hours?.[dayKey] || { open: '08:00', close: '22:00', closed: false };
                      
                      return (
                        <div key={day} className="flex items-center gap-4">
                          <span className="w-10 font-bold text-gray-600">{day}</span>
                          <div className="flex items-center gap-2 flex-1">
                            <input 
                              type="time" 
                              disabled={dayData.closed}
                              value={dayData.open}
                              onChange={e => setFormData({
                                ...formData, 
                                operating_hours: {
                                  ...(formData.operating_hours || {}),
                                  [dayKey]: { ...dayData, open: e.target.value }
                                }
                              })}
                              className="px-2 py-1 border border-gray-200 rounded-lg text-sm disabled:opacity-50"
                            />
                            <span className="text-gray-400">até</span>
                            <input 
                              type="time" 
                              disabled={dayData.closed}
                              value={dayData.close}
                              onChange={e => setFormData({
                                ...formData, 
                                operating_hours: {
                                  ...(formData.operating_hours || {}),
                                  [dayKey]: { ...dayData, close: e.target.value }
                                }
                              })}
                              className="px-2 py-1 border border-gray-200 rounded-lg text-sm disabled:opacity-50"
                            />
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={dayData.closed}
                              onChange={e => setFormData({
                                ...formData, 
                                operating_hours: {
                                  ...(formData.operating_hours || {}),
                                  [dayKey]: { ...dayData, closed: e.target.checked }
                                }
                              })}
                              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="text-xs text-gray-500">Fechado</span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span className="w-8 h-[1px] bg-gray-200"></span>
                    Localização e Endereço
                    <span className="flex-1 h-[1px] bg-gray-200"></span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Logradouro / Rua</label>
                      <input 
                        type="text" 
                        required 
                        value={formData.street || ''} 
                        onChange={e => setFormData({...formData, street: e.target.value})} 
                        className="block w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
                      <input 
                        type="text" 
                        required 
                        value={formData.number || ''} 
                        onChange={e => setFormData({...formData, number: e.target.value})} 
                        className="block w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
                      <input 
                        type="text" 
                        required 
                        value={formData.neighborhood || ''} 
                        onChange={e => setFormData({...formData, neighborhood: e.target.value})} 
                        className="block w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                      <input 
                        type="text" 
                        required 
                        value={formData.city || ''} 
                        onChange={e => setFormData({...formData, city: e.target.value})} 
                        className="block w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm text-gray-900"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                        <input 
                          type="text" 
                          required 
                          maxLength={2} 
                          value={formData.state || ''} 
                          onChange={e => setFormData({...formData, state: e.target.value})} 
                          className="block w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm text-gray-900 uppercase"
                          placeholder="UF"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
                        <input 
                          type="text" 
                          value={formData.cep || ''} 
                          onChange={handleCepChange} 
                          className="block w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm text-gray-900 font-mono" 
                          placeholder="00000-000" 
                          maxLength={9} 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-8 flex flex-col sm:flex-row justify-end gap-4 border-t border-gray-100">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)} 
                  className="px-6 py-3 border border-gray-200 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-all shadow-sm"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-5 h-5" />
                  {editingPharmacy ? 'Atualizar Dados' : 'Criar Cadastro'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
      {/* Modal de Plantão (Admin) */}
      <AnimatePresence>
        {isShiftModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsShiftModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50/50">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-emerald-600" />
                  {editingShiftId ? 'Editar Plantão' : 'Novo Plantão'}
                </h2>
                <button 
                  onClick={() => setIsShiftModalOpen(false)} 
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSaveShift} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Farmácia</label>
                <div className="space-y-2">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      placeholder="Pesquisar farmácia..."
                      value={pharmacyShiftSearch}
                      onChange={e => setPharmacyShiftSearch(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
                    />
                  </div>
                  <select 
                    required 
                    value={shiftForm.pharmacy_id || ''} 
                    onChange={e => setShiftForm({...shiftForm, pharmacy_id: e.target.value})} 
                    className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm bg-white"
                  >
                    <option value="" disabled>Selecione uma farmácia...</option>
                    {allPharmaciesList
                      .filter(p => {
                        const search = pharmacyShiftSearch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                        if (!search) return true;
                        if (search.length < 2) return false;
                        
                        const name = (p.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                        const city = (p.city || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                        const state = (p.state || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                        
                        return name.includes(search) || city.includes(search) || state.includes(search);
                      })
                      .map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.city}/{p.state})</option>
                    ))}
                    {shiftForm.pharmacy_id && !allPharmaciesList.filter(p => {
                      const search = pharmacyShiftSearch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                      if (!search) return true;
                      if (search.length < 2) return false;
                      const name = (p.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                      const city = (p.city || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                      const state = (p.state || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                      return name.includes(search) || city.includes(search) || state.includes(search);
                    }).some(p => p.id === shiftForm.pharmacy_id) && (() => {
                      const p = allPharmaciesList.find(p => p.id === shiftForm.pharmacy_id);
                      if (p) return <option key={p.id} value={p.id}>{p.name} ({p.city}/{p.state})</option>;
                      return null;
                    })()}
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data do Plantão</label>
                <input 
                  type="date" 
                  required 
                  value={shiftForm.date || ''} 
                  onChange={e => setShiftForm({...shiftForm, date: e.target.value})} 
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" 
                />
              </div>
              
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="is_24h" 
                  checked={shiftForm.is_24h || false} 
                  onChange={e => setShiftForm({...shiftForm, is_24h: e.target.checked})} 
                  className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                />
                <label htmlFor="is_24h" className="block text-sm font-medium text-gray-700">Plantão 24 Horas</label>
              </div>

              {!shiftForm.is_24h && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hora Início</label>
                    <input 
                      type="time" 
                      required={!shiftForm.is_24h} 
                      value={shiftForm.start_time || ''} 
                      onChange={e => setShiftForm({...shiftForm, start_time: e.target.value})} 
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hora Fim</label>
                    <input 
                      type="time" 
                      required={!shiftForm.is_24h} 
                      value={shiftForm.end_time || ''} 
                      onChange={e => setShiftForm({...shiftForm, end_time: e.target.value})} 
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" 
                    />
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-between gap-3">
                {editingShiftId && (
                  <button 
                    type="button" 
                    onClick={() => {
                      const idToDelete = editingShiftId;
                      if (idToDelete) {
                        triggerDeleteShiftConfirmation(idToDelete);
                      }
                      setIsShiftModalOpen(false);
                    }} 
                    className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-md hover:bg-red-100 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4 pointer-events-none" /> Excluir Plantão
                  </button>
                )}
                <div className="flex gap-3 ml-auto">
                  <button type="button" onClick={() => setIsShiftModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
                    Cancelar
                  </button>
                  <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700">
                    Salvar
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      )}
</AnimatePresence>

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
                  {(Object.entries(subscriptionPlans || {}) as [string, { title: string; price: number; [key: string]: any }][])
                    .filter(([id]) => id !== 'updated_at')
                    .map(([id, plan]) => (
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

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteConfirmOpen && confirmModalData && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsDeleteConfirmOpen(false);
                setConfirmModalData(null);
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
            >
              <div className="p-8 text-center">
                <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Trash2 className="w-10 h-10" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-3">Confirmar Exclusão</h3>
                <p className="text-gray-600 mb-8 leading-relaxed">
                  Tem certeza que deseja excluir este {confirmModalData.type === 'shift' ? 'registro de plantão' : confirmModalData.type === 'highlight' ? 'destaque' : 'registro'}? 
                  Esta ação é irreversível e o dado será removido do sistema.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => {
                      setIsDeleteConfirmOpen(false);
                      setConfirmModalData(null);
                    }}
                    className="px-4 py-3 border border-gray-200 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-all active:scale-95"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={processDeletion}
                    className="px-4 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-all shadow-lg shadow-red-200 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-5 h-5" /> Excluir
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Auditoria */}
      <AnimatePresence>
        {isAuditModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <History className="w-6 h-6 text-purple-600" />
                    Histórico de Auditoria
                  </h3>
                  <p className="text-sm text-gray-500">{editingPharmacy?.name} • {editingPharmacy?.city}</p>
                </div>
                <button onClick={() => setIsAuditModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {isLoadingLogs ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <RefreshCw className="w-10 h-10 text-emerald-500 animate-spin" />
                    <p className="text-gray-500 animate-pulse font-medium">Carregando histórico...</p>
                  </div>
                ) : currentPharmacyLogs.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 italic">
                    Nenhum registro encontrado para esta farmácia.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {currentPharmacyLogs.map((log) => (
                      <div key={log.id} className="relative pl-8 pb-6 border-l-2 border-gray-100 last:pb-0">
                        <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-emerald-500 z-10"></div>
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex justify-between items-start mb-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              log.action === 'update' ? 'bg-amber-100 text-amber-700' :
                              log.action === 'activate' ? 'bg-emerald-100 text-emerald-700' :
                              log.action === 'deactivate' ? 'bg-orange-100 text-orange-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {log.action}
                            </span>
                            <span className="text-[10px] font-mono text-gray-400">
                              {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-2 bg-gray-50 p-2 rounded font-mono overflow-x-auto">
                            {JSON.stringify(log.details)}
                          </p>
                          <div className="mt-2 text-[10px] text-gray-400">
                            ID Admin: {log.admin_id}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Link de Reset */}
      <AnimatePresence>
        {copyingLink && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center"
            >
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Key className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Link Gerado com Sucesso!</h3>
              <p className="text-sm text-gray-500 mb-6">Copie o link abaixo e envie para o responsável pela farmácia para que ele possa redefinir a própria senha.</p>
              
              <div className="relative mb-6">
                <input 
                  type="text" 
                  readOnly 
                  value={copyingLink}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600 focus:outline-none"
                />
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(copyingLink);
                    showToast('Link copiado!', 'success');
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>

              <button 
                onClick={() => setCopyingLink(null)}
                className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all"
              >
                Fechar
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
